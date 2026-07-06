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

export type AdPlacement = 'feed' | 'article' | 'rail' | 'leaderboard'

export const AD_PLACEMENTS: readonly AdPlacement[] = ['feed', 'article', 'rail', 'leaderboard']

export interface AdSenseDecision {
  /** AdSense ad-unit id — undefined until units exist (review pending) ⇒ the slot renders reserved-empty. */
  unitId?: string
  /** data-ad-format value ('auto', 'rectangle', 'horizontal', …). */
  format: string
  /** Non-personalized ads flag — true whenever consent !== 'accepted'. */
  npa: boolean
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

/** Reserved-slot default formats (match AdSlot's fixed heights — zero CLS). */
const DEFAULT_FORMAT: Record<AdPlacement, string> = {
  feed: 'rectangle',
  article: 'rectangle',
  rail: 'rectangle',
  leaderboard: 'horizontal',
}

/** Amazon placements (§6.2): product ads sit beside content, never in-feed. */
const AMAZON_PLACEMENTS: ReadonlySet<AdPlacement> = new Set(['rail', 'article'])

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
    const unit = config.adUnitIds.find((row) => row.slot === placement)
    const adsense: AdSenseDecision = {
      unitId: unit?.unitId || undefined,
      format: unit?.format || DEFAULT_FORMAT[placement],
      npa,
    }
    const amazon = amazonDecisionFor(placement, keywords, marketplace, config)
    return {
      placement,
      network: amazon ? ('amazon' as const) : ('adsense' as const),
      adsense,
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
