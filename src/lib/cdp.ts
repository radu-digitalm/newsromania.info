import { getPayloadClient } from '@/lib/payload'
import { cacheJson, getRedis, rkey } from '@/lib/redis'
import type { CdpProfile } from '@/payload-types'

/**
 * First-party CDP service layer (architecture.md §4, PROJECT_BRIEF §7).
 *
 * STRICTLY consent-gated: nothing in this module is reachable for a visitor
 * without an explicit 'accepted' choice — the /api/cdp/events route validates
 * consent BEFORE calling trackEvents(), and the visitor identity is the
 * HttpOnly `nr_vid` cookie minted only on acceptance (src/lib/consent.ts).
 *
 * The module has three layers:
 *   1. pure validation + interest-decay math (no I/O — shared with the
 *      profiles worker and unit tests);
 *   2. trackEvents(events) — batch insert into `cdp-events`;
 *   3. getProfile(visitorId) — `cdp-profiles` read, Redis-cached 10 min
 *      under rkey('profile', visitorId).
 */

// ---------------------------------------------------------------------------
// Event shapes & limits
// ---------------------------------------------------------------------------

/** Whitelist per architecture.md §3 `cdp-events`. Anything else is dropped. */
export const CDP_EVENT_TYPES = [
  'page_view',
  'article_click',
  'scroll_depth',
  'time_on_page',
  'category_read',
  'ad_impression',
  'ad_click',
] as const

export type CdpEventType = (typeof CDP_EVENT_TYPES)[number]

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(CDP_EVENT_TYPES)

/** A client-submitted event AFTER validation (still unattributed). */
export interface CdpEventInput {
  type: CdpEventType
  path: string
  articleId: string | null
  category: string | null
  value: number | null
}

/** A validated event enriched server-side — ready for insertion. */
export interface CdpTrackedEvent extends CdpEventInput {
  visitorId: string
  region: string
  ts: string
}

/** Mirror of the client queue cap — the server never accepts more per POST. */
export const MAX_EVENTS_PER_BATCH = 20

/** The only scroll_depth values the client emits (once each per page). */
export const SCROLL_DEPTH_STEPS = [25, 50, 75, 100] as const

/** time_on_page is seconds; a day is the sanity ceiling. */
export const MAX_TIME_ON_PAGE_SEC = 86_400

/** Generic ceiling for ad_impression/ad_click counters. */
const MAX_GENERIC_VALUE = 1_000_000

const MAX_PATH_LENGTH = 500

/** `nr_vid` is a randomUUID(); accept uuid-shaped ids only. */
const VISITOR_ID_RE = /^[A-Za-z0-9-]{8,64}$/

const ARTICLE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/

/** Category slugs are ro-slugified ASCII (src/lib/slugify.ts). */
const CATEGORY_RE = /^[a-z0-9-]{1,80}$/

// ---------------------------------------------------------------------------
// Validation (manual, zod-less — architecture §5)
// ---------------------------------------------------------------------------

export function isValidVisitorId(value: unknown): value is string {
  return typeof value === 'string' && VISITOR_ID_RE.test(value)
}

/**
 * Path sanity: same-site pathname only — starts with a single '/', printable
 * ASCII, no whitespace/control chars, ≤ 500 chars. Rejects absolute URLs and
 * protocol-relative ('//…') values.
 */
export function isValidEventPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_PATH_LENGTH &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    /^\/[!-~]*$/.test(value)
  )
}

function validValue(type: CdpEventType, raw: unknown): number | null | undefined {
  // undefined = invalid (drop the event); null = "no value" (fine).
  if (type === 'scroll_depth') {
    return typeof raw === 'number' && (SCROLL_DEPTH_STEPS as readonly number[]).includes(raw)
      ? raw
      : undefined
  }
  if (type === 'time_on_page') {
    return typeof raw === 'number' &&
      Number.isFinite(raw) &&
      raw >= 0 &&
      raw <= MAX_TIME_ON_PAGE_SEC
      ? Math.round(raw)
      : undefined
  }
  if (type === 'ad_impression' || type === 'ad_click') {
    if (raw === undefined || raw === null) return null
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= MAX_GENERIC_VALUE
      ? raw
      : undefined
  }
  // page_view / article_click / category_read carry no numeric value.
  return null
}

/**
 * Validate ONE raw client event. Returns the normalized event, or null when
 * anything is off (unknown type, bad path, out-of-bounds value, weird ids) —
 * invalid events are dropped individually, never rejected as a batch.
 */
export function validateEventInput(raw: unknown): CdpEventInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { type, path, articleId, category, value } = raw as Record<string, unknown>

  if (typeof type !== 'string' || !EVENT_TYPE_SET.has(type)) return null
  const eventType = type as CdpEventType

  if (!isValidEventPath(path)) return null

  let cleanArticleId: string | null = null
  if (articleId !== undefined && articleId !== null) {
    if (typeof articleId !== 'string' || !ARTICLE_ID_RE.test(articleId)) return null
    cleanArticleId = articleId
  }

  let cleanCategory: string | null = null
  if (category !== undefined && category !== null) {
    if (typeof category !== 'string') return null
    const slug = category.toLowerCase()
    if (!CATEGORY_RE.test(slug)) return null
    cleanCategory = slug
  }

  const cleanValue = validValue(eventType, value)
  if (cleanValue === undefined) return null

  return {
    type: eventType,
    path,
    articleId: cleanArticleId,
    category: cleanCategory,
    value: cleanValue,
  }
}

/**
 * Validate a raw `events` payload: non-arrays yield [], the batch is capped
 * at MAX_EVENTS_PER_BATCH and invalid entries are silently dropped.
 */
