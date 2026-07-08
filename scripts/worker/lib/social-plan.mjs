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

// ---------------------------------------------------------------------------
// Facebook hourly "impact of the hour" fan-out (PROJECT_BRIEF §9b)
// ---------------------------------------------------------------------------
//
// The hourly job posts the single most impactful story to the NewsRomania
// Facebook PAGE plus the (up to 5) member GROUPS the account belongs to. Each
// destination is its own social-queue row (platform 'facebook'), so the
// runbook can post + mark them one at a time and idempotency is per-target.
//
// Group URLs are NOT in the repo (owner-specific). They come from the
// SOCIAL_FB_GROUPS env var — newline/comma/space-separated Facebook group
// URLs. Until the owner fills it, only the PAGE row is queued and the groups
// are noted as pending (the worker logs this).

/** Idempotency namespace prefix so hourly rows never collide with the 3×/day
 * caption queue (which uses the bare story id as refId). */
export const IMPACT_REFID_PREFIX = 'impact'

/** The page is always target #0; groups follow in SOCIAL_FB_GROUPS order. */
export const FB_PAGE_TARGET = 'page'

/** Max member groups we ever fan out to (brief §9: 5 groups). Extra env
 * entries beyond this are ignored (logged by the worker). */
export const MAX_FB_GROUPS = 5

/**
 * Parse SOCIAL_FB_GROUPS (or any raw string) into a de-duplicated list of
 * Facebook group URLs, capped at MAX_FB_GROUPS. Accepts newline-, comma-, or
 * whitespace-separated entries; only http(s) facebook.com/groups/… URLs are
 * kept (anything else is dropped so a typo never becomes a post target).
 *
 * @param {unknown} raw — typically process.env.SOCIAL_FB_GROUPS
 * @returns {string[]} 0..MAX_FB_GROUPS group URLs, order preserved
 */
export function parseFbGroups(raw) {
  if (typeof raw !== 'string') return []
  const seen = new Set()
  const out = []
  for (const token of raw.split(/[\s,]+/)) {
    const url = token.trim()
    if (!url) continue
    if (!/^https?:\/\/(www\.|m\.|web\.)?facebook\.com\/groups\/[^\s]+/i.test(url)) continue
    const norm = url.replace(/\/+$/, '')
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(norm)
    if (out.length >= MAX_FB_GROUPS) break
  }
  return out
}

/**
 * Hour stamp used to make the hourly post idempotent PER HOUR (one post per
 * story per target per hour). Local-time `YYYY-MM-DDTHH` — the same wall-clock
 * hour the timer fires in.
 *
 * @param {Date} date
 * @returns {string} e.g. '2026-07-07T14'
 */
export function hourStamp(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}`
}

/**
 * The full set of Facebook fan-out targets for one hourly post: the page first,
 * then each group. Each target carries a stable `slug` (used in the refId and
 * shown in the runbook) and its destination `url`.
 *
 * @param {string | null | undefined} pageUrl — NewsRomania FB page (site-config)
 * @param {string[]} groupUrls — from parseFbGroups()
 * @returns {{ slug: string, url: string | null, kind: 'page' | 'group' }[]}
 */
export function fbTargets(pageUrl, groupUrls) {
  const page = typeof pageUrl === 'string' && pageUrl.trim() ? pageUrl.trim() : null
  const targets = [{ slug: FB_PAGE_TARGET, url: page, kind: 'page' }]
  groupUrls.slice(0, MAX_FB_GROUPS).forEach((url, i) => {
    targets.push({ slug: `group${i + 1}`, url, kind: 'group' })
  })
  return targets
}

/**
 * refId for one hourly Facebook row: `impact:<contentType>:<storyId>:<hour>:<target>`.
 * Idempotent per (story, hour, target); never collides with the 3×/day queue
 * (which uses the bare story id) because of the IMPACT_REFID_PREFIX.
 *
 * @param {{ contentType: string, refId: string }} story
 * @param {string} stamp — from hourStamp()
 * @param {string} targetSlug — from fbTargets()[i].slug
 * @returns {string}
 */
export function impactRefId(story, stamp, targetSlug) {
  return `${IMPACT_REFID_PREFIX}:${story.contentType}:${story.refId}:${stamp}:${targetSlug}`
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
