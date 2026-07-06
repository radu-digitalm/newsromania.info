import { describe, expect, it } from 'vitest'

import {
  FALLBACK_CATEGORY_SLUG,
  clampTweet,
  estimateCostUsd,
  getProvider,
  limitHashtags,
  parseJsonObject,
  resolveCategorySlug,
  sanitizeTags,
  stripWrapping,
} from '../src/lib/llm'

// Pure helpers only — no OpenAI client is ever constructed, no API calls.

describe('resolveCategorySlug', () => {
  it('accepts each of the 8 canonical slugs', () => {
    for (const slug of [
      'actualitate',
      'politica',
      'economie',
      'externe',
      'sport',
      'sanatate',
      'tehnologie',
      'cultura',
    ]) {
      expect(resolveCategorySlug(slug)).toBe(slug)
    }
  })

  it('normalizes case and whitespace', () => {
    expect(resolveCategorySlug('  Sport ')).toBe('sport')
  })

  it('falls back to actualitate for unknown or non-string values', () => {
    expect(resolveCategorySlug('sports')).toBe(FALLBACK_CATEGORY_SLUG)
    expect(resolveCategorySlug('politică')).toBe(FALLBACK_CATEGORY_SLUG) // slugs are ASCII
    expect(resolveCategorySlug(undefined)).toBe(FALLBACK_CATEGORY_SLUG)
    expect(resolveCategorySlug(42)).toBe(FALLBACK_CATEGORY_SLUG)
  })
})

describe('sanitizeTags', () => {
  it('lowercases, trims, strips # and dedupes', () => {
    expect(sanitizeTags([' #Energie ', 'GUVERN', 'guvern', 'preț plafonat'])).toEqual([
      'energie',
      'guvern',
      'preț plafonat',
    ])
  })

  it('caps at 4 tags', () => {
    expect(sanitizeTags(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops empties, non-strings and absurdly long tags', () => {
    expect(sanitizeTags(['', '   ', 7, null, 'x'.repeat(61), 'ok'])).toEqual(['ok'])
  })

  it('returns [] for non-array input', () => {
    expect(sanitizeTags('economie')).toEqual([])
    expect(sanitizeTags(undefined)).toEqual([])
  })
})

describe('stripWrapping', () => {
  it('removes wrapping quotes and code fences', () => {
    expect(stripWrapping('„Un rezumat scurt.”')).toBe('Un rezumat scurt.')
    expect(stripWrapping('```text\nUn rezumat.\n```')).toBe('Un rezumat.')
    expect(stripWrapping('  simplu  ')).toBe('simplu')
  })
})

describe('parseJsonObject', () => {
  it('parses a plain JSON object', () => {
    expect(parseJsonObject('{"a": 1}')).toEqual({ a: 1 })
  })

  it('extracts JSON from a fenced/preamble reply', () => {
    expect(parseJsonObject('Iată:\n```json\n{"categorySlug":"sport","tags":[]}\n```')).toEqual({
      categorySlug: 'sport',
      tags: [],
    })
  })

  it('returns null for arrays, garbage and missing braces', () => {
    expect(parseJsonObject('[1,2]')).toBeNull()
    expect(parseJsonObject('nimic aici')).toBeNull()
    expect(parseJsonObject('{invalid}')).toBeNull()
  })
})

describe('clampTweet', () => {
  const url = 'https://newsromania.info/stiri/exemplu'

  it('appends the link when the body fits', () => {
    const tweet = clampTweet('Un titlu scurt.', url)
    expect(tweet).toBe(`Un titlu scurt. ${url}`)
    expect(tweet.length).toBeLessThanOrEqual(240)
  })

  it('never exceeds 240 chars and never truncates the link', () => {
    const tweet = clampTweet('cuvânt '.repeat(60), url)
    expect(tweet.length).toBeLessThanOrEqual(240)
    expect(tweet.endsWith(url)).toBe(true)
    expect(tweet).toContain('…')
  })

  it('does not duplicate a link the model already included', () => {
    const tweet = clampTweet(`Titlu percutant ${url}`, url)
    expect(tweet).toBe(`Titlu percutant ${url}`)
  })
})

describe('limitHashtags', () => {
  it('keeps at most 5 hashtags', () => {
    const out = limitHashtags('Poză superbă #unu #doi #trei #patru #cinci #șase #șapte')
    expect(out.match(/#[\p{L}\p{N}_]+/gu)).toHaveLength(5)
    expect(out).not.toContain('#șase')
  })

  it('leaves captions with few hashtags untouched', () => {
    expect(limitHashtags('Text #știri #românia')).toBe('Text #știri #românia')
  })
})

describe('estimateCostUsd', () => {
  it('prices known models per 1M tokens', () => {
    // gpt-5.4-mini: $0.25/M input, $2.00/M output (best-effort snapshot)
    expect(estimateCostUsd('gpt-5.4-mini', 1_000_000, 0)).toBeCloseTo(0.25)
    expect(estimateCostUsd('gpt-5.4-mini', 0, 1_000_000)).toBeCloseTo(2.0)
  })

  it('falls back to the longest model-name prefix', () => {
    expect(estimateCostUsd('gpt-5.4-mini-2026-05-01', 1_000_000, 0)).toBeCloseTo(0.25)
  })

  it('returns 0 for unknown models (still metered, just unpriced)', () => {
    expect(estimateCostUsd('model-necunoscut', 1_000_000, 1_000_000)).toBe(0)
  })
})

describe('getProvider', () => {
  it('returns the openai provider by default', () => {
    expect(getProvider().name).toBe('openai')
    expect(getProvider('member').name).toBe('openai')
  })

  it('throws a clear error for unimplemented providers', () => {
    const prev = process.env.AI_DEFAULT_PROVIDER_PUBLIC
    process.env.AI_DEFAULT_PROVIDER_PUBLIC = 'anthropic'
    try {
      expect(() => getProvider('public')).toThrow(/neimplementat/)
    } finally {
      if (prev === undefined) delete process.env.AI_DEFAULT_PROVIDER_PUBLIC
      else process.env.AI_DEFAULT_PROVIDER_PUBLIC = prev
    }
  })
})
