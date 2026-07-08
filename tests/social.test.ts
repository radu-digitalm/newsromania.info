import { describe, expect, it } from 'vitest'

// Pure ESM helpers — no Payload, no network, no LLM (scripts/worker/social.mjs
// owns all I/O; everything deterministic is unit-tested here).
import {
  CAPTION_BUDGET_PER_RUN,
  DEFAULT_SCHEDULE,
  FB_PAGE_TARGET,
  MAX_FB_GROUPS,
  PLATFORMS,
  createSlotAllocator,
  fbTargets,
  hourStamp,
  idempotencyKey,
  impactRefId,
  missingPlatforms,
  nextSlotAfter,
  parseFbGroups,
  parseSchedule,
  selectStories,
  storyUrl,
} from '../scripts/worker/lib/social-plan.mjs'
import {
  DEFAULT_TIER,
  ORIGINAL_TIER,
  countClusters,
  impactScore,
  normalizeSource,
  recencyScore,
  selectImpactStory,
  sourceTier,
  withinLastHour,
} from '../scripts/worker/lib/impact.mjs'

/**
 * Mocked clock: every helper takes `now`/`after` as an argument, so tests
 * inject fixed LOCAL-time dates (constructor + getters both local ⇒ the
 * assertions hold in any server timezone). Monday 2026-07-06, 08:00 local.
 */
const NOW = new Date(2026, 6, 6, 8, 0, 0, 0)
const at = (day: number, h: number, m: number) => new Date(2026, 6, day, h, m, 0, 0)

const SCHEDULE = parseSchedule([
  { time: '09:00' },
  { time: '13:00' },
  { time: '18:00' },
  { time: '21:00' },
])

describe('idempotencyKey', () => {
  it('is contentType + refId + platform', () => {
    expect(idempotencyKey('original', '12', 'facebook')).toBe('original:12:facebook')
    expect(idempotencyKey('aggregated', 12, 'twitter')).toBe('aggregated:12:twitter')
  })

  it('never collides across content types with the same refId', () => {
    expect(idempotencyKey('original', '7', 'instagram')).not.toBe(
      idempotencyKey('aggregated', '7', 'instagram'),
    )
  })

  it('is stable for repeated calls (dedup key semantics)', () => {
    expect(idempotencyKey('original', '7', 'facebook')).toBe(
      idempotencyKey('original', '7', 'facebook'),
    )
  })
})

describe('parseSchedule', () => {
  it('parses Payload array rows ({ time }) sorted ascending', () => {
    const times = parseSchedule([{ time: '21:00' }, { time: '09:00' }, { time: '13:30' }])
    expect(times).toEqual([
      { h: 9, m: 0 },
      { h: 13, m: 30 },
      { h: 21, m: 0 },
    ])
  })

  it('drops invalid rows and de-duplicates', () => {
    const times = parseSchedule([
      { time: '09:00' },
      { time: '9:00' }, // invalid: needs leading zero
      { time: '25:00' }, // invalid hour
      { time: '09:60' }, // invalid minute
      { time: '09:00' }, // duplicate
      { notTime: true },
      null,
    ])
    expect(times).toEqual([{ h: 9, m: 0 }])
  })

  it('falls back to the seeded default schedule when empty or garbage', () => {
    const expected = [
      { h: 9, m: 0 },
      { h: 13, m: 0 },
      { h: 18, m: 0 },
      { h: 21, m: 0 },
    ]
    expect(parseSchedule([])).toEqual(expected)
    expect(parseSchedule(undefined)).toEqual(expected)
    expect(parseSchedule([{ time: 'blah' }])).toEqual(expected)
    expect(DEFAULT_SCHEDULE).toEqual(['09:00', '13:00', '18:00', '21:00'])
  })
})

describe('nextSlotAfter (mocked clock)', () => {
  it('picks the first slot later today', () => {
    expect(nextSlotAfter(SCHEDULE, NOW)).toEqual(at(6, 9, 0))
    expect(nextSlotAfter(SCHEDULE, at(6, 14, 15))).toEqual(at(6, 18, 0))
  })

  it('is STRICTLY in the future — a run exactly at slot time schedules the next one', () => {
    expect(nextSlotAfter(SCHEDULE, at(6, 9, 0))).toEqual(at(6, 13, 0))
    expect(nextSlotAfter(SCHEDULE, at(6, 21, 0))).toEqual(at(7, 9, 0))
  })

  it('rolls over to the next day after the last slot', () => {
    expect(nextSlotAfter(SCHEDULE, at(6, 22, 30))).toEqual(at(7, 9, 0))
  })

  it('rolls across month boundaries', () => {
    const endOfJuly = new Date(2026, 6, 31, 22, 0, 0, 0)
    expect(nextSlotAfter(SCHEDULE, endOfJuly)).toEqual(new Date(2026, 7, 1, 9, 0, 0, 0))
  })
})

