/**
 * Social-queue planning helpers (architecture.md §7 — newsromania-social).
 *
 * Pure functions, zero I/O — unit-tested in tests/social.test.ts with an
 * injected clock. The worker (scripts/worker/social.mjs) owns all Payload
 * and LLM calls; everything schedulable/deterministic lives here.
 *
 * Concepts:
 *   - idempotency key  = contentType + refId + platform → one social-queue
 *     entry per story per platform, ever;
 *   - caption budget   = writeCaptions() is called at most
 *     CAPTION_BUDGET_PER_RUN times per run (one call covers all platforms);
 *   - slot allocation  = site-config socialPlatforms.postingSchedule (HH:mm,
 *     local server time) unrolled day-by-day into concrete Dates; strictly in
 *     the future, max 1 story per slot per platform, stories spread across
 *     consecutive free slots.
 */

/** Fixed platform order — matches the social-queue `platform` select. */
export const PLATFORMS = ['facebook', 'twitter', 'instagram']

/** Fallback when site-config has no (valid) postingSchedule (arch §3). */
export const DEFAULT_SCHEDULE = ['09:00', '13:00', '18:00', '21:00']

/** Max stories captioned per run — caps LLM spend (1 call = all platforms). */
export const CAPTION_BUDGET_PER_RUN = 15

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * The dedup key for a queue entry. One entry per story per platform:
 * `original:12:facebook` and `aggregated:12:facebook` never collide.
 *
 * @param {'original'|'aggregated'} contentType
 * @param {string|number} refId — Payload doc id of the story
 * @param {string} platform
 * @returns {string}
 */
export function idempotencyKey(contentType, refId, platform) {
  return `${contentType}:${refId}:${platform}`
}

/**
 * Normalize site-config socialPlatforms.postingSchedule rows into a sorted,
 * de-duplicated list of `{ h, m }` times. Accepts `[{ time: 'HH:mm' }]`
 * (Payload array field) or plain `['HH:mm']`; invalid rows are dropped;
 * an empty/absent schedule falls back to DEFAULT_SCHEDULE.
 *
 * @param {unknown} rows
 * @returns {{ h: number, m: number }[]} sorted ascending, at least 1 entry
 */
export function parseSchedule(rows) {
  const times = []
  const seen = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    const raw = typeof row === 'string' ? row : row && typeof row === 'object' ? row.time : null
    const match = typeof raw === 'string' ? TIME_RE.exec(raw.trim()) : null
    if (!match) continue
    const key = `${match[1]}:${match[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    times.push({ h: Number(match[1]), m: Number(match[2]) })
  }
  if (times.length === 0) return parseSchedule(DEFAULT_SCHEDULE)
  return times.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))
}

/**
 * The earliest schedule slot STRICTLY after `after` (server-local time).
 * Walks forward day by day, so it always terminates with ≥ 1 valid time.
 *
 * @param {{ h: number, m: number }[]} times — sorted, from parseSchedule()
 * @param {Date} after
 * @returns {Date}
 */
export function nextSlotAfter(times, after) {
  for (let dayOffset = 0; ; dayOffset += 1) {
    for (const time of times) {
      const candidate = new Date(
        after.getFullYear(),
        after.getMonth(),
        after.getDate() + dayOffset,
        time.h,
        time.m,
        0,
        0,
      )
      if (candidate.getTime() > after.getTime()) return candidate
    }
  }
}

/**
 * Stateful per-platform slot allocator. Each `next(platform)` returns the
 * next FREE slot for that platform: strictly after `now`, strictly after any
 * slot already handed out this run (spread across slots — never two stories
 * in the same slot for one platform), and skipping slots already occupied by
 * existing queue entries.
 *
 * @param {object} opts
 * @param {{ h: number, m: number }[]} opts.times — from parseSchedule()
 * @param {Date} opts.now — injected clock (tests pass a fixed value)
 * @param {Map<string, Set<number>>} [opts.occupied] — platform → Set of
 *   epoch-ms of already-scheduled entries (queued/approved/posted)
 * @returns {{ next(platform: string): Date }}
 */
export function createSlotAllocator({ times, now, occupied = new Map() }) {
  const cursor = new Map()
  return {
    next(platform) {
      const after = cursor.get(platform) ?? now
      let slot = nextSlotAfter(times, after)
      const taken = occupied.get(platform)
      while (taken && taken.has(slot.getTime())) {
        slot = nextSlotAfter(times, slot)
      }
      cursor.set(platform, slot)
      return slot
    },
  }
}

/**
 * Which platforms still lack a queue entry for this story.
 *
 * @param {{ contentType: string, refId: string }} story
 * @param {Set<string>} existingKeys — idempotencyKey() strings already in DB
 * @param {string[]} [platforms]
 * @returns {string[]}
 */
export function missingPlatforms(story, existingKeys, platforms = PLATFORMS) {
  return platforms.filter(
    (platform) => !existingKeys.has(idempotencyKey(story.contentType, story.refId, platform)),
  )
}

/**
 * Pick the stories to caption this run: keep candidates (already in priority
 * order) that miss at least one platform entry, capped at `budget` — the
 * caption budget counts STORIES, since one writeCaptions() call produces all
 * platform variants.
 *
 * @template {{ contentType: string, refId: string }} T
 * @param {T[]} candidates — priority order (originals first, newest first)
 * @param {object} opts
 * @param {Set<string>} opts.existingKeys
 * @param {number} [opts.budget]
 * @param {string[]} [opts.platforms]
 * @returns {{ story: T, missing: string[] }[]}
 */
export function selectStories(
  candidates,
  { existingKeys, budget = CAPTION_BUDGET_PER_RUN, platforms = PLATFORMS },
) {
  const selected = []
  for (const story of candidates) {
    if (selected.length >= budget) break
    const missing = missingPlatforms(story, existingKeys, platforms)
    if (missing.length > 0) selected.push({ story, missing })
  }
  return selected
}

/**
 * Absolute site URL of a story — BOTH content types land on OUR site
 * (aggregated items get the excerpt + attribution landing page at the same
 * route), so social clicks always come to us first (PROJECT_BRIEF §9).
 *
 * @param {string} siteUrl — no trailing slash
 * @param {string} slug
 * @returns {string}
 */
export function storyUrl(siteUrl, slug) {
  return `${siteUrl}/stiri/${slug}`
}

/**
 * Absolute category-placeholder illustration URL (public/placeholders/).
 * Unknown/missing category slugs fall back to the generic artwork.
 *
 * @param {string} siteUrl — no trailing slash
 * @param {string|null|undefined} categorySlug
 * @param {Set<string>} knownSlugs — the 8 canonical category slugs
 * @returns {string}
 */
export function placeholderImageUrl(siteUrl, categorySlug, knownSlugs) {
  const slug = categorySlug && knownSlugs.has(categorySlug) ? categorySlug : 'generic'
  return `${siteUrl}/placeholders/${slug}.png`
}
