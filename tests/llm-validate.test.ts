import { describe, expect, it } from 'vitest'

import {
  MAX_EXCERPT_WORDS,
  MAX_VERBATIM_RUN,
  longestCommonRun,
  normalizedRunTokens,
  splitWords,
  validateExcerpt,
  wordCount,
} from '../src/lib/llm-validate'

describe('wordCount / splitWords', () => {
  it('counts simple Romanian words', () => {
    expect(wordCount('Guvernul a aprobat bugetul pe anul viitor')).toBe(7)
  })

  it('returns 0 for empty and whitespace-only input', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n\t  ')).toBe(0)
  })

  it('counts hyphenated clitic forms as one word', () => {
    // „s-a", „într-o", „dându-și" — one word each, Romanian editorial convention
    expect(wordCount('s-a dus într-o zi')).toBe(4)
    expect(wordCount('dându-și seama')).toBe(2)
  })

  it('ignores punctuation-only tokens', () => {
    expect(wordCount('da — nu ... poate !')).toBe(3)
  })

  it('handles diacritics (comma-below and legacy cedilla)', () => {
    expect(wordCount('știri sănătate țară şedinţă')).toBe(4)
  })

  it('splits across newlines and multiple spaces', () => {
    expect(wordCount('unu  doi\ntrei\r\npatru')).toBe(4)
  })

  it('counts numbers as words', () => {
    expect(wordCount('inflația a scăzut la 4,9 la sută')).toBe(7)
    expect(splitWords('anul 2026')).toEqual(['anul', '2026'])
  })
})

describe('normalizedRunTokens', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizedRunTokens('Știri din Țară')).toEqual(['stiri', 'din', 'tara'])
  })

  it('splits hyphenated forms into separate tokens', () => {
    expect(normalizedRunTokens('s-a dus')).toEqual(['s', 'a', 'dus'])
  })

  it('drops punctuation entirely', () => {
    expect(normalizedRunTokens('„Bună!", a spus el...')).toEqual(['buna', 'a', 'spus', 'el'])
  })
})

describe('longestCommonRun', () => {
  const source =
    'Guvernul a aprobat miercuri ordonanța de urgență privind plafonarea prețurilor la energie pentru consumatorii casnici, potrivit unui comunicat oficial.'

  it('returns 0 when nothing overlaps', () => {
    expect(longestCommonRun('mere pere prune', source)).toBe(0)
  })

  it('returns 0 for empty inputs', () => {
    expect(longestCommonRun('', source)).toBe(0)
    expect(longestCommonRun(source, '')).toBe(0)
    expect(longestCommonRun('', '')).toBe(0)
  })

  it('finds a short shared run', () => {
    expect(longestCommonRun('plafonarea prețurilor la energie este discutată', source)).toBe(4)
  })

  it('is case-insensitive', () => {
    expect(longestCommonRun('GUVERNUL A APROBAT MIERCURI', source)).toBe(4)
  })

  it('is diacritic-insensitive (catches de-diacritized copying)', () => {
    expect(longestCommonRun('plafonarea preturilor la energie', source)).toBe(4)
  })

  it('ignores punctuation differences inside the run', () => {
    expect(longestCommonRun('energie, pentru consumatorii casnici', source)).toBe(4)
  })

  it('reports the LONGEST run when several exist', () => {
    const excerpt =
      'guvernul a aprobat ceva dar consumatorii casnici sunt vizați de ordonanța de urgență'
    // runs: "guvernul a aprobat" (3), "consumatorii casnici" (2), "ordonanța de urgență" (3)
    expect(longestCommonRun(excerpt, source)).toBe(3)
  })

  it('detects a full verbatim copy', () => {
    expect(longestCommonRun(source, source)).toBe(normalizedRunTokens(source).length)
  })

  it('does not bridge runs across a changed word', () => {
    const excerpt = 'guvernul a aprobat joi ordonanța de urgență'
    // "guvernul a aprobat" (3) then break ("joi" ≠ "miercuri"), then "ordonanța de urgență" (3)
    expect(longestCommonRun(excerpt, source)).toBe(3)
  })
})