describe('createSlotAllocator', () => {
  it('spreads consecutive stories across consecutive slots (max 1/slot/platform)', () => {
    const allocator = createSlotAllocator({ times: SCHEDULE, now: NOW })
    expect(allocator.next('facebook')).toEqual(at(6, 9, 0))
    expect(allocator.next('facebook')).toEqual(at(6, 13, 0))
    expect(allocator.next('facebook')).toEqual(at(6, 18, 0))
    expect(allocator.next('facebook')).toEqual(at(6, 21, 0))
    // 5th story of the day rolls into tomorrow's first slot.
    expect(allocator.next('facebook')).toEqual(at(7, 9, 0))
  })

  it('allocates platforms independently — same story may share the slot time across platforms', () => {
    const allocator = createSlotAllocator({ times: SCHEDULE, now: NOW })
    expect(allocator.next('facebook')).toEqual(at(6, 9, 0))
    expect(allocator.next('twitter')).toEqual(at(6, 9, 0))
    expect(allocator.next('instagram')).toEqual(at(6, 9, 0))
    expect(allocator.next('twitter')).toEqual(at(6, 13, 0))
  })

  it('skips slots already occupied by existing queue entries', () => {
    const occupied = new Map([
      ['facebook', new Set([at(6, 9, 0).getTime(), at(6, 18, 0).getTime()])],
    ])
    const allocator = createSlotAllocator({ times: SCHEDULE, now: NOW, occupied })
    expect(allocator.next('facebook')).toEqual(at(6, 13, 0))
    expect(allocator.next('facebook')).toEqual(at(6, 21, 0))
    // Other platforms are unaffected by facebook's occupancy.
    expect(allocator.next('twitter')).toEqual(at(6, 9, 0))
  })

  it('never schedules into the past, even when today’s slots are exhausted', () => {
    const lateNow = at(6, 23, 45)
    const allocator = createSlotAllocator({ times: SCHEDULE, now: lateNow })
    const slot = allocator.next('instagram')
    expect(slot.getTime()).toBeGreaterThan(lateNow.getTime())
    expect(slot).toEqual(at(7, 9, 0))
  })
})

describe('selectStories (idempotency + caption budget)', () => {
  const story = (contentType: 'original' | 'aggregated', refId: string) => ({
    contentType,
    refId,
  })

  it('skips stories that already have entries on every platform', () => {
    const existingKeys = new Set(PLATFORMS.map((p: string) => idempotencyKey('original', '1', p)))
    const picked = selectStories([story('original', '1'), story('original', '2')], {
      existingKeys,
    })
    expect(picked).toHaveLength(1)
    expect(picked[0].story.refId).toBe('2')
    expect(picked[0].missing).toEqual(['facebook', 'twitter', 'instagram'])
  })

  it('re-queues only the MISSING platforms of a partially covered story', () => {
    const existingKeys = new Set([
      idempotencyKey('original', '1', 'facebook'),
      idempotencyKey('original', '1', 'twitter'),
    ])
    const picked = selectStories([story('original', '1')], { existingKeys })
    expect(picked).toHaveLength(1)
    expect(picked[0].missing).toEqual(['instagram'])
    expect(missingPlatforms(story('original', '1'), existingKeys)).toEqual(['instagram'])
  })

  it('an aggregated story is NOT blocked by an original with the same refId', () => {
    const existingKeys = new Set(PLATFORMS.map((p: string) => idempotencyKey('original', '5', p)))
    const picked = selectStories([story('aggregated', '5')], { existingKeys })
    expect(picked).toHaveLength(1)
    expect(picked[0].missing).toHaveLength(3)
  })

  it('caps at the caption budget (15 stories/run), counting STORIES not entries', () => {
    const candidates = Array.from({ length: 40 }, (_, i) => story('aggregated', String(i)))
    const picked = selectStories(candidates, { existingKeys: new Set<string>() })
    expect(CAPTION_BUDGET_PER_RUN).toBe(15)
    expect(picked).toHaveLength(15)
    // Priority order preserved: the first 15 candidates win.
    expect(picked.map((p) => p.story.refId)).toEqual(candidates.slice(0, 15).map((c) => c.refId))
  })

  it('fully covered stories do not consume budget', () => {
    const existingKeys = new Set<string>()
    for (let i = 0; i < 10; i += 1) {
      for (const p of PLATFORMS) existingKeys.add(idempotencyKey('aggregated', String(i), p))
    }
    const candidates = Array.from({ length: 30 }, (_, i) => story('aggregated', String(i)))
    const picked = selectStories(candidates, { existingKeys, budget: 15 })
    expect(picked).toHaveLength(15)
    expect(picked[0].story.refId).toBe('10')
    expect(picked[14].story.refId).toBe('24')
  })

  it('respects an explicit lower budget (--limit)', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => story('original', String(i)))
    const picked = selectStories(candidates, { existingKeys: new Set<string>(), budget: 2 })
    expect(picked).toHaveLength(2)
  })
})

