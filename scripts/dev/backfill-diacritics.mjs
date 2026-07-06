/**
 * ONE-OFF idempotent backfill: normalize legacy cedilla diacritics (ş/ţ) to
 * the correct comma-below forms (ș/ț) in aggregated-items titles + excerpts —
 * the same mapping the ingest worker now applies (scripts/worker/lib/
 * diacritics.mjs). Fixes rows ingested before that step existed.
 *
 * Run: npx payload run scripts/dev/backfill-diacritics.mjs
 *
 * - Only rows whose title/excerpt actually change are written; re-running is
 *   a no-op.
 * - The slug is sent back VERBATIM: the slug field's beforeValidate hook
 *   would otherwise regenerate it from the updated title and lose the
 *   uniqueness suffix/truncation applied at ingest (breaking published URLs).
 * - No cache handling needed: the aggregated-items afterChange hook already
 *   purges the Redis feed cache on every update.
 */

import { getPayloadClient } from '../../src/lib/payload.ts'
import { fixRomanianDiacritics } from '../worker/lib/diacritics.mjs'

const PAGE_SIZE = 200

const payload = await getPayloadClient()

let page = 1
let scanned = 0
let updated = 0

for (;;) {
  // Stable sort — updating title/excerpt never moves a doc across pages.
  const res = await payload.find({
    collection: 'aggregated-items',
    limit: PAGE_SIZE,
    page,
    depth: 0,
    sort: 'createdAt',
    overrideAccess: true,
  })

  for (const doc of res.docs) {
    scanned += 1
    const title = fixRomanianDiacritics(doc.title)
    const excerpt =
      typeof doc.excerpt === 'string' ? fixRomanianDiacritics(doc.excerpt) : doc.excerpt
    if (title === doc.title && excerpt === doc.excerpt) continue

    await payload.update({
      collection: 'aggregated-items',
      id: doc.id,
      data: { title, excerpt, slug: doc.slug },
      depth: 0,
      overrideAccess: true,
    })
    updated += 1
    console.log(`[backfill-diacritics] ✎ ${doc.id}: „${title.slice(0, 70)}”`)
  }

  if (!res.hasNextPage) break
  page += 1
}

console.log(`[backfill-diacritics] gata — ${scanned} rânduri verificate, ${updated} corectate`)
process.exit(0)
