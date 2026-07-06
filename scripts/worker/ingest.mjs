/**
 * newsromania-ingest — RSS ingestion worker (architecture.md §7).
 *
 * Run from the project root (payload run loads .env + TypeScript). NOTE:
 * `payload run` only forwards script args after a `--` separator:
 *
 *   npx payload run scripts/worker/ingest.mjs
 *   npx payload run scripts/worker/ingest.mjs -- --fixture scripts/worker/fixtures/sample-feed.xml
 *   INGEST_FIXTURE=scripts/worker/fixtures/sample-feed.xml npx payload run scripts/worker/ingest.mjs
 *
 * For every `feeds` doc with active:true:
 *   - conditional GET (etag / If-Modified-Since persisted on the feed doc),
 *     15s timeout, UA newsromania-bot/1.0;
 *   - dedup by guid (guid || link);
 *   - stored titles/excerpts normalized to comma-below diacritics (ş/ţ → ș/ț);
 *   - near-duplicate clustering: normalized-title Jaccard ≥ 0.6 against items
 *     from the last 48h ⇒ same story from another outlet ⇒ SKIP (keep earliest);
 *   - excerptPolicy 'ai-excerpt' ⇒ summarizeExcerpt + categorizeAndTag
 *     (≤ site-config aggregation.maxSummariesPerRun per run; null excerpt ⇒
 *     linkOnly). 'link-only' ⇒ no LLM, feed.defaultCategory;
 *   - images ONLY from enclosure / media:content (legal gate 0.2);
 *   - feed health fields updated on success/failure.
 * Then: archive pass (older than aggregation.itemTtlDays) + purgeFeedCache.
 *
 * LEGAL (PROJECT_BRIEF 0.1/0.2): aggregated items NEVER store third-party
 * full text — only the transformative ≤55-word excerpt (or nothing at all).
 *
 * Concurrency: feeds sequential, items sequential (shared VPS); the whole run
 * is hard-capped at 5 minutes and bails gracefully.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { summarizeExcerpt, categorizeAndTag } from '../../src/lib/llm.ts'
import { purgeFeedCache } from '../../src/lib/redis.ts'
import { roSlugify } from '../../src/lib/slugify.ts'
import { CLUSTER_WINDOW_HOURS, findCluster, normalizeTitle } from './lib/cluster.mjs'
import { fixRomanianDiacritics } from './lib/diacritics.mjs'
import {
  createFeedParser,
  extractImage,
  fetchFeedXml,
  itemGuid,
  itemPublishedAt,
  itemSourceText,
} from './lib/rss.mjs'

const RUN_CAP_MS = 5 * 60 * 1000
const GUID_LOOKUP_BATCH = 80
const MAX_ITEMS_PER_FEED = 50
const MAX_ERROR_LEN = 300
const FIXTURE_FEED_NAME = '[TEST] Fixture'
const FIXTURE_FEED_URL = 'https://fixture.newsromania.invalid/sample-feed.xml'

const startedAt = Date.now()
const timeUp = () => Date.now() - startedAt >= RUN_CAP_MS

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')

function parseArgs(argv) {
  const idx = argv.indexOf('--fixture')
  if (idx !== -1) {
    const fixture = argv[idx + 1]
    if (!fixture) {
      throw new Error('--fixture necesită calea către un fișier XML')
    }
    return { fixture: path.resolve(process.cwd(), fixture) }
  }
  // Fallback pentru `payload run` fără separatorul `--`: variabilă de mediu.
  const fromEnv = process.env.INGEST_FIXTURE
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return { fixture: path.resolve(process.cwd(), fromEnv.trim()) }
  }
  return { fixture: null }
}

/** Batched "which of these guids already exist?" lookup. */
async function findExistingGuids(payload, guids) {
  const existing = new Set()
  for (let i = 0; i < guids.length; i += GUID_LOOKUP_BATCH) {
    const chunk = guids.slice(i, i + GUID_LOOKUP_BATCH)
    const res = await payload.find({
      collection: 'aggregated-items',
      where: { guid: { in: chunk } },
      limit: chunk.length,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of res.docs) existing.add(doc.guid)
  }
  return existing
}

/** Items from the last 48h — the clustering candidate pool. */
async function loadClusterCandidates(payload, now) {
  const since = new Date(now - CLUSTER_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const res = await payload.find({
    collection: 'aggregated-items',
    where: { publishedAt: { greater_than_equal: since } },
    limit: 1000,
    depth: 0,
    sort: 'publishedAt',
    overrideAccess: true,
  })
  return res.docs.map((doc) => ({
    title: doc.title,
    clusterKey: doc.clusterKey,
    publishedAt: doc.publishedAt,
  }))
}

/** slug unic: ro-slug al titlului, cu sufix scurt din guid la coliziune. */
async function uniqueSlug(payload, title, guid, usedSlugs) {
  const base = roSlugify(title).slice(0, 80).replace(/-+$/, '') || 'stire'
  let candidate = base
  const taken = async (slug) => {
    if (usedSlugs.has(slug)) return true
    const res = await payload.find({
      collection: 'aggregated-items',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return res.docs.length > 0
  }
  if (await taken(candidate)) {
    candidate = `${base}-${sha256(guid).slice(0, 8)}`
  }
  usedSlugs.add(candidate)
  return candidate
}

/** find-or-create tag docs by name; returns ids. Never throws the run down. */
async function resolveTagIds(payload, tagNames) {
  const ids = []
  for (const name of tagNames) {
    const slug = roSlugify(name)
    if (!slug) continue
    try {
      const existing = await payload.find({
        collection: 'tags',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (existing.docs[0]) {
        ids.push(existing.docs[0].id)
      } else {
        const created = await payload.create({
          collection: 'tags',
          data: { name, slug },
          depth: 0,
          overrideAccess: true,
        })
        ids.push(created.id)
      }
    } catch (err) {
      console.warn(`[ingest] etichetă ignorată („${name}”): ${errMsg(err)}`)
    }
  }
  return ids
}

function errMsg(err) {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Process one parsed feed's items. Mutates ctx counters + candidate pool.
 * @returns {{ created: number, skipped: number, clustered: number, newestItemAt: Date | null }}
 */
async function processFeedItems(payload, feed, items, ctx) {
  const stats = { created: 0, skipped: 0, clustered: 0, newestItemAt: null }
  const now = ctx.now

  // Earliest first ⇒ "keep earliest" falls out of the processing order.
  const prepared = items
    .map((item) => ({
      item,
      guid: itemGuid(item),
      publishedAt: ctx.dateOverrides?.get(item) ?? itemPublishedAt(item),
      title: typeof item.title === 'string' ? fixRomanianDiacritics(item.title.trim()) : '',
    }))
    .filter((p) => p.guid !== null && p.title.length > 0)
    .sort((a, b) => a.publishedAt - b.publishedAt)
    .slice(0, MAX_ITEMS_PER_FEED)

  const existingGuids = await findExistingGuids(
    payload,
    prepared.map((p) => p.guid),
  )

  for (const { item, guid, publishedAt, title } of prepared) {
    if (timeUp()) {
      console.warn('[ingest] limită de timp atinsă — opresc procesarea elementelor')
      break
    }
    if (publishedAt > (stats.newestItemAt ?? 0)) stats.newestItemAt = publishedAt

    if (existingGuids.has(guid)) {
      stats.skipped += 1
      continue
    }

    // Near-duplicate clustering: same story from another outlet ⇒ skip,
    // the earliest item already carries the cluster.
    const match = findCluster(title, ctx.candidates, { now })
    if (match !== null) {
      stats.clustered += 1
      console.log(`[ingest]   ∪ cluster (${match.similarity.toFixed(2)}): „${title.slice(0, 70)}”`)
      continue
    }

    const link = typeof item.link === 'string' ? item.link.trim() : ''
    if (!/^https?:\/\//i.test(link)) {
      stats.skipped += 1
      continue
    }

    const clusterKey = normalizeTitle(title)
    const sourceText = itemSourceText(item)
    const imageUrl = extractImage(item)

    // --- excerpt policy -----------------------------------------------------
    let excerpt = null
    let linkOnly = true
    let categoryId =
      typeof feed.defaultCategory === 'object' && feed.defaultCategory !== null
        ? feed.defaultCategory.id
        : (feed.defaultCategory ?? null)
    let tagIds = []

    if (feed.excerptPolicy === 'ai-excerpt' && sourceText.length > 0) {
      if (ctx.summariesUsed >= ctx.maxSummariesPerRun) {
        console.log('[ingest]   buget de rezumate epuizat — element doar-link')
      } else {
        ctx.summariesUsed += 1
        try {
          excerpt = await summarizeExcerpt({
            title,
            sourceText,
            sourceName: feed.name,
          })
        } catch (err) {
          console.warn(`[ingest]   rezumat eșuat („${title.slice(0, 50)}”): ${errMsg(err)}`)
          excerpt = null
        }
        if (excerpt !== null) {
          excerpt = fixRomanianDiacritics(excerpt)
          linkOnly = false
          try {
            const cat = await categorizeAndTag({ title, excerpt })
            categoryId = ctx.categoriesBySlug.get(cat.categorySlug) ?? categoryId
            tagIds = await resolveTagIds(payload, cat.tags)
          } catch (err) {
            console.warn(`[ingest]   categorizare eșuată: ${errMsg(err)}`)
          }
        }
      }
    }

    const slug = await uniqueSlug(payload, title, guid, ctx.usedSlugs)
    await payload.create({
      collection: 'aggregated-items',
      data: {
        title,
        slug,
        guid,
        sourceUrl: link,
        sourceName: feed.name,
        sourceHomepage: feed.homepage ?? null,
        feed: feed.id,
        excerpt,
        linkOnly,
        category: categoryId,
        tags: tagIds,
        imageUrl: imageUrl ?? '',
        imageAllowed: imageUrl !== null,
        publishedAt: publishedAt.toISOString(),
        clusterKey,
        contentHash: sha256(`${title}\n${sourceText}`),
        archived: false,
      },
      depth: 0,
      overrideAccess: true,
    })
    ctx.candidates.push({ title, clusterKey, publishedAt: publishedAt.toISOString() })
    stats.created += 1
    console.log(`[ingest]   + creat: „${title.slice(0, 70)}”${linkOnly ? ' (doar link)' : ''}`)
  }

  return stats
}

async function updateFeedHealth(payload, feedId, data) {
  try {
    await payload.update({
      collection: 'feeds',
      id: feedId,
      data,
      depth: 0,
      overrideAccess: true,
    })
  } catch (err) {
    console.warn(`[ingest] nu am putut actualiza starea feedului ${feedId}: ${errMsg(err)}`)
  }
}

/** Live mode: fetch + process one active feed; always updates health fields. */
async function ingestFeed(payload, feed, parser, ctx) {
  const nowIso = new Date().toISOString()
  console.log(`[ingest] feed „${feed.name}”`)
  try {
    const result = await fetchFeedXml(feed.url, {
      etag: feed.etag,
      lastModified: feed.httpLastModified,
    })
    if (result.notModified) {
      console.log('[ingest]   304 — nimic nou')
      await updateFeedHealth(payload, feed.id, {
        lastFetchedAt: nowIso,
        lastError: null,
        consecutiveFailures: 0,
      })
      return { created: 0, skipped: 0, clustered: 0 }
    }

    const parsed = await parser.parseString(result.xml)
    const stats = await processFeedItems(payload, feed, parsed.items ?? [], ctx)

    await updateFeedHealth(payload, feed.id, {
      lastFetchedAt: nowIso,
      ...(stats.newestItemAt ? { lastItemAt: stats.newestItemAt.toISOString() } : {}),
      lastError: null,
      consecutiveFailures: 0,
      etag: result.etag ?? null,
      httpLastModified: result.lastModified ?? null,
    })
    return stats
  } catch (err) {
    const message = errMsg(err).slice(0, MAX_ERROR_LEN)
    console.warn(`[ingest]   eroare la „${feed.name}”: ${message}`)
    await updateFeedHealth(payload, feed.id, {
      lastFetchedAt: nowIso,
      lastError: message,
      consecutiveFailures: (feed.consecutiveFailures ?? 0) + 1,
    })
    return { created: 0, skipped: 0, clustered: 0 }
  }
}

/** Archive aggregated items older than aggregation.itemTtlDays. */
async function archiveOldItems(payload, itemTtlDays) {
  const cutoff = new Date(Date.now() - itemTtlDays * 24 * 60 * 60 * 1000).toISOString()
  const res = await payload.update({
    collection: 'aggregated-items',
    where: {
      and: [{ publishedAt: { less_than: cutoff } }, { archived: { not_equals: true } }],
    },
    data: { archived: true },
    depth: 0,
    overrideAccess: true,
  })
  const count = res.docs?.length ?? 0
  if (res.errors?.length) {
    console.warn(`[ingest] arhivare: ${res.errors.length} erori`)
  }
  return count
}

/** --fixture: parse a local XML against a temporary, INACTIVE test feed. */
async function runFixture(payload, fixturePath, ctx) {
  const xml = fs.readFileSync(fixturePath, 'utf8')
  const parsed = await createFeedParser().parseString(xml)
  const items = parsed.items ?? []

  // Find-or-create the test feed; ALWAYS left inactive + link-only (no LLM).
  const found = await payload.find({
    collection: 'feeds',
    where: { name: { equals: FIXTURE_FEED_NAME } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const feedData = {
    name: FIXTURE_FEED_NAME,
    url: FIXTURE_FEED_URL,
    homepage: 'https://stiri-exemplu.invalid',
    active: false,
    excerptPolicy: 'link-only',
    defaultCategory: ctx.categoriesBySlug.get('actualitate') ?? null,
  }
  const feed = found.docs[0]
    ? await payload.update({
        collection: 'feeds',
        id: found.docs[0].id,
        data: { active: false, excerptPolicy: 'link-only' },
        depth: 0,
        overrideAccess: true,
      })
    : await payload.create({ collection: 'feeds', data: feedData, depth: 0, overrideAccess: true })

  // Shift fixture pubDates so the newest lands 1h ago — keeps relative order
  // and guarantees every item sits inside the 48h clustering window no matter
  // when the integration run happens.
  const dates = items.map((item) => itemPublishedAt(item))
  const newest = Math.max(...dates.map((d) => d.getTime()))
  const delta = Date.now() - 60 * 60 * 1000 - newest
  ctx.dateOverrides = new Map(items.map((item, i) => [item, new Date(dates[i].getTime() + delta)]))

  const stats = await processFeedItems(payload, feed, items, ctx)
  await updateFeedHealth(payload, feed.id, {
    lastFetchedAt: new Date().toISOString(),
    ...(stats.newestItemAt ? { lastItemAt: stats.newestItemAt.toISOString() } : {}),
    lastError: null,
    consecutiveFailures: 0,
  })

  console.log('')
  console.log('[ingest] === Rezultat fixture ===')
  console.log(`[ingest] feed de test: „${FIXTURE_FEED_NAME}” (id ${feed.id}, active:false)`)
  console.log(`[ingest] create: ${stats.created}`)
  console.log(`[ingest] sărite (guid existent/invalide): ${stats.skipped}`)
  console.log(`[ingest] grupate în clustere existente: ${stats.clustered}`)
  console.log('[ingest] Datele rămân în bază — integrarea le inspectează și apoi șterge')
  console.log('[ingest] documentele aggregated-items al căror feed este feedul de test.')
  return stats
}

async function main() {
  const { fixture } = parseArgs(process.argv.slice(2))
  const payload = await getPayload({ config: configPromise })

  const siteConfig = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  const aggregation = siteConfig?.aggregation ?? {}
  const itemTtlDays = aggregation.itemTtlDays ?? 14
  const maxSummariesPerRun = aggregation.maxSummariesPerRun ?? 40

  const categories = await payload.find({
    collection: 'categories',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const ctx = {
    now: Date.now(),
    candidates: await loadClusterCandidates(payload, Date.now()),
    categoriesBySlug: new Map(categories.docs.map((c) => [c.slug, c.id])),
    usedSlugs: new Set(),
    summariesUsed: 0,
    maxSummariesPerRun,
    dateOverrides: null,
  }

  const totals = { created: 0, skipped: 0, clustered: 0, archived: 0 }

  if (fixture) {
    const stats = await runFixture(payload, fixture, ctx)
    totals.created += stats.created
    totals.skipped += stats.skipped
    totals.clustered += stats.clustered
  } else {
    const feeds = await payload.find({
      collection: 'feeds',
      where: { active: { equals: true } },
      limit: 200,
      depth: 0,
      sort: 'name',
      overrideAccess: true,
    })
    console.log(`[ingest] ${feeds.docs.length} feeduri active`)
    const parser = createFeedParser()
    for (const feed of feeds.docs) {
      if (timeUp()) {
        console.warn('[ingest] limită de timp (5 min) atinsă — feeduri rămase la rularea următoare')
        break
      }
      const stats = await ingestFeed(payload, feed, parser, ctx)
      totals.created += stats.created
      totals.skipped += stats.skipped
      totals.clustered += stats.clustered
    }
  }

  // Archive pass (architecture.md §7) — skipped only if the cap is hit.
  if (!timeUp()) {
    try {
      totals.archived = await archiveOldItems(payload, itemTtlDays)
    } catch (err) {
      console.warn(`[ingest] pasul de arhivare a eșuat: ${errMsg(err)}`)
    }
  }

  if (totals.created > 0 || totals.archived > 0) {
    try {
      const purged = await purgeFeedCache()
      console.log(`[ingest] cache de feed golit (${purged} chei)`)
    } catch (err) {
      console.warn(`[ingest] purgeFeedCache a eșuat: ${errMsg(err)}`)
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[ingest] gata în ${seconds}s — create: ${totals.created}, sărite: ${totals.skipped}, ` +
      `grupate: ${totals.clustered}, arhivate: ${totals.archived}, ` +
      `rezumate folosite: ${ctx.summariesUsed}/${maxSummariesPerRun}`,
  )
}

// Top-level await: `payload run` importă modulul și iese imediat ce importul
// se încheie — fără await, rularea s-ar termina înainte de orice procesare.
try {
  await main()
} catch (err) {
  console.error(`[ingest] eroare fatală: ${errMsg(err)}`)
  process.exitCode = 1
}
// Ieșire ordonată: golește stdout (pipe-urile pierd scrierile la exit dur),
// apoi închide procesul chiar dacă pool-ul DB/Redis ține event-loop-ul viu.
await new Promise((resolve) => process.stdout.write('', resolve))
process.exit(process.exitCode ?? 0)
