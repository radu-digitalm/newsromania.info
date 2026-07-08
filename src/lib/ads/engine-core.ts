import type { ConsentState } from '@/lib/consent'

import { hasCategoryBias } from './house-category'
import { blendKeywords, contextualKeywords, topInterests } from './keywords'

/**
 * Pure ad-decision core (architecture.md §4) — types, constants, and the
 * side-effect-free helpers of the ad engine. Split out of engine.ts in v2.1
 * (§8.9): the social stream renders PostBatch/AdSlot inside a client
 * component (FeedStream), so everything the client bundle touches must be
 * free of server-only imports (payload/redis/node:crypto). engine.ts keeps
 * the request-time getAdPlan() wrapper and re-exports this module, so the
 * server-facing API is unchanged.
 *
 * Consent rules (PROJECT_BRIEF §6.3/§8):
 * - Ad personalization (npa) is NO LONGER governed by our own consent state.
 *   Since the CMP reconciliation (2026-07) Google's certified CMP + Consent
 *   Mode v2 own AdSense personalization end-to-end, so buildAdPlan hard-sets
 *   npa=false and lets the CMP decide (forcing npa from our now-always-'unknown'
 *   readConsent would wrongly serve non-personalized ads to CMP-consented
 *   users and fight the CMP). See engine-core npa note below.
 * - Behavioural KEYWORDS remain consent-gated on our OWN state as a belt-and-
 *   braces guard for the (currently dormant) first-party CDP profile: without
 *   an explicit 'accepted' the profile is NEVER consulted — contextual
 *   (page-derived) keywords only. With our banner retired consent is always
 *   'unknown', so this path is contextual-only in practice.
 * - consent === 'accepted' + profile ⇒ blend top profile interests with the
 *   current category (category first). Gated additionally by site-config
 *   behaviouralTargeting.enabled.
 */

// ---------------------------------------------------------------------------
// Contract types (architecture.md §4)
// ---------------------------------------------------------------------------

export type AdPlacement = 'feed' | 'article' | 'article-end' | 'rail' | 'leaderboard'

/**
 * Placements the engine actually PLANS (design direction v2 §4.4 + v2.2):
 * 'rail' is planned again since v2.2 — the desktop-only (lg+) sticky rail
 * column beside the centered feed on home + category pages (SideRailAd).
 * Pages that have no rail (article pages, /cautare which never gets a plan)
 * simply do not render the decision. 'article-end' is the end-of-article
 * slot on both article types (v2 §3.5), planned separately from the
 * in-article 'article' slot so each can carry its own configured unit.
 */
export const AD_PLACEMENTS: readonly AdPlacement[] = [
  'feed',
  'article',
  'article-end',
  'rail',
  'leaderboard',
]

export interface AdSenseDecision {
  /** AdSense ad-unit id — undefined until units exist (review pending) ⇒ the slot renders reserved-empty. */
  unitId?: string
  /** Slot format key — interpreted by AdSenseUnit ('fluid', 'in-article', 'rectangle', 'horizontal', 'auto', 'WxH', …). */
  format: string
  /**
   * Non-personalized ads flag. Since the CMP reconciliation (2026-07) this is
   * always false: Google's certified CMP + Consent Mode v2 govern AdSense
   * personalization, so we NO LONGER force npa from our own consent. Kept on
   * the decision only so the rendered slot stays auditable (data-npa attribute)
   * and the wire DTO shape is unchanged.
   */
  npa: boolean
}

/** One configured AdSense unit for a placement (site-config adNetworks.adUnitIds row). */
export interface AdSenseUnitRef {
  unitId: string
  format: string
}

