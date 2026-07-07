import type { ConsentState } from '@/lib/consent'

import { blendKeywords, contextualKeywords } from './keywords'

/**
 * Server-side ad decision engine (architecture.md §4, PROJECT_BRIEF §6).
 *
 * Every page request computes ONE AdPlan server-side (routes are
 * force-dynamic) from: visitor region/adSet (geo.ts), consent state
 * (consent.ts), CDP profile (cdp.ts — only when accepted), and the current
 * category. Components then render the plan — no client-side targeting logic.
 *
 * Consent rules (PROJECT_BRIEF §6.3/§8 — non-negotiable):
 * - consent !== 'accepted' ⇒ npa=true (non-personalized AdSense) and keywords
 *   are CONTEXTUAL only (derived from the category, never from the visitor).
 * - consent === 'accepted' + profile ⇒ blend top profile interests with the
 *   current category (category first). Gated additionally by site-config
 *   behaviouralTargeting.enabled.
 *
 * The pure decision core is buildAdPlan(input, config) — unit-tested with a
 * mocked config. getAdPlan() is the request-time wrapper that loads the
 * site-config global (Redis-cached 5 min) and never throws: any failure
 * degrades to a no-unit, npa, contextual plan (empty slots still reserve
 * space — AdSense review is pending anyway).
 */

// ---------------------------------------------------------------------------
// Contract types (architecture.md §4)
// ---------------------------------------------------------------------------

export type AdPlacement = 'feed' | 'article' | 'article-end' | 'rail' | 'leaderboard'

/**
 * Placements the engine actually PLANS (design direction v2 §4.4): the
 * sidebar is gone, so 'rail' remains in the AdPlacement union ONLY for
 * compatibility (fixed architecture.md §4 signature + historical site-config
 * rows) — it is never emitted in an AdPlan and the UI never renders it.
 * 'article-end' is the end-of-article slot on both article types (v2 §3.5),
 * planned separately from the in-article 'article' slot so each can carry its
 * own configured unit.
 */
export const AD_PLACEMENTS: readonly AdPlacement[] = [
  'feed',
  'article',
  'article-end',
  'leaderboard',
]

export interface AdSenseDecision {
  /** AdSense ad-unit id — undefined until units exist (review pending) ⇒ the slot renders reserved-empty. */
  unitId?: string
  /** Slot format key — interpreted by AdSenseUnit ('fluid', 'in-article', 'rectangle', 'horizontal', 'auto', 'WxH', …). */
  format: string
  /** Non-personalized ads flag — true whenever consent !== 'accepted'. */
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
  /** In-feed ad frequency for the visitor's region (UK:3, RO:5, default:4 seeded). */
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

/** Fallback when no adFrequency row matches and no 'default' row exists. */
export const DEFAULT_EVERY_NTH = 4

/**
 * Per-placement default formats when a site-config unit row leaves `format`
 * empty (and for the inert pre-approval decision). AdSenseUnit maps these to
 * the concrete <ins> attributes (PROJECT_BRIEF §6.4, design direction v2
 * §4.4): feed → 'fluid' (in-feed), article → 'in-article',
 * article-end → 'rectangle' (300×250 fixed), leaderboard → 'horizontal'
 * (responsive banner: 320×100 <768px / 728×90 ≥768px, CSS-sized by AdSlot).
 * 'rail' keeps its v1 default only because the Record is total over the
 * union — the placement is never planned.
 */
export const DEFAULT_FORMAT: Record<AdPlacement, string> = {
  feed: 'fluid',
  article: 'in-article',
  'article-end': 'rectangle',
  rail: 'rectangle',
  leaderboard: 'horizontal',
}

/**
 * Amazon placements (§6.2): product ads sit beside content, never in-feed and
 * never in the top banner. v2: the sidebar rail is gone — its Amazon
 * inventory moved to the end-of-article slot.
 */
const AMAZON_PLACEMENTS: ReadonlySet<AdPlacement> = new Set(['article', 'article-end'])

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

function amazonDecisionFor(
  placement: AdPlacement,
  keywords: string[],
  marketplace: string,
  config: AdEngineConfig,
): AmazonDecision | undefined {
  if (!AMAZON_PLACEMENTS.has(placement)) return undefined
  if (keywords.length === 0) return undefined
  // The partnerTag MUST match the request marketplace (PROJECT_BRIEF §6.4) —
  // no tag for this marketplace ⇒ no Amazon ad, AdSense keeps the slot.
  const tag = config.amazonPartnerTags.find(
    (row) => row.marketplace.trim().toLowerCase() === marketplace.toLowerCase(),
  )
  if (!tag) return undefined
  return { keywords, marketplace, partnerTag: tag.tag }
}

/**
 * Pure AdPlan builder — everything getAdPlan() decides, minus the config I/O.
 * One decision per placement; every decision carries an AdSense fallback
 * (unitId only when site-config has a unit for that placement — review is
 * pending, so seeded config has none and slots render reserved-empty).
 */
export function buildAdPlan(input: AdPlanInput, config: AdEngineConfig): AdPlan {
  const npa = input.consent !== 'accepted'
  const keywords = resolveKeywords(input, config)
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
    const amazon = amazonDecisionFor(placement, keywords, marketplace, config)
    return {
      placement,
      network: amazon ? ('amazon' as const) : ('adsense' as const),
      adsense,
      ...(units.length > 0 ? { adsenseUnits: units } : {}),
      ...(amazon ? { amazon } : {}),
    }
  })

  return { everyNth: resolveEveryNth(input.region, config), slots }
}

