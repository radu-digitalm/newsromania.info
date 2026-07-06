/**
 * Near-duplicate clustering for aggregated items (architecture.md §7).
 *
 * Pure helpers, zero I/O — unit-tested in tests/ingest-cluster.test.ts.
 *
 * clusterKey = normalized title (lowercase, no diacritics, alphanumeric words
 * joined by single spaces). Two stories from different outlets are considered
 * the same event when the Jaccard similarity of their normalized word sets is
 * ≥ 0.6 AND the existing story was published within the last 48 hours. The
 * EARLIEST story is kept; later near-duplicates are skipped (their clusterKey
 * simply reuses the existing one).
 */

export const CLUSTER_SIMILARITY_THRESHOLD = 0.6
export const CLUSTER_WINDOW_HOURS = 48

/**
 * Normalize a Romanian headline into a cluster key: lowercase, comma-below
 * (ș, ț) and legacy cedilla (ş, ţ) diacritics stripped via NFD, everything
 * non-alphanumeric collapsed to single spaces.
 *
 * @param {string} title
 * @returns {string} e.g. „Guvernul a aprobat Bugetul!” → 'guvernul a aprobat bugetul'
 */
export function normalizeTitle(title) {
  if (typeof title !== 'string') return ''
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Word set of a normalized (or raw — it re-normalizes) title.
 * @param {string} title
 * @returns {Set<string>}
 */
export function wordSet(title) {
  const normalized = normalizeTitle(title)
  return new Set(normalized.length > 0 ? normalized.split(' ') : [])
}

/**
 * Jaccard similarity |A ∩ B| / |A ∪ B| of two sets. Empty-vs-anything is 0
 * (an empty headline must never cluster with everything).
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} in [0, 1]
 */
export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const word of a) {
    if (b.has(word)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Is `publishedAt` within the last `windowHours` relative to `now`?
 * Future-dated items (bad publisher clocks) still count as "recent".
 *
 * @param {string | number | Date} publishedAt
 * @param {number} [now] epoch ms (injectable for tests)
 * @param {number} [windowHours]
 * @returns {boolean}
 */
export function withinWindow(publishedAt, now = Date.now(), windowHours = CLUSTER_WINDOW_HOURS) {
  const ts = new Date(publishedAt).getTime()
  if (Number.isNaN(ts)) return false
  return now - ts <= windowHours * 60 * 60 * 1000
}

/**
 * Find the cluster an incoming headline belongs to, if any.
 *
 * @param {string} title incoming item title
 * @param {Array<{ title?: string | null, clusterKey?: string | null,
 *   publishedAt: string | number | Date }>} candidates existing items
 * @param {{ now?: number, windowHours?: number, threshold?: number }} [opts]
 * @returns {{ clusterKey: string, similarity: number } | null} the matched
 *   cluster (highest similarity; ties broken by earliest publishedAt), or
 *   null when the item starts a new cluster.
 */
export function findCluster(title, candidates, opts = {}) {
  const {
    now = Date.now(),
    windowHours = CLUSTER_WINDOW_HOURS,
    threshold = CLUSTER_SIMILARITY_THRESHOLD,
  } = opts

  const incoming = wordSet(title)
  if (incoming.size === 0) return null

  let best = null
  for (const candidate of candidates) {
    if (!withinWindow(candidate.publishedAt, now, windowHours)) continue
    const key = candidate.clusterKey || normalizeTitle(candidate.title ?? '')
    if (key.length === 0) continue
    const similarity = jaccard(incoming, wordSet(key))
    if (similarity < threshold) continue
    const candidateTs = new Date(candidate.publishedAt).getTime()
    if (
      best === null ||
      similarity > best.similarity ||
      (similarity === best.similarity && candidateTs < best.publishedAtMs)
    ) {
      best = { clusterKey: key, similarity, publishedAtMs: candidateTs }
    }
  }
  return best === null ? null : { clusterKey: best.clusterKey, similarity: best.similarity }
}