export interface AmazonDecision {
  /** Product-search keywords (contextual, or consent-gated behavioural blend). */
  keywords: string[]
  /** e.g. 'www.amazon.co.uk' — per-request, must match partnerTag. */
  marketplace: string
  /** Associates tracking id valid for that marketplace. */
  partnerTag: string
  /**
   * Ordered site-category slugs the HOUSE-fallback product selector should bias
   * toward (owner fix round — products chosen "based on cookies + content"),
   * strongest first: the consent-approved CDP profile's top interests when
   * present, else the current article/feed category. Empty ⇒ no bias (pure
   * rotation). Never read on the LIVE Creators-API path (it already returns a
   * contextual product); used only by houseProductsForMarketplace selection in
   * resolveAmazonProduct. Consent-gated exactly like `keywords`' behavioural
   * blend — the profile is folded in only when consent === 'accepted'.
   */
  preferredCategories?: string[]
}

export interface AdDecision {
  placement: AdPlacement
  network: 'adsense' | 'amazon' | 'house'
  adsense?: AdSenseDecision
  amazon?: AmazonDecision
  /**
   * ALL site-config units mapped to this placement, in config order — present
   * only when at least one is configured. `adsense` above carries units[0];
   * call sites rendering the same placement more than once per page rotate
   * through these deterministically via adsenseAt(decision, positionIndex).
   */
  adsenseUnits?: AdSenseUnitRef[]
}

export interface AdPlan {
  /** In-feed ad frequency for the visitor's region (v2.2: every 3rd post for ALL regions, owner-tunable). */
  everyNth: number
  slots: AdDecision[]
}

/** Structural subset of cdp.ts getProfile()'s CdpProfileData — all the engine needs. */
export interface AdProfile {
  interests: Record<string, number>
}

export interface AdPlanInput {
  /** Region key from resolveGeo() ('UK', 'RO', 'default', …). */
  region: string
  /** Ad-set key from resolveGeo() (reserved for adSet-specific creative rules). */
  adSet: string
  /** ISO country from resolveGeo() — drives the Amazon marketplace. Falls back to region. */
  country?: string
  /** Current category (article/category pages); undefined on the homepage. */
  categorySlug?: string
  consent: ConsentState
  /** CDP profile — pass ONLY when consent === 'accepted' (callers + engine both gate). */
  profile?: AdProfile | null
}