// ---------------------------------------------------------------------------
// Request-time wrapper (site-config global, Redis-cached)
// ---------------------------------------------------------------------------

const AD_CONFIG_CACHE_TTL_SEC = 5 * 60

/** Empty-but-valid config: npa/contextual plan, reserved-empty slots. */
const FALLBACK_CONFIG: AdEngineConfig = {
  adUnitIds: [],
  amazonPartnerTags: [],
  adFrequency: [],
  behaviouralTargetingEnabled: false,
}

/**
 * site-config → AdEngineConfig, Redis-cached 5 min. Never throws: a Payload/
 * Redis failure degrades to FALLBACK_CONFIG — an ad must never block a read
 * (PROJECT_BRIEF §8: refusing/failing ads never blocks the site; same spirit
 * for infrastructure hiccups). Dynamic imports keep this module's pure core
 * importable from client components and unit tests without server deps.
 */
async function getAdEngineConfig(): Promise<AdEngineConfig> {
  try {
    const [{ cacheJson, rkey }, { getPayloadClient }] = await Promise.all([
      import('@/lib/redis'),
      import('@/lib/payload'),
    ])
    return await cacheJson(rkey('ads', 'config'), AD_CONFIG_CACHE_TTL_SEC, async () => {
      const payload = await getPayloadClient()
      const config = await payload.findGlobal({ slug: 'site-config', depth: 0 })
      return {
        adUnitIds: (config.adNetworks?.adUnitIds ?? []).map(({ slot, unitId, format }) => ({
          slot,
          unitId,
          format: format ?? null,
        })),
        amazonPartnerTags: (config.adNetworks?.amazonPartnerTags ?? []).map(
          ({ marketplace, tag }) => ({ marketplace, tag }),
        ),
        adFrequency: (config.adFrequency ?? []).map(({ region, everyNth }) => ({
          region,
          everyNth,
        })),
        behaviouralTargetingEnabled: config.behaviouralTargeting?.enabled ?? true,
      }
    })
  } catch {
    return FALLBACK_CONFIG
  }
}

/**
 * The per-request ad decision (architecture.md §4):
 *
 *   const geo = await resolveGeo(await headers())
 *   const consent = await readConsent(await cookies())
 *   const profile = consent === 'accepted' && vid ? await getProfile(vid) : null
 *   const adPlan = await getAdPlan({ ...geo, categorySlug, consent, profile })
 */
export async function getAdPlan(input: AdPlanInput): Promise<AdPlan> {
  return buildAdPlan(input, await getAdEngineConfig())
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
