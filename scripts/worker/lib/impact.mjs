/**
 * Impact-of-the-hour selection (PROJECT_BRIEF §9a).
 *
 * Pure functions, zero I/O — unit-tested in tests/social.test.ts with injected
 * clock + candidate lists. The worker (scripts/worker/social.mjs) owns all
 * Payload/LLM calls; the "which single story matters most this hour" decision
 * lives here and is fully deterministic.
 *
 * The score rewards, in descending weight:
 *   1. cross-source cluster size — how many outlets ran the same story (via
 *      clusterKey). Many independent publishers covering one event is the
 *      strongest signal that it matters; this dominates the score.
 *   2. source tier — a story first seen at a tier-1 national outlet outranks a
 *      niche/local one at equal coverage.
 *   3. has-image — a card with a real photo gets far more social reach.
 *   4. recency — freshest wins ties (a story published 3 minutes ago beats one
 *      from 55 minutes ago).
 *
 * Only items PUBLISHED in the last hour are eligible. If that hour is thin
 * (no eligible item has a real image), we fall back to the NEWEST item that
 * has an image; if none has an image, the newest item overall.
 */

/**
 * Source tiers by outlet name (normalized, diacritics-insensitive substring
 * match). Tier 1 = national wire/broadcast/reference dailies; tier 2 = strong
 * nationals/business/sport verticals; everything else (locals, niche) = tier 3
 * via DEFAULT_TIER. Tuned to the feeds actually ingested (see aggregated-items
 * sourceName distribution). Extend as feeds are added.
 */
export const SOURCE_TIERS = [
  { match: 'agerpres', tier: 1 },
  { match: 'news.ro', tier: 1 },
  { match: 'digi24', tier: 1 },
  { match: 'protv', tier: 1 },
  { match: 'stirile pro', tier: 1 },
  { match: 'observator', tier: 1 },
  { match: 'hotnews', tier: 1 },
  { match: 'g4media', tier: 1 },
  { match: 'adevarul', tier: 1 },
  { match: 'libertatea', tier: 2 },
  { match: 'gandul', tier: 2 },
  { match: 'ziarul financiar', tier: 2 },
  { match: 'zf.ro', tier: 2 },
  { match: 'bursa', tier: 2 },
  { match: 'business magazin', tier: 2 },
  { match: 'digi sport', tier: 2 },
  { match: 'prosport', tier: 2 },
  { match: 'sport.ro', tier: 2 },
  { match: 'fanatik', tier: 2 },
]

/** Tier assigned to any source not matched in SOURCE_TIERS (locals/niche). */
export const DEFAULT_TIER = 3

/** Originals are the redaction's own journalism — treated as top tier. */
export const ORIGINAL_TIER = 1

/** Window of eligibility: only items published within the last hour. */
export const IMPACT_WINDOW_MINUTES = 60

/**
 * Score weights. Cluster size dominates (each extra outlet adds CLUSTER_WEIGHT,
 * uncapped); tier and image are one-off bumps; recency only ever breaks ties
 * (bounded strictly below a single cluster step so coverage always wins).
 */
export const CLUSTER_WEIGHT = 10
export const TIER_WEIGHT = 3 // × (4 − tier): tier1→9, tier2→6, tier3→3
export const IMAGE_BONUS = 4
export const RECENCY_MAX = 2 // < CLUSTER_WEIGHT, so recency never outranks coverage

/**
 * Normalize an outlet name for tier lookup: lowercase, diacritics stripped
 * (comma-below ș/ț and legacy cedilla via NFD), collapsed whitespace.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function normalizeSource(name) {
  if (typeof name !== 'string') return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Editorial tier of a source name (1 = highest). Unknown → DEFAULT_TIER.
 *
 * @param {unknown} sourceName
 * @returns {number} 1..3
 */
export function sourceTier(sourceName) {
  const norm = normalizeSource(sourceName)
  if (!norm) return DEFAULT_TIER
  for (const { match, tier } of SOURCE_TIERS) {
    if (norm.includes(match)) return tier
  }
  return DEFAULT_TIER
}

/**
 * Is an ISO/Date/epoch timestamp within the last `windowMinutes` of `now`?
 * Future-dated items (bad publisher clocks) count as "just now" (recent).
 *
 * @param {string | number | Date} publishedAt
 * @param {number} nowMs — epoch ms (injected in tests)
 * @param {number} [windowMinutes]
 * @returns {boolean}
 */
export function withinLastHour(publishedAt, nowMs, windowMinutes = IMPACT_WINDOW_MINUTES) {
  const ts = new Date(publishedAt).getTime()
  if (Number.isNaN(ts)) return false
  const ageMs = nowMs - ts
  if (ageMs < 0) return true // future clock skew → treat as current
  return ageMs <= windowMinutes * 60 * 1000
}