export function validateEventBatch(raw: unknown): CdpEventInput[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_EVENTS_PER_BATCH)
    .map(validateEventInput)
    .filter((event): event is CdpEventInput => event !== null)
}

// ---------------------------------------------------------------------------
// Interest weights & decay (pure — shared with scripts/worker/profiles.mjs)
// ---------------------------------------------------------------------------

/** Per-run decay applied to existing interest weights before adding counts. */
export const INTEREST_DECAY = 0.9

/** Weights below this are pruned after decay — keeps the JSON small. */
export const MIN_INTEREST_WEIGHT = 0.05

/** How much each event type contributes to its category's interest weight. */
export const EVENT_WEIGHTS: Readonly<Record<CdpEventType, number>> = {
  page_view: 1,
  category_read: 2,
  article_click: 3,
  scroll_depth: 0,
  time_on_page: 0,
  ad_impression: 0,
  ad_click: 0,
}

/**
 * Sum event weights per category for one aggregation batch. Events without a
 * category (or with weight 0) contribute nothing.
 */
export function interestCounts(
  events: Array<{ type: string; category?: string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const event of events) {
    if (!event.category || !EVENT_TYPE_SET.has(event.type)) continue
    const weight = EVENT_WEIGHTS[event.type as CdpEventType]
    if (weight <= 0) continue
    counts[event.category] = (counts[event.category] ?? 0) + weight
  }
  return counts
}

/** Defensive read of a stored `interests` JSON blob (unknown shape in DB). */
export function sanitizeInterests(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const clean: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      clean[key] = value
    }
  }
  return clean
}

/**
 * New interests = existing × decay + new counts (architecture §7 profile
 * aggregation). Categories absent from `counts` still decay; weights that
 * fall under MIN_INTEREST_WEIGHT are pruned. Values rounded to 4 decimals.
 */
export function decayInterests(
  existing: unknown,
  counts: Record<string, number>,
  decay: number = INTEREST_DECAY,
): Record<string, number> {
  const base = sanitizeInterests(existing)
  const next: Record<string, number> = {}
  for (const [category, weight] of Object.entries(base)) {
    next[category] = weight * decay
  }
  for (const [category, added] of Object.entries(counts)) {
    if (!Number.isFinite(added) || added <= 0) continue
    next[category] = (next[category] ?? 0) + added
  }
  const pruned: Record<string, number> = {}
  for (const [category, weight] of Object.entries(next)) {
    if (weight >= MIN_INTEREST_WEIGHT) {
      pruned[category] = Math.round(weight * 10_000) / 10_000
    }
  }
  return pruned
}

// ---------------------------------------------------------------------------
// trackEvents — batch insert (consent already validated by the caller/route)
// ---------------------------------------------------------------------------

/**
 * Insert a batch of enriched events into `cdp-events`. Never throws: the
 * /api/cdp/events route must answer 204 no matter what — a failed insert is
 * logged and skipped. Returns how many events were actually stored.
 */
export async function trackEvents(events: CdpTrackedEvent[]): Promise<number> {
  if (events.length === 0) return 0
  let stored = 0
  try {
    const payload = await getPayloadClient()
    for (const event of events.slice(0, MAX_EVENTS_PER_BATCH)) {
      try {
        await payload.create({
          collection: 'cdp-events',
          data: {
            visitorId: event.visitorId,
            type: event.type,
            path: event.path,
            articleId: event.articleId,
            category: event.category,
            value: event.value,
            region: event.region,
            ts: event.ts,
          },
          depth: 0,
          overrideAccess: true,
        })
        stored += 1
      } catch (err) {
        console.error('[cdp] insert eșuat:', err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    console.error('[cdp] trackEvents indisponibil:', err instanceof Error ? err.message : err)
  }
  return stored
}

// ---------------------------------------------------------------------------
// getProfile — Redis-cached 10 min
// ---------------------------------------------------------------------------

export const PROFILE_CACHE_TTL_SEC = 10 * 60

/** Cache key contract — the profiles worker deletes these on upsert/purge. */
export function profileCacheKey(visitorId: string): string {
  return rkey('profile', visitorId)
}

export interface CdpProfileData {
  visitorId: string
  interests: Record<string, number>
  lastRegion: string | null
  lastSeenAt: string | null
  visits: number
  consentState: string
}

function mapProfile(doc: CdpProfile): CdpProfileData {
  return {
    visitorId: doc.visitorId,
    interests: sanitizeInterests(doc.interests),
    lastRegion: doc.lastRegion ?? null,
    lastSeenAt: doc.lastSeenAt ?? null,
    visits: doc.visits ?? 0,
    consentState: doc.consentState ?? 'unknown',
  }
}

/**
 * Aggregated visitor profile for the ad engine. Redis-cached 10 min under
 * `newsromania:profile:<visitorId>` (negative lookups cached too). Returns
 * null for unknown/malformed ids or when the profile does not exist yet —
 * callers degrade to contextual (non-behavioural) targeting.
 */
export async function getProfile(visitorId: string): Promise<CdpProfileData | null> {
  if (!isValidVisitorId(visitorId)) return null
  try {
    return await cacheJson(profileCacheKey(visitorId), PROFILE_CACHE_TTL_SEC, async () => {
      const payload = await getPayloadClient()
      const res = await payload.find({
        collection: 'cdp-profiles',
        where: { visitorId: { equals: visitorId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const doc = res.docs[0]
      return doc ? mapProfile(doc) : null
    })
  } catch (err) {
    console.error('[cdp] getProfile eșuat:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Drop the cached profile (worker calls this after every upsert/purge). */
export async function invalidateProfileCache(visitorId: string): Promise<void> {
  try {
    await getRedis().del(profileCacheKey(visitorId))
  } catch {
    // cache invalidation is best-effort; TTL (10 min) is the backstop
  }
}
