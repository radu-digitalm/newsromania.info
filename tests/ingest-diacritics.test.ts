import { describe, expect, it } from 'vitest'

// Pure ESM helper — no Payload, no network, no LLM.
import { fixRomanianDiacritics } from '../scripts/worker/lib/diacritics.mjs'

// Escaped code points throughout (matching diacritics.mjs): the legacy
// cedilla glyphs and the comma-below ones are visually near-identical.
const LEGACY = { s: '\u015f', S: '\u015e', t: '\u0163', T: '\u0162' } // ş Ş ţ Ţ
const CORRECT = { s: '\u0219', S: '\u0218', t: '\u021b', T: '\u021a' } // ș Ș ț Ț
const COMBINING_CEDILLA = '\u0327'

describe('fixRomanianDiacritics', () => {
  it('maps every legacy cedilla form to its comma-below equivalent', () => {
    expect(fixRomanianDiacritics(`${LEGACY.s}${LEGACY.S}${LEGACY.t}${LEGACY.T}`)).toBe(
      `${CORRECT.s}${CORRECT.S}${CORRECT.t}${CORRECT.T}`,
    )
  })

  it('fixes a real feed headline (G4Media-style cedilla diacritics)', () => {
    const legacy = `Drumul Padi${LEGACY.s}-Ic Ponor din jude${LEGACY.t}ul Bihor leagă jude${LEGACY.t}ele Cluj ${LEGACY.s}i Alba`
    expect(fixRomanianDiacritics(legacy)).toBe(
      `Drumul Padi${CORRECT.s}-Ic Ponor din jude${CORRECT.t}ul Bihor leagă jude${CORRECT.t}ele Cluj ${CORRECT.s}i Alba`,
    )
  })

  it('leaves already-correct comma-below text untouched', () => {
    const correct = `${CORRECT.S}tirea zilei: ${CORRECT.t}ară, înghe${CORRECT.t} ${CORRECT.s}i măr${CORRECT.t}i${CORRECT.s}or`
    expect(fixRomanianDiacritics(correct)).toBe(correct)
  })

  it('catches the decomposed variant (s/t + combining cedilla U+0327) via NFC', () => {
    const decomposed = `s${COMBINING_CEDILLA}i t${COMBINING_CEDILLA}ara S${COMBINING_CEDILLA} T${COMBINING_CEDILLA}`
    expect(fixRomanianDiacritics(decomposed)).toBe(
      `${CORRECT.s}i ${CORRECT.t}ara ${CORRECT.S} ${CORRECT.T}`,
    )
  })

  it('is idempotent (safe on re-ingest and backfill re-runs)', () => {
    const once = fixRomanianDiacritics(
      `jude${LEGACY.t}ul Bihor ${LEGACY.s}i jude${LEGACY.t}ele Cluj`,
    )
    expect(fixRomanianDiacritics(once)).toBe(once)
    expect(once).toBe(`jude${CORRECT.t}ul Bihor ${CORRECT.s}i jude${CORRECT.t}ele Cluj`)
  })

  it('leaves plain ASCII and other Romanian diacritics (ă, â, î) alone', () => {
    expect(fixRomanianDiacritics('Bugetul pe 2026 aprobat')).toBe('Bugetul pe 2026 aprobat')
    expect(fixRomanianDiacritics('măsură în câmp')).toBe('măsură în câmp')
  })

  it('returns empty string for non-string input (mirrors normalizeTitle)', () => {
    expect(fixRomanianDiacritics(undefined as unknown as string)).toBe('')
    expect(fixRomanianDiacritics(null as unknown as string)).toBe('')
  })
})