/**
 * Recency sub-score in [0, RECENCY_MAX]: linear from RECENCY_MAX (published
 * exactly now) down to 0 (published a full window ago). Only breaks ties.
 *
 * @param {string | number | Date} publishedAt
 * @param {number} nowMs
 * @param {number} [windowMinutes]
 * @returns {number}
 */
export function recencyScore(publishedAt, nowMs, windowMinutes = IMPACT_WINDOW_MINUTES) {
  const ts = new Date(publishedAt).getTime()
  if (Number.isNaN(ts)) return 0
  const windowMs = windowMinutes * 60 * 1000
  const ageMs = Math.min(Math.max(nowMs - ts, 0), windowMs)
  return RECENCY_MAX * (1 - ageMs / windowMs)
}

/**
 * Impact score of a single candidate. Higher = more impactful.
 *
 * @param {object} cand
 * @param {number} cand.clusterSize — outlets covering this cluster (≥ 1)
 * @param {number} cand.tier — editorial tier (1 best)
 * @param {boolean} cand.hasImage
 * @param {string | number | Date} cand.publishedAt
 * @param {number} nowMs
 * @param {number} [windowMinutes]
 * @returns {number}
 */
export function impactScore(cand, nowMs, windowMinutes = IMPACT_WINDOW_MINUTES) {
  const clusterSize = Number.isFinite(cand.clusterSize) ? Math.max(1, cand.clusterSize) : 1
  const tier = Number.isFinite(cand.tier) ? cand.tier : DEFAULT_TIER
  const cluster = CLUSTER_WEIGHT * (clusterSize - 1)
  const tierScore = TIER_WEIGHT * (4 - tier)
  const image = cand.hasImage ? IMAGE_BONUS : 0
  const recency = recencyScore(cand.publishedAt, nowMs, windowMinutes)
  return cluster + tierScore + image + recency
}

/**
 * Given cluster keys of ALL recent items (the clustering window, e.g. 48h),
 * count how many items share each key → the cross-source cluster size. Items
 * with no clusterKey are singletons (size 1, keyed by their own id/refId).
 *
 * @param {Array<{ clusterKey?: string | null }>} items
 * @returns {Map<string, number>} clusterKey → count
 */
export function countClusters(items) {
  const counts = new Map()
  for (const item of items) {
    const key = typeof item.clusterKey === 'string' ? item.clusterKey.trim() : ''
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * Select the single most impactful story published in the last hour.
 *
 * @param {Array<object>} candidates — normalized items, each:
 *   { refId, contentType, title, clusterKey?, clusterSize, tier, hasImage,
 *     publishedAt, ... } (extra fields carried through untouched).
 * @param {object} opts
 * @param {number} opts.nowMs — injected clock
 * @param {number} [opts.windowMinutes]
 * @returns {{ story: object, score: number, reason: string } | null}
 *   null only when `candidates` is empty.
 */
export function selectImpactStory(candidates, { nowMs, windowMinutes = IMPACT_WINDOW_MINUTES }) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const eligible = candidates.filter((c) => withinLastHour(c.publishedAt, nowMs, windowMinutes))

  if (eligible.length > 0) {
    let best = null
    for (const cand of eligible) {
      const score = impactScore(cand, nowMs, windowMinutes)
      if (
        best === null ||
        score > best.score ||
        // Deterministic tie-break: newer publishedAt, then lexicographic refId.
        (score === best.score && newerOrSmaller(cand, best.story))
      ) {
        best = { story: cand, score }
      }
    }
    return { story: best.story, score: best.score, reason: 'impact-of-the-hour' }
  }

  // Thin hour → fall back to the newest item WITH an image, else newest overall.
  const withImage = candidates.filter((c) => c.hasImage)
  const pool = withImage.length > 0 ? withImage : candidates
  const reason = withImage.length > 0 ? 'fallback-newest-with-image' : 'fallback-newest'
  let newest = pool[0]
  for (const cand of pool) {
    if (newerOrSmaller(cand, newest)) newest = cand
  }
  return { story: newest, score: impactScore(newest, nowMs, windowMinutes), reason }
}

/**
 * Tie-break predicate: is `a` "before" `b`? Newer publishedAt wins; equal
 * timestamps fall back to the lexicographically smaller refId (stable order).
 *
 * @param {{ publishedAt: string | number | Date, refId?: string }} a
 * @param {{ publishedAt: string | number | Date, refId?: string }} b
 * @returns {boolean}
 */
export function newerOrSmaller(a, b) {
  const ta = new Date(a.publishedAt).getTime()
  const tb = new Date(b.publishedAt).getTime()
  const va = Number.isNaN(ta) ? -Infinity : ta
  const vb = Number.isNaN(tb) ? -Infinity : tb
  if (va !== vb) return va > vb
  return String(a.refId ?? '') < String(b.refId ?? '')
}
