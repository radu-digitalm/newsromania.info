import { describe, expect, it } from 'vitest'

import { slugFromStiriPath } from '../src/lib/umami-stats'

// Pure parser only — no DB connection is opened (getUmamiPool is lazy).
describe('slugFromStiriPath — extract article slug from an Umami pageview path', () => {
  it('extracts the slug from a /stiri/<slug> path', () => {
    expect(slugFromStiriPath('/stiri/cum-functioneaza-ro-alert')).toBe('cum-functioneaza-ro-alert')
  })

  it('ignores a trailing slash, query string and hash', () => {
    expect(slugFromStiriPath('/stiri/buget-2026/')).toBe('buget-2026')
    expect(slugFromStiriPath('/stiri/buget-2026?utm_source=x')).toBe('buget-2026')
    expect(slugFromStiriPath('/stiri/buget-2026#top')).toBe('buget-2026')
  })

  it('decodes percent-encoded slugs', () => {
    expect(slugFromStiriPath('/stiri/cafea-%C8%99i-ceai')).toBe('cafea-și-ceai')
  })

  it('returns null for non-article paths', () => {
    expect(slugFromStiriPath('/')).toBeNull()
    expect(slugFromStiriPath('/categorie/sport')).toBeNull()
    expect(slugFromStiriPath('/stiri/')).toBeNull()
    expect(slugFromStiriPath('/stiri')).toBeNull()
  })

  it('is defensive against bad input', () => {
    expect(slugFromStiriPath(undefined as unknown as string)).toBeNull()
    expect(slugFromStiriPath('/stiri/%E0%A4%A')).toBeNull() // malformed percent-encoding
  })
})
