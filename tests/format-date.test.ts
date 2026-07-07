import { describe, expect, it } from 'vitest'

import { formatArticleDate, formatFeedDate } from '@/components/articles/format-date'

/**
 * Feed meta labels (design direction v2 §2.2 / v1 §4.6): relative under 24 h
 * („acum 3 ore”, „acum 20 de minute” — Romanian „de” rule at ≥20), absolute
 * („6 iul. 2026”) beyond. `now` is injectable, so the cases are deterministic.
 */
describe('formatFeedDate', () => {
  const now = new Date('2026-07-07T12:00:00.000Z')
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

  it('sub-minute: „chiar acum”', () => {
    expect(formatFeedDate(minutesAgo(0.5), now)).toBe('chiar acum')
  })

  it('minutes: singular, bare plural, „de” plural at ≥20', () => {
    expect(formatFeedDate(minutesAgo(1), now)).toBe('acum un minut')
    expect(formatFeedDate(minutesAgo(3), now)).toBe('acum 3 minute')
    expect(formatFeedDate(minutesAgo(19), now)).toBe('acum 19 minute')
    expect(formatFeedDate(minutesAgo(20), now)).toBe('acum 20 de minute')
    expect(formatFeedDate(minutesAgo(59), now)).toBe('acum 59 de minute')
  })

  it('hours: singular, bare plural, „de” plural at ≥20', () => {
    expect(formatFeedDate(minutesAgo(60), now)).toBe('acum o oră')
    expect(formatFeedDate(minutesAgo(3 * 60), now)).toBe('acum 3 ore')
    expect(formatFeedDate(minutesAgo(19 * 60 + 59), now)).toBe('acum 19 ore')
    expect(formatFeedDate(minutesAgo(20 * 60), now)).toBe('acum 20 de ore')
    expect(formatFeedDate(minutesAgo(23 * 60 + 59), now)).toBe('acum 23 de ore')
  })

  it('≥24 h and future dates fall back to the absolute form', () => {
    expect(formatFeedDate(minutesAgo(24 * 60), now)).toBe('6 iul. 2026')
    expect(formatFeedDate('2026-07-08T12:00:00.000Z', now)).toBe('8 iul. 2026')
  })
})

describe('formatArticleDate', () => {
  it('joins date and time with a comma (Europe/Bucharest)', () => {
    expect(formatArticleDate('2026-07-06T11:30:00.000Z')).toBe('6 iulie 2026, 14:30')
  })
})
