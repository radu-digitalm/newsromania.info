import { cookies, headers } from 'next/headers'

import { getProfile } from '@/lib/cdp'
import { VISITOR_COOKIE_NAME } from '@/lib/consent'
import { readConsent } from '@/lib/consent-server'
import { resolveGeo } from '@/lib/geo'
import { amazonOrdinalsForBatch } from '@/lib/feed-serialize'

import { resolveAmazonProduct, type AmazonProduct } from './amazon'
import { decisionFor, getAdPlan, type AdPlan } from './engine'

/**
 * Per-request AdPlan for server components (architecture.md §4/§6) — the one
 * place where geo, consent, CDP profile and the ad engine meet. Pages call
 * this (routes are force-dynamic, so it runs on every request) and hand the
 * plan to FeedList / AdSlot.
 *
 * GDPR gate (PROJECT_BRIEF §6.3/§8): the nr_vid cookie is read and the CDP
 * profile fetched ONLY when the nr_consent cookie says 'accepted'. Refused/
 * unknown visitors get npa + contextual keywords and NOTHING about them is
 * looked up — same page, same content, generic ads.
 *
 * R6b (owner geo preview): `countryOverride` is the ?geo=<CC> query param the
 * SSR pages read and pass through to resolveGeo — honored ONLY under AD_PREVIEW
 * (resolveGeo enforces the gate), so /stiri/<slug>?geo=fr previews amazon.fr
 * products for the owner without letting real visitors force their ad region.
 */
export async function getRequestAdPlan(
  categorySlug?: string,
  options?: { countryOverride?: string | null },
): Promise<AdPlan> {
  const [headersList, cookieStore] = await Promise.all([headers(), cookies()])
  const [geo, consent] = await Promise.all([
    resolveGeo(headersList, options?.countryOverride),
    readConsent(cookieStore),
  ])

  const visitorId = consent === 'accepted' ? cookieStore.get(VISITOR_COOKIE_NAME)?.value : undefined
  const profile = consent === 'accepted' && visitorId ? await getProfile(visitorId) : null

  return getAdPlan({
    region: geo.region,
    adSet: geo.adSet,
    country: geo.country,
    categorySlug,
    consent,
    profile,
  })
}

/**
 * Resolve the Amazon products for a feed batch's AMAZON-ordinal ad-posts
 * (owner v2.4, 2 AdSense : 1 Amazon in the infinite scroll) — server-only:
 * Amazon products come from lib/ads/amazon.ts (Redis/SDK), so both the SSR
 * pages and the /api/feed route resolve them HERE and ship the plain serialized
 * cards to the client. Returns a map keyed by 0-based stream ordinal (only the
 * every-3rd amazon slots), so batchEntries/PostBatch can render each one.
 *
 * Reuses the plan's single 'feed' AmazonDecision (keywords/marketplace/tag) for
 * every slot in the batch — one resolution per distinct ordinal, all in
 * parallel, each behind the 800ms budget + Redis cache in resolveAmazonProduct.
 * No feed AmazonDecision (no matching partnerTag) ⇒ empty map ⇒ every ad slot
 * stays AdSense. A slot whose product does not resolve is simply omitted (the
 * client degrades it to AdSense — never an empty Amazon box).
 */
export async function resolveFeedAmazonProducts(
  adPlan: AdPlan | null,
  { itemCount, adOrdinalStart }: { itemCount: number; adOrdinalStart: number },
): Promise<Record<number, AmazonProduct>> {
  if (!adPlan) return {}
  const feed = decisionFor(adPlan, 'feed')
  if (!feed?.amazon) return {}
  const ordinals = amazonOrdinalsForBatch(adPlan.everyNth, itemCount, adOrdinalStart)
  if (ordinals.length === 0) return {}

  const amazon = feed.amazon
  // variant = the slot's index among this stream's amazon ordinals, so the
  // house bestseller set rotates across feed slots (no repeated product).
  const resolved = await Promise.all(
    ordinals.map((ordinal) => resolveAmazonProduct(amazon, Math.floor(ordinal / 3))),
  )
  const products: Record<number, AmazonProduct> = {}
  ordinals.forEach((ordinal, i) => {
    const product = resolved[i]
    if (product) products[ordinal] = product
  })
  return products
}