describe('URL helpers', () => {
  const SITE = 'https://newsromania.info'

  it('both content types link to OUR site (/stiri/<slug>)', () => {
    expect(storyUrl(SITE, 'buget-aprobat')).toBe('https://newsromania.info/stiri/buget-aprobat')
  })
})

// ---------------------------------------------------------------------------
// Impact-of-the-hour (PROJECT_BRIEF §9a) — scripts/worker/lib/impact.mjs
// ---------------------------------------------------------------------------

const NOW_MS = new Date(2026, 6, 6, 12, 0, 0, 0).getTime()
const minsAgo = (m: number) => new Date(NOW_MS - m * 60 * 1000).toISOString()

describe('normalizeSource / sourceTier', () => {
  it('strips diacritics and lowercases for matching', () => {
    expect(normalizeSource('Adevărul')).toBe('adevarul')
    expect(normalizeSource('Ziarul Financiar (ZF.ro)')).toBe('ziarul financiar (zf.ro)')
    expect(normalizeSource(null)).toBe('')
  })

  it('maps known national outlets to tier 1 and unknowns to DEFAULT_TIER', () => {
    expect(sourceTier('Digi24')).toBe(1)
    expect(sourceTier('G4Media.ro')).toBe(1)
    expect(sourceTier('Adevărul')).toBe(1)
    expect(sourceTier('Libertatea')).toBe(2)
    expect(sourceTier('Ziarul Financiar (ZF.ro)')).toBe(2)
    expect(sourceTier('Replica Online (Constanța)')).toBe(DEFAULT_TIER)
    expect(sourceTier(undefined)).toBe(DEFAULT_TIER)
    expect(DEFAULT_TIER).toBe(3)
  })
})

describe('withinLastHour', () => {
  it('accepts items published inside the window, rejects older ones', () => {
    expect(withinLastHour(minsAgo(0), NOW_MS)).toBe(true)
    expect(withinLastHour(minsAgo(59), NOW_MS)).toBe(true)
    expect(withinLastHour(minsAgo(60), NOW_MS)).toBe(true)
    expect(withinLastHour(minsAgo(61), NOW_MS)).toBe(false)
  })

  it('treats future clock-skew timestamps as current', () => {
    expect(withinLastHour(new Date(NOW_MS + 5 * 60 * 1000).toISOString(), NOW_MS)).toBe(true)
  })

  it('rejects unparseable timestamps', () => {
    expect(withinLastHour('not-a-date', NOW_MS)).toBe(false)
  })
})

describe('recencyScore', () => {
  it('is max at now, zero a full window ago, and bounded below a cluster step', () => {
    expect(recencyScore(minsAgo(0), NOW_MS)).toBeCloseTo(2)
    expect(recencyScore(minsAgo(60), NOW_MS)).toBeCloseTo(0)
    expect(recencyScore(minsAgo(30), NOW_MS)).toBeCloseTo(1)
    // Never enough to overturn even one extra outlet (CLUSTER_WEIGHT = 10).
    expect(recencyScore(minsAgo(0), NOW_MS)).toBeLessThan(10)
  })
})

