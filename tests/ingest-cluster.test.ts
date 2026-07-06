import { describe, expect, it } from 'vitest'

// Pure ESM helpers — no Payload, no network, no LLM.
import {
  CLUSTER_SIMILARITY_THRESHOLD,
  CLUSTER_WINDOW_HOURS,
  findCluster,
  jaccard,
  normalizeTitle,
  withinWindow,
  wordSet,
} from '../scripts/worker/lib/cluster.mjs'

/** Fixed "now" so window logic is fully deterministic (time is mocked). */
const NOW = new Date('2026-07-06T12:00:00Z').getTime()
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString()

describe('normalizeTitle', () => {
  it('lowercases, strips Romanian diacritics (comma-below + cedilla) and punctuation', () => {
    expect(normalizeTitle('Știrea ZILEI: Țară, îngheț şi mărţişor!')).toBe(
      'stirea zilei tara inghet si martisor',
    )
  })

  it('keeps digits and collapses runs of separators', () => {
    expect(normalizeTitle('Bugetul  pe 2026 — aprobat…')).toBe('bugetul pe 2026 aprobat')
  })

  it('returns empty string for empty/non-string input', () => {
    expect(normalizeTitle('')).toBe('')
    expect(normalizeTitle('¡¿—…')).toBe('')
    expect(normalizeTitle(undefined as unknown as string)).toBe('')
  })
})

describe('wordSet', () => {
  it('builds the word set of a normalized title', () => {
    expect([...wordSet('Guvernul a aprobat, Guvernul a decis')].sort()).toEqual([
      'a',
      'aprobat',
      'decis',
      'guvernul',
    ])
  })

  it('is empty for empty titles (no phantom "" member)', () => {
    expect(wordSet('').size).toBe(0)
  })
})

describe('jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint sets', () => {
    const a = new Set(['guvernul', 'aproba', 'bugetul'])
    expect(jaccard(a, new Set(a))).toBe(1)
    expect(jaccard(a, new Set(['vremea', 'weekend']))).toBe(0)
  })

  it('computes |A∩B| / |A∪B|', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['b', 'c', 'd'])
    expect(jaccard(a, b)).toBeCloseTo(2 / 4)
  })

  it('is 0 (not NaN) when either set is empty', () => {
    expect(jaccard(new Set(), new Set())).toBe(0)
    expect(jaccard(new Set(['a']), new Set())).toBe(0)
  })
})

describe('withinWindow (48h, mocked clock)', () => {
  it('accepts items inside the window and rejects older ones', () => {
    expect(withinWindow(hoursAgo(47), NOW)).toBe(true)
    expect(withinWindow(hoursAgo(48), NOW)).toBe(true)
    expect(withinWindow(hoursAgo(49), NOW)).toBe(false)
  })

  it('accepts future-dated items (broken publisher clocks) and rejects garbage', () => {
    expect(withinWindow(hoursAgo(-2), NOW)).toBe(true)
    expect(withinWindow('nu-e-data', NOW)).toBe(false)
  })

  it('honors a custom window size', () => {
    expect(withinWindow(hoursAgo(5), NOW, 4)).toBe(false)
    expect(withinWindow(hoursAgo(3), NOW, 4)).toBe(true)
  })
})

describe('findCluster', () => {
  const candidates = [
    {
      title: 'Guvernul a aprobat bugetul pe 2026 cu investiții record în infrastructură',
      clusterKey: 'guvernul a aprobat bugetul pe 2026 cu investitii record in infrastructura',
      publishedAt: hoursAgo(5),
    },
    {
      title: 'Vremea se răcește accentuat în weekend',
      clusterKey: 'vremea se raceste accentuat in weekend',
      publishedAt: hoursAgo(10),
    },
  ]

  it('matches a near-duplicate headline from another outlet (Jaccard ≥ 0.6)', () => {
    const match = findCluster(
      'Guvernul a aprobat bugetul pe 2026: investiții record în infrastructură',
      candidates,
      { now: NOW },
    )
    expect(match).not.toBeNull()
    expect(match?.clusterKey).toBe(candidates[0].clusterKey)
    expect(match?.similarity).toBeGreaterThanOrEqual(CLUSTER_SIMILARITY_THRESHOLD)
  })

  it('does not match an unrelated headline', () => {
    expect(
      findCluster('Simona Popescu câștigă turneul de tenis de la București', candidates, {
        now: NOW,
      }),
    ).toBeNull()
  })

  it('matches exactly at the 0.6 threshold (boundary is inclusive)', () => {
    // 3 shared words of 5 total ⇒ 3 / (4 + 4 - 3) = 0.6
    const pool = [{ title: 'alfa beta gama delta', publishedAt: hoursAgo(1) }]
    const match = findCluster('alfa beta gama epsilon', pool, { now: NOW })
    expect(match).not.toBeNull()
    expect(match?.similarity).toBeCloseTo(0.6)
  })

  it('ignores identical titles OUTSIDE the 48h window', () => {
    const stale = [
      {
        title: 'Guvernul a aprobat bugetul pe 2026',
        clusterKey: 'guvernul a aprobat bugetul pe 2026',
        publishedAt: hoursAgo(CLUSTER_WINDOW_HOURS + 1),
      },
    ]
    expect(findCluster('Guvernul a aprobat bugetul pe 2026', stale, { now: NOW })).toBeNull()
  })

  it('derives the cluster key from the title when the candidate has none', () => {
    const pool = [{ title: 'Prețul energiei electrice scade cu 5%', publishedAt: hoursAgo(2) }]
    const match = findCluster('Prețul energiei electrice scade cu 5%', pool, { now: NOW })
    expect(match).not.toBeNull()
    expect(match?.clusterKey).toBe('pretul energiei electrice scade cu 5')
  })

  it('prefers the highest similarity, then the EARLIEST candidate on ties', () => {
    const key = 'guvernul a aprobat bugetul pe 2026'
    const pool = [
      { title: 'x', clusterKey: key, publishedAt: hoursAgo(3) },
      { title: 'x', clusterKey: key, publishedAt: hoursAgo(40) }, // earliest
    ]
    const match = findCluster('Guvernul a aprobat bugetul pe 2026', pool, { now: NOW })
    expect(match).not.toBeNull()
    // Same key either way — assert via a differing-key tie instead:
    const poolTie = [
      { title: 'alfa beta gama delta unu', publishedAt: hoursAgo(3) },
      { title: 'alfa beta gama delta doi', publishedAt: hoursAgo(40) },
    ]
    const tie = findCluster('alfa beta gama delta', poolTie, { now: NOW })
    expect(tie).not.toBeNull()
    expect(tie?.clusterKey).toBe('alfa beta gama delta doi')
  })

  it('never clusters an empty/punctuation-only headline', () => {
    expect(findCluster('!!!', candidates, { now: NOW })).toBeNull()
  })
})
