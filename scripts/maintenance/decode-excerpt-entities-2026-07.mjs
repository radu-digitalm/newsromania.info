/**
 * One-off backfill (review finding, iulie 2026) — decode raw HTML character
 * references left in already-stored aggregated_items.excerpt. Idempotent, Local
 * API only (hooks run, feed cache is purged by afterChange). Backup first.
 *
 *   npx payload run scripts/maintenance/decode-excerpt-entities-2026-07.mjs
 *
 * Root cause: the old stripHtml() decoded only a named-entity subset, so
 * numeric references from Romanian publisher RSS (curly quotes &#8222;/&#8221;,
 * en-dash &#8211;, ellipsis &#8230;, nbsp &#160;) were stored verbatim and
 * rendered as literal escape codes on the feed. stripHtml() now decodes numeric
 * refs; this cleans the rows written before the fix. Only excerpts containing a
 * numeric reference are touched, and only when decoding actually changes them.
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'

const payload = await getPayload({ config: configPromise })

const log = (msg) => console.log(`[decode-excerpts] ${msg}`)

/** Safe String.fromCodePoint — falls back to the raw match on invalid points. */
function codePointOr(raw, cp) {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return raw
  try {
    return String.fromCodePoint(cp)
  } catch {
    return raw
  }
}

/**
 * Decode HTML character references WITHOUT the tag-strip / whitespace-collapse
 * of stripHtml — the stored excerpts are already clean text, so we only want to
 * turn the leftover entities into their characters and leave everything else
 * byte-for-byte intact.
 */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (m, dec) => codePointOr(m, Number.parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => codePointOr(m, Number.parseInt(hex, 16)))
}

try {
  const { docs } = await payload.find({
    collection: 'aggregated-items',
    where: { excerpt: { contains: '&#' } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  log(`candidate rows (excerpt contains '&#'): ${docs.length}`)

  let changed = 0
  for (const doc of docs) {
    const before = doc.excerpt
    if (typeof before !== 'string') continue
    const after = decodeEntities(before)
    if (after === before) continue
    await payload.update({
      collection: 'aggregated-items',
      id: doc.id,
      data: { excerpt: after },
      depth: 0,
      overrideAccess: true,
    })
    changed++
    log(`id ${doc.id}: decoded`)
  }
  log(`done — ${changed} row(s) updated`)
} finally {
  // getPayload keeps the pg pool open; exit so the script terminates.
  process.exit(0)
}
