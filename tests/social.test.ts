import { describe, expect, it } from 'vitest'

// Pure ESM helpers — no Payload, no network, no LLM (scripts/worker/social.mjs
// owns all I/O; everything deterministic is unit-tested here).
import {
  CAPTION_BUDGET_PER_RUN,
  DEFAULT_SCHEDULE,
  PLATFORMS,
  createSlotAllocator,
  idempotencyKey,
  missingPlatforms,
  nextSlotAfter,
  parseSchedule,
  selectStories,
  storyUrl,
} from '../scripts/worker/lib/social-plan.mjs'

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