describe('validateExcerpt', () => {
  const source =
    'Ministerul Finanțelor a anunțat luni o rectificare bugetară pozitivă. ' +
    'Fondurile suplimentare vor merge către sănătate și educație, a precizat ministrul. ' +
    'Decizia vine după ce încasările din TVA au depășit estimările pentru al treilea trimestru consecutiv.'

  it('accepts a short transformative excerpt', () => {
    const excerpt =
      'Bugetul a fost majorat printr-o rectificare pozitivă, banii în plus fiind direcționați spre spitale și școli, potrivit Ministerului Finanțelor.'
    const verdict = validateExcerpt(excerpt, source)
    expect(verdict.ok).toBe(true)
    expect(verdict.reasons).toEqual([])
  })

  it('rejects empty or whitespace-only excerpts', () => {
    expect(validateExcerpt('', source)).toEqual({ ok: false, reasons: ['empty'] })
    expect(validateExcerpt('  …  ', source).reasons).toEqual(['empty'])
  })

  it(`accepts exactly ${MAX_EXCERPT_WORDS} words, rejects ${MAX_EXCERPT_WORDS + 1}`, () => {
    const atLimit = Array.from({ length: MAX_EXCERPT_WORDS }, (_, i) => `cuvânt${i}`).join(' ')
    expect(validateExcerpt(atLimit, source).ok).toBe(true)

    const overLimit = `${atLimit} extra`
    const verdict = validateExcerpt(overLimit, source)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons).toContain(`too-long:${MAX_EXCERPT_WORDS + 1}`)
  })

  it(`accepts a ${MAX_VERBATIM_RUN}-word run, rejects ${MAX_VERBATIM_RUN + 1}`, () => {
    const words = normalizedRunTokens(source)
    const okRun = words.slice(0, MAX_VERBATIM_RUN).join(' ')
    expect(validateExcerpt(okRun, source).ok).toBe(true)

    const badRun = words.slice(0, MAX_VERBATIM_RUN + 1).join(' ')
    const verdict = validateExcerpt(badRun, source)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons).toContain(`verbatim-run:${MAX_VERBATIM_RUN + 1}`)
  })

  it('catches verbatim runs even with changed punctuation and diacritics', () => {
    const sneaky = 'fondurile suplimentare vor merge catre sanatate si educatie a precizat'
    const verdict = validateExcerpt(sneaky, source)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.some((r) => r.startsWith('verbatim-run:'))).toBe(true)
  })

  it('collects multiple reasons at once', () => {
    const longAndCopied = source + ' ' + Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')
    const verdict = validateExcerpt(longAndCopied, source)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.length).toBe(2)
    expect(verdict.reasons.some((r) => r.startsWith('too-long:'))).toBe(true)
    expect(verdict.reasons.some((r) => r.startsWith('verbatim-run:'))).toBe(true)
  })

  it('skips the verbatim check when source text is empty (nothing to copy from)', () => {
    expect(validateExcerpt('Un rezumat oarecare despre eveniment.', '').ok).toBe(true)
  })

  it('rejects „?” placeholders standing in for unknown figures (e.g. „0-?”)', () => {
    const verdict = validateExcerpt('FCSB a pierdut primul amical al verii, 0-? cu Union.', source)
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons).toContain('placeholder')
    expect(validateExcerpt('Scorul final a fost ?-2 după prelungiri.', source).ok).toBe(false)
    expect(validateExcerpt('Rezultatul rămâne incert?? potrivit sursei.', source).ok).toBe(false)
  })

  it('accepts a legitimate question mark in normal copy', () => {
    expect(
      validateExcerpt('Va fi majorat salariul minim? Guvernul decide vineri.', source).ok,
    ).toBe(true)
  })
})