describe('countClusters', () => {
  it('counts items per clusterKey and ignores empty keys', () => {
    const counts = countClusters([
      { clusterKey: 'buget aprobat' },
      { clusterKey: 'buget aprobat' },
      { clusterKey: 'buget aprobat' },
      { clusterKey: 'meci castigat' },
      { clusterKey: '' },
      { clusterKey: null },
      {},
    ])
    expect(counts.get('buget aprobat')).toBe(3)
    expect(counts.get('meci castigat')).toBe(1)
    expect(counts.size).toBe(2)
  })
})

describe('impactScore', () => {
  it('cross-source coverage dominates tier and image', () => {
    const bigCluster = impactScore(
      { clusterSize: 5, tier: 3, hasImage: false, publishedAt: minsAgo(50) },
      NOW_MS,
    )
    const tier1WithImage = impactScore(
      { clusterSize: 1, tier: 1, hasImage: true, publishedAt: minsAgo(0) },
      NOW_MS,
    )
    // 4 extra outlets (40 pts) beat the best possible tier+image+recency combo.
    expect(bigCluster).toBeGreaterThan(tier1WithImage)
  })

  it('tier and image break ties at equal coverage', () => {
    const a = impactScore(
      { clusterSize: 2, tier: 1, hasImage: true, publishedAt: minsAgo(30) },
      NOW_MS,
    )
    const b = impactScore(
      { clusterSize: 2, tier: 3, hasImage: false, publishedAt: minsAgo(30) },
      NOW_MS,
    )
    expect(a).toBeGreaterThan(b)
  })
})

