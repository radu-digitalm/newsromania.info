/**
 * Pure validation helpers for AI-generated excerpts (architecture.md §4,
 * legal gates PROJECT_BRIEF 0.1/0.2). No I/O, no LLM calls — fully unit-tested
 * in tests/llm-validate.test.ts.
 *
 * Legal contract enforced here:
 * - excerpts have AT MOST {@link MAX_EXCERPT_WORDS} Romanian words;
 * - excerpts NEVER share a verbatim run longer than {@link MAX_VERBATIM_RUN}
 *   consecutive words with the third-party source text.
 */

export const MAX_EXCERPT_WORDS = 55
export const MAX_VERBATIM_RUN = 8

/**
 * Split text into words the way a Romanian editor counts them: whitespace
 * separated tokens that contain at least one letter or digit. Hyphenated
 * clitic forms („s-a", „într-o", „dându-și") count as ONE word.
 */
export function splitWords(text: string): string[] {
  return text.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token))
}

/** Romanian-aware word count. Punctuation-only tokens („—", „...") do not count. */
export function wordCount(text: string): number {
  return splitWords(text).length
}

/**
 * Normalize a text into comparison tokens for verbatim-run detection:
 * lowercase, diacritics stripped (ă/â/î/ș/ț and legacy cedilla ş/ţ collapse
 * to ASCII), split on ANY non-alphanumeric run — so hyphenated forms split
 * („s-a" → „s", „a"). Deliberately stricter than {@link splitWords}: verbatim
 * copying must be caught even through punctuation or diacritic changes.
 */
export function normalizedRunTokens(text: string): string[] {
  const folded = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
  return folded.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 0)
}

/**
 * Length (in words) of the longest run of consecutive words that `a` and `b`
 * share, after normalization (case-, diacritic- and punctuation-insensitive).
 * Classic longest-common-substring DP over word arrays, rolling row (O(n·m)
 * time, O(m) memory — source texts are a few thousand words at most).
 */
export function longestCommonRun(a: string, b: string): number {
  const ta = normalizedRunTokens(a)
  const tb = normalizedRunTokens(b)
  if (ta.length === 0 || tb.length === 0) return 0

  let best = 0
  let prev = new Array<number>(tb.length + 1).fill(0)
  let curr = new Array<number>(tb.length + 1).fill(0)

  for (let i = 1; i <= ta.length; i++) {
    for (let j = 1; j <= tb.length; j++) {
      if (ta[i - 1] === tb[j - 1]) {
        curr[j] = prev[j - 1] + 1
        if (curr[j] > best) best = curr[j]
      } else {
        curr[j] = 0
      }
    }
    ;[prev, curr] = [curr, prev]
    curr.fill(0)
  }
  return best
}

export interface ExcerptValidation {
  ok: boolean
  /**
   * Machine-readable reason codes with details:
   * - `empty` — no words at all;
   * - `too-long:<n>` — n words, over MAX_EXCERPT_WORDS;
   * - `verbatim-run:<n>` — n consecutive words copied from the source,
   *   over MAX_VERBATIM_RUN.
   */
  reasons: string[]
}

/**
 * Validate an AI excerpt against the legal gates before it is ever persisted.
 * `sourceText` is the third-party text the excerpt was derived from.
 */
export function validateExcerpt(excerpt: string, sourceText: string): ExcerptValidation {
  const reasons: string[] = []

  const words = wordCount(excerpt)
  if (words === 0) {
    reasons.push('empty')
  } else if (words > MAX_EXCERPT_WORDS) {
    reasons.push(`too-long:${words}`)
  }

  if (words > 0 && sourceText.trim().length > 0) {
    const run = longestCommonRun(excerpt, sourceText)
    if (run > MAX_VERBATIM_RUN) {
      reasons.push(`verbatim-run:${run}`)
    }
  }

  return { ok: reasons.length === 0, reasons }
}
