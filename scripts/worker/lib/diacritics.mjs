/**
 * Romanian diacritics normalization for stored aggregated text
 * (architecture.md §7).
 *
 * Some third-party feeds (e.g. G4Media) still publish titles with the legacy
 * cedilla diacritics ş (U+015F) / ţ (U+0163) instead of the correct Romanian
 * comma-below forms ș (U+0219) / ț (U+021B). Everything the ingest worker
 * STORES (titles, excerpts) is normalized to comma-below before saving.
 * Diacritic-insensitive comparisons elsewhere (cluster keys, slugs) strip
 * both variants via NFD, so they are unaffected either way.
 *
 * Escaped code points throughout — the cedilla and comma-below glyphs are
 * visually near-identical, so literals would be impossible to review.
 *
 * Pure helper, zero I/O — unit-tested in tests/ingest-diacritics.test.ts.
 */

const CEDILLA_TO_COMMA_BELOW = new Map([
  ['\u015f', '\u0219'], // ş → ș
  ['\u015e', '\u0218'], // Ş → Ș
  ['\u0163', '\u021b'], // ţ → ț
  ['\u0162', '\u021a'], // Ţ → Ț
])

/**
 * Map legacy cedilla diacritics to their comma-below equivalents. Idempotent.
 * NFC recomposition runs first, so the decomposed variants (s/S/t/T followed
 * by combining cedilla U+0327) are caught as well.
 *
 * @param {string} text
 * @returns {string} '' for non-string input (mirrors normalizeTitle)
 */
export function fixRomanianDiacritics(text) {
  if (typeof text !== 'string') return ''
  return text
    .normalize('NFC')
    .replace(/[\u015e\u015f\u0162\u0163]/g, (ch) => CEDILLA_TO_COMMA_BELOW.get(ch) ?? ch)
}
