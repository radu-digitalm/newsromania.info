/**
 * One-off repair: aggregated-items from the Bursa feed were mojibaked by the
 * pre-fix UTF-8 decode of its iso-8859-2 XML (U+FFFD „�"). fetchFeedXml is now
 * charset-aware (scripts/worker/lib/rss.mjs decodeFeedBytes), so this re-fetches
 * the Bursa feed correctly, matches stored rows by guid, and rewrites ONLY the
 * mojibaked fields (title / excerpt, + clusterKey when the title changes) with
 * the properly decoded text. Rows no longer present in the live feed are left
 * to age out via the aggregation TTL. Idempotent (re-running fixes nothing new).
 *
 *   npx payload run scripts/maintenance/repair-bursa-encoding-2026-07.mjs
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { purgeFeedCache } from '../../src/lib/redis.ts'
import { normalizeTitle } from '../worker/lib/cluster.mjs'
import { fixRomanianDiacritics } from '../worker/lib/diacritics.mjs'
import { rssExcerpt } from '../worker/lib/excerpt.mjs'
import { createFeedParser, fetchFeedXml, itemDescription, itemGuid } from '../worker/lib/rss.mjs'

const FFFD = '�'
const hasMojibake = (s) => typeof s === 'string' && s.includes(FFFD)

async function main() {
  const payload = await getPayload({ config: configPromise })

  const feeds = await payload.find({
    collection: 'feeds',
    where: { name: { like: 'Bursa' } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  if (feeds.docs.length === 0) {
    console.log('[repair] niciun feed „Bursa" găsit — nimic de făcut')
    return
  }

  // Fresh, correctly-decoded fetch → guid → item map.
  const parser = createFeedParser()
  const byGuid = new Map()
  for (const feed of feeds.docs) {
    try {
      const res = await fetchFeedXml(feed.url)
      if (res.notModified) continue
      const parsed = await parser.parseString(res.xml)
      for (const item of parsed.items ?? []) {
        const guid = itemGuid(item)
        if (guid) byGuid.set(guid, item)
      }
    } catch (err) {
      console.warn(
        `[repair] fetch „${feed.name}" eșuat: ${err instanceof Error ? err.message : err}`,
      )
    }
  }
  console.log(`[repair] ${byGuid.size} elemente în feedul Bursa curent`)

  let page = 1
  let repaired = 0
  let unfixable = 0
  let garbled = 0
  for (;;) {
    const res = await payload.find({
      collection: 'aggregated-items',
      where: { sourceName: { like: 'Bursa' } },
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
    })
    if (res.docs.length === 0) break

    for (const doc of res.docs) {
      if (!hasMojibake(doc.title) && !hasMojibake(doc.excerpt)) continue
      garbled += 1

      const item = byGuid.get(doc.guid)
      if (!item) {
        unfixable += 1 // aged out of the feed — will TTL-expire
        continue
      }

      const data = {}
      if (hasMojibake(doc.title)) {
        const title = fixRomanianDiacritics(String(item.title ?? '').trim())
        if (title && !hasMojibake(title)) {
          data.title = title
          data.clusterKey = normalizeTitle(title)
        }
      }
      if (hasMojibake(doc.excerpt)) {
        const rss = rssExcerpt(itemDescription(item))
        if (rss !== null) {
          const fixed = fixRomanianDiacritics(rss)
          if (!hasMojibake(fixed)) data.excerpt = fixed
        }
      }

      if (Object.keys(data).length === 0) {
        unfixable += 1
        continue
      }
      await payload.update({
        collection: 'aggregated-items',
        id: doc.id,
        data,
        depth: 0,
        overrideAccess: true,
      })
      repaired += 1
    }

    if (!res.hasNextPage) break
    page += 1
  }

  if (repaired > 0) {
    try {
      const purged = await purgeFeedCache()
      console.log(`[repair] cache de feed golit (${purged} chei)`)
    } catch (err) {
      console.warn(`[repair] purgeFeedCache eșuat: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(
    `[repair] gata — găsite cu „�": ${garbled}, reparate: ${repaired}, ` +
      `nereparabile (negăsite în feed / rămân la TTL): ${unfixable}`,
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
