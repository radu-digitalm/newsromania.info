import { cookies, headers } from 'next/headers'

import { getProfile } from '@/lib/cdp'
import { readConsent, VISITOR_COOKIE_NAME } from '@/lib/consent'
import { resolveGeo } from '@/lib/geo'

import { getAdPlan, type AdPlan } from './engine'

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
