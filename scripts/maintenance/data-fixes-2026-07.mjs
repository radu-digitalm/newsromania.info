/**
 * One-off data fixes (review findings, iulie 2026) — idempotent, Local API
 * only (hooks run, feed cache is purged by afterChange). Backup first.
 *
 *   npx payload run scripts/maintenance/data-fixes-2026-07.mjs
 *
 * 1. articles.publishedAt backfill: published articles get createdAt as their
 *    publish date (the surrogate the frontend used before the field existed).
 * 2. aggregated_items titles: strip the leaked „www.g4media | ” publisher
 *    prefix (cleanAggregatedTitle bug, fixed in import-wordpress.mjs). Slugs
 *    are DELIBERATELY kept — they are live permalinks used in queued social
 *    captions; the slug field is passed through unchanged.
 * 3. Excerpt copy fixes: id 16 „incendind”→„incendiind”; id 18 drops the
 *    unverifiable score placeholder „0-?”.
 * 4. Demo fixtures (fictional example.org publishers) → archived:true so they
 *    stop rendering on the public feed (baseline.mjs now seeds them archived).
 * 5. social-queue: rewrite still-queued captions with the fixed pipeline
 *    (clampTweet t.co budget + hashtag convention); LLM regeneration with a
 *    deterministic clampTweet fallback per story.
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { clampTweet, writeCaptions } from '../../src/lib/llm.ts'

const payload = await getPayload({ config: configPromise })

const log = (msg) => console.log(`[data-fixes] ${msg}`)

try {
  // --- 1. articles.publishedAt backfill -------------------------------------
  const articles = await payload.find({
    collection: 'articles',
    where: {
      and: [{ _status: { equals: 'published' } }, { publishedAt: { exists: false } }],
    },
    limit: 1000,
    depth: 0,
    draft: false,
    overrideAccess: true,
  })
  for (const doc of articles.docs) {
    await payload.update({
      collection: 'articles',
      id: doc.id,
      data: { publishedAt: doc.createdAt, slug: doc.slug },
      depth: 0,
      draft: false,
      overrideAccess: true,
    })
  }
  log(`publishedAt backfill: ${articles.docs.length} articole`)

  // --- 2. strip the g4media title prefix ------------------------------------
  const polluted = await payload.find({
    collection: 'aggregated-items',
    where: { title: { like: 'www.g4media%' } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  let cleaned = 0
  for (const doc of polluted.docs) {
    const title = doc.title.replace(/^\s*www\.g4media\s*\|\s*/i, '')
    if (title === doc.title) continue
    await payload.update({
      collection: 'aggregated-items',
      id: doc.id,
      // slug passed through EXPLICITLY: the slugify hook would otherwise
      // regenerate it from the new title and break the live permalink.
      data: { title, slug: doc.slug },
      depth: 0,
      overrideAccess: true,
    })
    cleaned += 1
  }
  log(`titluri g4media curățate: ${cleaned}/${polluted.docs.length}`)

  // --- 3. excerpt copy fixes --------------------------------------------------
  const excerptFixes = [
    { id: 16, from: 'incendind', to: 'incendiind' },
    { id: 18, from: /,\s*0-\?\s*cu\s+/u, to: ' cu ' },
  ]
  for (const fix of excerptFixes) {
    let doc = null
    try {
      doc = await payload.findByID({
        collection: 'aggregated-items',
        id: fix.id,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      log(`excerpt id=${fix.id}: documentul nu există — sar peste`)
      continue
    }
    if (typeof doc.excerpt !== 'string') continue
    const excerpt = doc.excerpt.replace(fix.from, fix.to)
    if (excerpt === doc.excerpt) {
      log(`excerpt id=${fix.id}: nimic de corectat (deja curat)`)
      continue
    }
    await payload.update({
      collection: 'aggregated-items',
      id: fix.id,
      data: { excerpt },
      depth: 0,
      overrideAccess: true,
    })
    log(`excerpt id=${fix.id} corectat`)
  }

  // --- 4. archive the fictional example.org fixtures --------------------------
  const demo = await payload.find({
    collection: 'aggregated-items',
    where: {
      and: [{ sourceUrl: { like: 'https://example.org/%' } }, { archived: { not_equals: true } }],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of demo.docs) {
    await payload.update({
      collection: 'aggregated-items',
      id: doc.id,
      data: { archived: true, slug: doc.slug },
      depth: 0,
      overrideAccess: true,
    })
    log(`arhivat demo: ${doc.slug}`)
  }

  // --- 5. rewrite still-queued social captions --------------------------------
  const queue = await payload.find({
    collection: 'social-queue',
    where: { status: { equals: 'queued' } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const byStory = new Map()
  for (const doc of queue.docs) {
    const key = `${doc.contentType}:${doc.refId}`
    if (!byStory.has(key)) byStory.set(key, [])
    byStory.get(key).push(doc)
  }
  log(`social-queue: ${queue.docs.length} intrări „queued” în ${byStory.size} povești`)

  for (const [key, entries] of byStory) {
    const [contentType, refId] = key.split(':')
    const collection = contentType === 'original' ? 'articles' : 'aggregated-items'
    let story = null
    try {
      story = await payload.findByID({ collection, id: refId, depth: 0, overrideAccess: true })
    } catch {
      log(`poveste negăsită (${key}) — descrierile rămân neschimbate`)
      continue
    }
    const title = story.title
    const excerpt =
      typeof story.excerpt === 'string' && story.excerpt.trim() ? story.excerpt.trim() : title
    const url = entries[0].link

    let captions = null
    try {
      captions = await writeCaptions({ title, excerpt, url, type: contentType })
    } catch (err) {
      log(`LLM indisponibil pentru ${key} (${err?.message ?? err}) — folosesc clampTweet(titlu)`)
    }

    for (const entry of entries) {
      let caption = captions?.[entry.platform]
      if (!caption && entry.platform === 'twitter') {
        // Deterministic fallback: the title always fits under the t.co budget.
        caption = clampTweet(title, url)
      }
      if (!caption || caption === entry.caption) continue
      await payload.update({
        collection: 'social-queue',
        id: entry.id,
        data: { caption },
        depth: 0,
        overrideAccess: true,
      })
      log(`  caption rescris: ${entry.platform} #${entry.id}`)
    }
  }

  log('gata.')
} finally {
  await payload.destroy()
}
process.exit(0)
