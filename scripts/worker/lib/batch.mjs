/**
 * Rotating-batch selection for the 5-minute ingest worker (PROJECT_BRIEF /
 * TEAM INGEST #3). Pure helpers, zero I/O — unit-tested in tests/rss-helpers.test.ts.
 *
 * The worker no longer polls every active feed each run. Instead a persisted
 * Redis cursor (rkey('ingest','cursor')) is an OFFSET into the STABLY-SORTED
 * active-feed list; each 5-min run takes {@link DEFAULT_BATCH_SIZE} feeds from
 * that offset (wrapping around the end) and advances the cursor by the batch
 * size. Consecutive runs therefore cover DIFFERENT feeds and ~40 feeds cycle
 * fully over ~20 minutes with no overlap inside a cycle.
 *
 * Feeds are sorted by id so the ordering is stable across runs regardless of
 * insertion/name changes; a newly-added feed simply joins the rotation at its
 * id's position and is reached within one cycle.
 */

export const DEFAULT_BATCH_SIZE = 10

/**
 * Normalize a raw Redis cursor value into a non-negative integer offset.
 * @param {unknown} raw the string read from Redis (or null)
 * @param {number} total number of active feeds (modulus)
 * @returns {number} offset in [0, total) — 0 when total is 0
 */
export function normalizeCursor(raw, total) {
  if (total <= 0) return 0
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return n % total
}

/**
 * Select the next batch of feeds and compute the cursor to persist for the
 * following run. Wraps around the end of the list so every feed is reached.
 *
 * @template T
 * @param {T[]} feeds STABLY-SORTED active feeds
 * @param {unknown} rawCursor cursor value from Redis (string | null)
 * @param {number} [size] batch size (default {@link DEFAULT_BATCH_SIZE})
 * @returns {{ batch: T[], nextCursor: number, start: number }}
 */
export function selectBatch(feeds, rawCursor, size = DEFAULT_BATCH_SIZE) {
  const total = feeds.length
  if (total === 0) return { batch: [], nextCursor: 0, start: 0 }

  const batchSize = Math.max(1, Math.floor(size))
  const start = normalizeCursor(rawCursor, total)

  // Take up to batchSize feeds, but never more than `total` (a small feed list
  // is fully covered in one run — no duplicates within a single batch).
  const take = Math.min(batchSize, total)
  const batch = []
  for (let i = 0; i < take; i++) {
    batch.push(feeds[(start + i) % total])
  }

  const nextCursor = (start + take) % total
  return { batch, nextCursor, start }
}