/** The slice of the site-config global the engine decides from (mockable in tests). */
export interface AdEngineConfig {
  adUnitIds: Array<{ slot: AdPlacement; unitId: string; format?: string | null }>
  amazonPartnerTags: Array<{ marketplace: string; tag: string }>
  adFrequency: Array<{ region: string; everyNth: number }>
  behaviouralTargetingEnabled: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fallback when no adFrequency row matches and no 'default' row exists —
 * aligned with the v2.2 owner decision: an ad block between max 3 news.
 */
export const DEFAULT_EVERY_NTH = 3

/**
 * Per-placement default formats when a site-config unit row leaves `format`
 * empty (and for the inert pre-approval decision). AdSenseUnit maps these to
 * the concrete <ins> attributes (PROJECT_BRIEF §6.4, design direction v2
 * §4.4): feed → 'fluid' (in-feed), article → 'in-article',
 * article-end → 'rectangle' (300×250 fixed), leaderboard → 'horizontal'
 * (responsive banner: 320×100 <768px / 728×90 ≥768px, CSS-sized by AdSlot),
 * rail → '300x600' (v2.2 desktop skyscraper; a site-config row may override
 * it to 'rectangle'/'300x250' — SideRailAd reserves height per format).
 */
export const DEFAULT_FORMAT: Record<AdPlacement, string> = {
  feed: 'fluid',
  article: 'in-article',
  'article-end': 'rectangle',
  rail: '300x600',
  leaderboard: 'horizontal',
}

/**
 * Amazon-eligible placements (§6.2). v2.4 (owner: 2 AdSense : 1 Amazon on
 * EVERY ad slot, incl. the infinite-scroll feed) — the per-slot network is no
 * longer decided by the placement but by the slot's 0-based ORDINAL via
 * networkForOrdinal(): every 3rd slot (ordinal % 3 === 2) is Amazon. So the
 * 'feed' placement now ALSO carries an AmazonDecision (keywords/marketplace/
 * partnerTag) — the amazon-ordinal feed ad-posts resolve a real product from
 * it (server-side, serialized into the /api/feed batch). Only the top
 * 'leaderboard' banner stays AdSense-only (a product banner in the top slot
 * reads as chrome — kept out). Product ads still never sit between a title and
 * its attribution (page-level placement ethics, unchanged).
 */
const AMAZON_PLACEMENTS: ReadonlySet<AdPlacement> = new Set([
  'feed',
  'article',
  'article-end',
  'rail',
])

/**
 * Ad-slot network by 0-based ordinal — the owner's 2 AdSense : 1 Amazon ratio
 * (v2.4), applied EVERYWHERE ad slots appear (home/category feed incl. the
 * infinite scroll, article body, related-news, rail). Pattern: adsense,
 * adsense, amazon, adsense, adsense, amazon, … (ordinal % 3 === 2 ⇒ amazon).
 *
 * Pure + deterministic so the SAME ordinal always picks the SAME network on
 * SSR page 1 and across every client scroll batch — the feed's cumulative
 * ordinal (adOrdinalStart + position) keys straight into this, so the 2:1
 * pattern holds unbroken across page boundaries. An amazon-ordinal slot only
 * RENDERS Amazon when the engine actually resolved an AmazonDecision for the
 * placement (partnerTag matches the marketplace, keywords resolved); with no
 * decision it degrades to the always-present AdSense fallback — the ratio is a
 * target, never a reason to show an empty Amazon box.
 */
export function networkForOrdinal(ordinal: number): 'adsense' | 'amazon' {
  const n = Number.isFinite(ordinal) && ordinal >= 0 ? Math.floor(ordinal) : 0
  return n % 3 === 2 ? 'amazon' : 'adsense'
}

/**
 * Generic shopping keywords for the desktop side rail (R1) when the page has
 * no contextual/behavioural keywords of its own — the homepage has no category
 * and refused/unknown visitors have no profile, yet the rail must still show
 * Amazon inventory (the home page's network mix). Article placements keep the
 * strict contextual gate (no keywords ⇒ AdSense keeps the slot) so an ad next
 * to the body is always page-relevant; only the always-present rail leans on
 * this fallback. amazon.de-appropriate generic terms (RO/unmatched buy there).
 */
const RAIL_FALLBACK_KEYWORDS: readonly string[] = ['recomandări Amazon', 'oferte']

/**
 * Placements that fall back to generic shopping keywords when the page has no
 * contextual/behavioural keywords of its own (v2.4): the always-present desktop
 * rail AND the infinite-scroll feed — the homepage has no category, yet its
 * amazon-ordinal feed slots (every 3rd, §networkForOrdinal) must still resolve
 * a product. Article placements keep the strict contextual gate (no keywords ⇒
 * AdSense keeps the slot) so an ad next to the body is always page-relevant.
 */
const AMAZON_FALLBACK_PLACEMENTS: ReadonlySet<AdPlacement> = new Set(['rail', 'feed'])

/**
 * Country → Amazon marketplace (PROJECT_BRIEF §6.4; no amazon.ro — RO and
 * everything unmatched buy on amazon.de). 'UK' is accepted as an alias for
 * GB because localeRules regions use 'UK'.
 */
const MARKETPLACE_BY_COUNTRY: Readonly<Record<string, string>> = {
  GB: 'www.amazon.co.uk',
  UK: 'www.amazon.co.uk',
  FR: 'www.amazon.fr',
  US: 'www.amazon.com',
}

export const DEFAULT_MARKETPLACE = 'www.amazon.de'

export function marketplaceForCountry(country?: string | null): string {
  const key = country?.trim().toUpperCase()
  return (key && MARKETPLACE_BY_COUNTRY[key]) || DEFAULT_MARKETPLACE
}

// ---------------------------------------------------------------------------
// Pure decision core
// ---------------------------------------------------------------------------

function resolveEveryNth(region: string, config: AdEngineConfig): number {
  const rows = config.adFrequency
  const norm = region.trim().toLowerCase()
  const match =
    rows.find((row) => row.region.trim().toLowerCase() === norm) ??
    rows.find((row) => row.region.trim().toLowerCase() === 'default')
  const everyNth = match?.everyNth ?? DEFAULT_EVERY_NTH
  // Guard against a misconfigured 0/negative value turning every row into an ad.
  return Number.isFinite(everyNth) && everyNth >= 1 ? Math.floor(everyNth) : DEFAULT_EVERY_NTH
}

function resolveKeywords(input: AdPlanInput, config: AdEngineConfig): string[] {
  const behavioural =
    input.consent === 'accepted' && input.profile != null && config.behaviouralTargetingEnabled
  // GDPR (§6.3/§8): without an explicit 'accepted' the profile is NEVER
  // consulted — contextual (page-derived) keywords only.
  return behavioural
    ? blendKeywords({ categorySlug: input.categorySlug, interests: input.profile?.interests })
    : contextualKeywords(input.categorySlug)
}

/**
 * Ordered site-category slugs the house-fallback product selector should bias
 * toward (owner fix round — "based on cookies + content"), strongest first:
 *   1. the consent-approved CDP profile's top interests (same gate as the
 *      behavioural keyword blend — profile consulted ONLY when consent ===
 *      'accepted' AND behaviouralTargeting is enabled);
 *   2. the current article/feed category.
 * De-duplicated; only slugs that actually carry a department bias are kept (an
 * unmappable slug would never re-order anything). Empty ⇒ pure rotation.
 */
function resolvePreferredCategories(input: AdPlanInput, config: AdEngineConfig): string[] {
  const behavioural =
    input.consent === 'accepted' && input.profile != null && config.behaviouralTargetingEnabled
  const ordered: string[] = []
  if (behavioural) ordered.push(...topInterests(input.profile?.interests))
  if (input.categorySlug) ordered.push(input.categorySlug)
  const seen = new Set<string>()
  const preferred: string[] = []
  for (const slug of ordered) {
    if (seen.has(slug) || !hasCategoryBias(slug)) continue
    seen.add(slug)
    preferred.push(slug)
  }
  return preferred
}

function amazonDecisionFor(
  placement: AdPlacement,
  keywords: string[],
  marketplace: string,
  config: AdEngineConfig,
  preferredCategories: string[],
): AmazonDecision | undefined {
  if (!AMAZON_PLACEMENTS.has(placement)) return undefined
  // The rail and the feed (v2.4) always carry Amazon on home/category; when the
  // page has no keywords of its own they fall back to generic shopping terms so
  // the every-3rd-slot Amazon inventory always resolves. Article placements
  // keep the strict gate — no keywords ⇒ AdSense keeps the slot.
  const resolved =
    keywords.length > 0
      ? keywords
      : AMAZON_FALLBACK_PLACEMENTS.has(placement)
        ? [...RAIL_FALLBACK_KEYWORDS]
        : []
  if (resolved.length === 0) return undefined
  // The partnerTag MUST match the request marketplace (PROJECT_BRIEF §6.4) —
  // no tag for this marketplace ⇒ no Amazon ad, AdSense keeps the slot.
  const tag = config.amazonPartnerTags.find(
    (row) => row.marketplace.trim().toLowerCase() === marketplace.toLowerCase(),
  )
  if (!tag) return undefined
  return {
    keywords: resolved,
    marketplace,
    partnerTag: tag.tag,
    ...(preferredCategories.length > 0 ? { preferredCategories } : {}),
  }
}

/**
 * Pure AdPlan builder — everything getAdPlan() decides, minus the config I/O.
 * One decision per placement; every decision carries an AdSense fallback
 * (unitId only when site-config has a unit for that placement — review is
 * pending, so seeded config has none and slots render reserved-empty).
 */
export function buildAdPlan(input: AdPlanInput, config: AdEngineConfig): AdPlan {
  // CMP reconciliation (2026-07): personalization is governed by Google's
  // certified CMP + Consent Mode v2, never by our own consent state. We hard-
  // set npa=false and let the CMP decide — forcing it from our now-always-
  // 'unknown' readConsent would serve non-personalized ads to CMP-consented
  // users (revenue loss) and fight the CMP.
  const npa = false
  const keywords = resolveKeywords(input, config)
  const preferredCategories = resolvePreferredCategories(input, config)
  const marketplace = marketplaceForCountry(input.country ?? input.region)

  const slots: AdDecision[] = AD_PLACEMENTS.map((placement) => {
    // site-config adNetworks.adUnitIds rows map 1:1 to placements by `slot`;
    // several rows on the same placement = a rotation pool (config order).
    const units: AdSenseUnitRef[] = config.adUnitIds
      .filter((row) => row.slot === placement && row.unitId)
      .map((row) => ({ unitId: row.unitId, format: row.format || DEFAULT_FORMAT[placement] }))
    const adsense: AdSenseDecision = {
      unitId: units[0]?.unitId,
      format: units[0]?.format ?? DEFAULT_FORMAT[placement],
      npa,
    }
    const amazon = amazonDecisionFor(placement, keywords, marketplace, config, preferredCategories)
    // Placement-level `network` = how a SINGLE-slot placement dispatches at
    // render time (article/article-end/rail → ArticleAdSlot/SideRailAd read it
    // directly). The 'feed' placement is MULTI-slot: its per-slot network is
    // decided by networkForOrdinal(ordinal) at render, not here — so feed stays
    // network 'adsense' (its ordinals 0,1 are adsense) even though it carries an
    // AmazonDecision for the amazon-ordinal slots (§2.4). All other placements
    // keep the placement = network mapping.
    const network: 'amazon' | 'adsense' = amazon && placement !== 'feed' ? 'amazon' : 'adsense'
    return {
      placement,
      network,
      adsense,
      ...(units.length > 0 ? { adsenseUnits: units } : {}),
      ...(amazon ? { amazon } : {}),
    }
  })

  return { everyNth: resolveEveryNth(input.region, config), slots }
}

/** Convenience: the (single) decision for a placement out of a plan. */
export function decisionFor(plan: AdPlan, placement: AdPlacement): AdDecision | undefined {
  return plan.slots.find((slot) => slot.placement === placement)
}

/**
 * The AdSense decision for the `index`-th rendering of a placement on a page
 * (0-based position index: 1st in-feed slot = 0, 2nd = 1, …). Deterministic
 * rotation: with N configured units the position picks units[index mod N] —
 * same request, same page, same index ⇒ always the same unit (no randomness,
 * so server + client render identically). With 0/1 units it degrades to the
 * plan's single decision, npa carried through unchanged.
 */
export function adsenseAt(
  decision: AdDecision | undefined,
  index: number = 0,
): AdSenseDecision | undefined {
  const adsense = decision?.adsense
  if (!adsense) return undefined
  const units = decision?.adsenseUnits
  if (!units || units.length === 0) return adsense
  const safeIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0
  const unit = units[safeIndex % units.length]
  return { ...adsense, unitId: unit.unitId, format: unit.format }
}

/**
 * In-feed injection positions for a page of `itemCount` rows: after rows
 * n, 2n, 3n (1-indexed), capped at 3 ads per page (§6.2), never after the
 * final row.
 */
export const MAX_FEED_ADS_PER_PAGE = 3

export function feedAdPositions(everyNth: number, itemCount: number): Set<number> {
  const positions = new Set<number>()
  if (!Number.isFinite(everyNth) || everyNth < 1) return positions
  for (let k = 1; k <= MAX_FEED_ADS_PER_PAGE; k++) {
    const position = k * Math.floor(everyNth)
    if (position >= itemCount) break // never after (or past) the final row
    positions.add(position)
  }
  return positions
}