describe('selectImpactStory', () => {
  const item = (over: Record<string, unknown>) => ({
    refId: '1',
    contentType: 'aggregated',
    title: 't',
    hasImage: true,
    clusterSize: 1,
    tier: DEFAULT_TIER,
    publishedAt: minsAgo(10),
    ...over,
  })

  // impact.mjs is untyped JS → `story` widens to `object`; read refId safely.
  const refIdOf = (pick: { story: object } | null) =>
    (pick?.story as { refId?: string } | undefined)?.refId

  it('returns null on no candidates', () => {
    expect(selectImpactStory([], { nowMs: NOW_MS })).toBeNull()
  })

  it('picks the biggest cross-source cluster from the last hour', () => {
    const pick = selectImpactStory(
      [
        item({ refId: 'a', clusterSize: 1, tier: 1, hasImage: true, publishedAt: minsAgo(1) }),
        item({ refId: 'b', clusterSize: 4, tier: 3, hasImage: false, publishedAt: minsAgo(40) }),
        item({ refId: 'c', clusterSize: 2, tier: 2, hasImage: true, publishedAt: minsAgo(5) }),
      ],
      { nowMs: NOW_MS },
    )
    expect(refIdOf(pick)).toBe('b')
    expect(pick?.reason).toBe('impact-of-the-hour')
  })

  it('ignores items older than an hour when the hour has content', () => {
    const pick = selectImpactStory(
      [
        item({ refId: 'old', clusterSize: 9, publishedAt: minsAgo(90) }),
        item({ refId: 'fresh', clusterSize: 1, publishedAt: minsAgo(10) }),
      ],
      { nowMs: NOW_MS },
    )
    expect(refIdOf(pick)).toBe('fresh')
  })

  it('thin hour → newest item WITH an image', () => {
    const pick = selectImpactStory(
      [
        item({ refId: 'noimg-new', hasImage: false, publishedAt: minsAgo(70) }),
        item({ refId: 'img-old', hasImage: true, publishedAt: minsAgo(200) }),
        item({ refId: 'img-new', hasImage: true, publishedAt: minsAgo(100) }),
      ],
      { nowMs: NOW_MS },
    )
    expect(refIdOf(pick)).toBe('img-new')
    expect(pick?.reason).toBe('fallback-newest-with-image')
  })

  it('thin hour, no images anywhere → newest overall', () => {
    const pick = selectImpactStory(
      [
        item({ refId: 'old', hasImage: false, publishedAt: minsAgo(300) }),
        item({ refId: 'newer', hasImage: false, publishedAt: minsAgo(120) }),
      ],
      { nowMs: NOW_MS },
    )
    expect(refIdOf(pick)).toBe('newer')
    expect(pick?.reason).toBe('fallback-newest')
  })

  it('breaks exact score ties by newer publishedAt then smaller refId', () => {
    const pick = selectImpactStory(
      [
        item({ refId: 'z', clusterSize: 2, tier: 1, hasImage: true, publishedAt: minsAgo(20) }),
        item({ refId: 'a', clusterSize: 2, tier: 1, hasImage: true, publishedAt: minsAgo(20) }),
      ],
      { nowMs: NOW_MS },
    )
    // Same publishedAt ⇒ smaller refId wins ('a' < 'z').
    expect(refIdOf(pick)).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// Facebook hourly fan-out helpers (PROJECT_BRIEF §9b) — social-plan.mjs
// ---------------------------------------------------------------------------

describe('parseFbGroups', () => {
  it('keeps only facebook.com/groups URLs, de-dupes, caps at MAX_FB_GROUPS', () => {
    const raw = [
      'https://facebook.com/groups/aaa',
      'https://www.facebook.com/groups/bbb/',
      'https://facebook.com/groups/aaa', // dup (trailing-slash-normalized)
      'https://example.com/not-a-group',
      'https://facebook.com/NewsRomania', // a page, not a group
      'https://facebook.com/groups/ccc',
      'https://facebook.com/groups/ddd',
      'https://facebook.com/groups/eee',
      'https://facebook.com/groups/fff', // 6th valid → dropped by the cap
    ].join('\n')
    const groups = parseFbGroups(raw)
    expect(groups).toEqual([
      'https://facebook.com/groups/aaa',
      'https://www.facebook.com/groups/bbb',
      'https://facebook.com/groups/ccc',
      'https://facebook.com/groups/ddd',
      'https://facebook.com/groups/eee',
    ])
    expect(groups.length).toBe(MAX_FB_GROUPS)
  })

  it('accepts comma/space separators and returns [] for empty/non-string', () => {
    expect(parseFbGroups('https://facebook.com/groups/x, https://facebook.com/groups/y')).toEqual([
      'https://facebook.com/groups/x',
      'https://facebook.com/groups/y',
    ])
    expect(parseFbGroups('')).toEqual([])
    expect(parseFbGroups(undefined)).toEqual([])
  })
})

describe('fbTargets', () => {
  it('page is always target #0, groups follow in order', () => {
    const targets = fbTargets('https://facebook.com/NewsRomania', [
      'https://facebook.com/groups/aaa',
      'https://facebook.com/groups/bbb',
    ])
    expect(targets).toEqual([
      { slug: FB_PAGE_TARGET, url: 'https://facebook.com/NewsRomania', kind: 'page' },
      { slug: 'group1', url: 'https://facebook.com/groups/aaa', kind: 'group' },
      { slug: 'group2', url: 'https://facebook.com/groups/bbb', kind: 'group' },
    ])
  })

  it('queues the page even when its URL is missing (owner fills later)', () => {
    const targets = fbTargets(null, [])
    expect(targets).toEqual([{ slug: 'page', url: null, kind: 'page' }])
  })
})

describe('hourStamp / impactRefId', () => {
  it('stamps the local wall-clock hour', () => {
    expect(hourStamp(new Date(2026, 6, 7, 14, 37, 0, 0))).toBe('2026-07-07T14')
    expect(hourStamp(new Date(2026, 0, 3, 9, 5, 0, 0))).toBe('2026-01-03T09')
  })

  it('builds a per-story-per-target-per-hour idempotent refId that never hits the daily queue', () => {
    const story = { contentType: 'aggregated', refId: '42' }
    const stamp = hourStamp(new Date(2026, 6, 7, 14, 0, 0, 0))
    expect(impactRefId(story, stamp, 'page')).toBe('impact:aggregated:42:2026-07-07T14:page')
    expect(impactRefId(story, stamp, 'group3')).toBe('impact:aggregated:42:2026-07-07T14:group3')
    // Distinct from the daily-queue key space (bare id refId) → no collision.
    expect(impactRefId(story, stamp, 'page')).not.toBe(story.refId)
    // Distinct per hour → idempotent within an hour, fresh the next hour.
    const nextHour = hourStamp(new Date(2026, 6, 7, 15, 0, 0, 0))
    expect(impactRefId(story, nextHour, 'page')).not.toBe(impactRefId(story, stamp, 'page'))
  })
})

describe('ORIGINAL_TIER', () => {
  it("treats the redaction's own articles as top tier", () => {
    expect(ORIGINAL_TIER).toBe(1)
  })
})
