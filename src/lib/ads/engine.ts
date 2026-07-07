import { buildAdPlan, type AdEngineConfig, type AdPlan, type AdPlanInput } from './engine-core'

/**
 * Server-side ad decision engine (architecture.md §4, PROJECT_BRIEF §6).
 *
 * Every page request computes ONE AdPlan server-side (routes are
 * force-dynamic) from: visitor region/adSet (geo.ts), consent state
 * (consent.ts), CDP profile (cdp.ts — only when accepted), and the current
 * category. Components then render the plan — no client-side targeting logic.
 *
 * The pure decision core (types, buildAdPlan, decisionFor, adsenseAt,
 * feedAdPositions, …) lives in engine-core.ts — client-bundle-safe (v2.1
 * §8.9: FeedStream renders PostBatch/AdSlot on the client) and re-exported
 * here unchanged, so `@/lib/ads/engine` remains the stable server-facing
 * API. This module adds ONLY the request-time config I/O: getAdPlan() loads
 * the site-config global (Redis-cached 5 min) and never throws — any failure
 * degrades to a no-unit, npa, contextual plan (empty slots still reserve
 * space — AdSense review is pending anyway).
 */

export * from './engine-core'

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
 * for infrastructure hiccups). Dynamic imports keep this module cheap to
 * import from unit tests without server deps.
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
