/**
 * One-off cleanup: stored aggregated-items excerpts that carry an undecoded
 * named HTML entity (e.g. „&copy;") and/or a WordPress publisher footer
 * („© G4Media.ro.", „… appeared first on …"). Both are now handled at ingest
 * (scripts/worker/lib/rss.mjs stripHtml named-entity map + excerpt.mjs
 * stripPublisherBoilerplate); this repairs the rows already in the DB.
 *
 * Pure text transform on the STORED excerpt — no re-fetch. Idempotent: a clean
 * excerpt maps to itself and is skipped. Never empties an excerpt (a row that
 * is ALL boilerplate is left untouched for manual review).
 *
 *   npx payload run scripts/maintenance/repair-excerpt-boilerplate-2026-07.mjs
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { purgeFeedCache } from '../../src/lib/redis.ts'
import { stripPublisherBoilerplate } from '../worker/lib/excerpt.mjs'
import { fixRomanianDiacritics } from '../worker/lib/diacritics.mjs'
import { stripHtml } from '../worker/lib/rss.mjs'

/** Same transform ingest now applies, minus the length clamp (rows are already ≤cap). */
function cleanExcerpt(excerpt) {
  return fixRomanianDiacritics(stripPublisherBoilerplate(stripHtml(excerpt)))
}

async function main() {
  const payload = await getPayload({ config: configPromise })

  // Candidate rows: excerpt contains an entity ('&…') or a copyright mark ('©')
  // or the English WP footer. The transform is idempotent, so false positives
  // (e.g. „R&D") simply map to themselves and are skipped.
  const where = {
    and: [
      { excerpt: { exists: true } },
      {
        or: [
          { excerpt: { like: '&' } },
          { excerpt: { like: '©' } },
          { excerpt: { like: 'appeared first on' } },
        ],
      },
    ],
  }

  let page = 1
  let scanned = 0
  let updated = 0
  let allBoilerplate = 0
  for (;;) {
    const res = await payload.find({
      collection: 'aggregated-items',
      where,
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
    })
    if (res.docs.length === 0) break

    for (const doc of res.docs) {
      if (typeof doc.excerpt !== 'string' || doc.excerpt.length === 0) continue
      scanned += 1
      const cleaned = cleanExcerpt(doc.excerpt)
      if (cleaned === doc.excerpt) continue
      if (cleaned.length === 0) {
        allBoilerplate += 1 // never blank out — leave for review / TTL
        continue
      }
      await payload.update({
        collection: 'aggregated-items',
        id: doc.id,
        data: { excerpt: cleaned },
        depth: 0,
        overrideAccess: true,
      })
      updated += 1
    }

    if (!res.hasNextPage) break
    page += 1
  }

  if (updated > 0) {
    try {
      const purged = await purgeFeedCache()
      console.log(`[repair] cache de feed golit (${purged} chei)`)
    } catch (err) {
      console.warn(`[repair] purgeFeedCache eșuat: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(
    `[repair] gata — candidate scanate: ${scanned}, actualizate: ${updated}, ` +
      `numai-boilerplate (lăsate neatinse): ${allBoilerplate}`,
  )
}

try {
  await main()
} catch (err) {
  console.error('[repair] eroare fatală:', err instanceof Error ? err.message : err)
  process.exitCode = 1
}
await new Promise((resolve) => process.stdout.write('', resolve))
process.exit(process.exitCode ?? 0)
