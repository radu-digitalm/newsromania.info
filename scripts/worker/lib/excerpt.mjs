/**
 * Legal RSS excerpt builder for aggregated items (PROJECT_BRIEF 0.1,
 * docs/legal-basis-aggregation.md).
 *
 * The RSS item's own description / summary / content:encoded is transformed
 * into a VERY-SHORT extract: HTML stripped, whitespace collapsed, then trimmed
 * to at most {@link MAX_EXCERPT_WORDS} Romanian words on a WORD boundary with an
 * ellipsis. This is the „scurt citat / extras foarte scurt" the aggregation
 * rests on — we NEVER store full third-party text.
 *
 * Extracting the publisher's OWN RSS summary is within the legal gate for every
 * feed (including `link-only` ones): the length cap is what keeps it lawful, not
 * the excerptPolicy. AI summarization (src/lib/llm.ts) is the ONLY thing gated
 * behind `ai-excerpt` — see ingest.mjs.
 *
 * Pure helper, zero I/O — unit-tested in tests/rss-helpers.test.ts.
 */

import { stripHtml } from './rss.mjs'

// Mirrors src/lib/llm-validate.ts MAX_EXCERPT_WORDS (the ≤70-word / very-short
// cap) so RSS excerpts and AI excerpts obey the same legal ceiling.
export const MAX_EXCERPT_WORDS = 70

/**
 * Split into words the way the excerpt validator counts them: whitespace
 * tokens that contain at least one letter or digit (hyphenated clitics like
 * „s-a" count as one word). Punctuation-only tokens („—", „…") do not count.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitWords(text) {
  return text.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token))
}

/**
 * Build a legal ≤{@link MAX_EXCERPT_WORDS}-word excerpt from raw RSS text
 * (may contain HTML). Returns null when there is no usable text — the caller
 * then either AI-summarizes (ai-excerpt feeds) or stores the item link-only.
 *
 * @param {string} raw description / summary / content:encoded
 * @param {number} [maxWords]
 * @returns {string | null}
 */
export function rssExcerpt(raw, maxWords = MAX_EXCERPT_WORDS) {
  const text = stripHtml(raw)
  if (text.length === 0) return null
  const words = splitWords(text)
  if (words.length === 0) return null
  if (words.length <= maxWords) return text
  // Over the cap: keep the first maxWords words, tidy dangling punctuation,
  // append an ellipsis. Rebuilding from the word tokens also collapses any
  // odd spacing the source had.
  const clipped = words
    .slice(0, maxWords)
    .join(' ')
    .replace(/[\s,;:–—-]+$/u, '')
  return `${clipped}…`
}
