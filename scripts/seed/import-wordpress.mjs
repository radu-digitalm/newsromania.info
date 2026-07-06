/**
 * One-time WordPress content seed (architecture.md §8, PROJECT_BRIEF Section 22).
 *
 * Imports the last 14 days of posts from the owner's live WordPress site
 * (https://newsromania.info) via the WP REST API (RSS /feed as fallback) and
 * classifies each post:
 *
 *   AGGREGATED — the body clearly cites an external source: an outbound
 *     (non-newsromania.info) anchor in the body tail („Citeste articolul
 *     integral pe …”), a „Sursa” / „sursa foto” mention, or a publisher-name
 *     title prefix. → `aggregated-items`: attribution + FRESH transformative
 *     AI excerpt (src/lib/llm.ts summarizeExcerpt, ≤55 Romanian words). The
 *     third-party text is used ONLY in-memory as summarization input and is
 *     NEVER stored (legal gates PROJECT_BRIEF 0.1/0.2). imageUrl stays empty —
 *     third-party image rights are unclear.
 *
 *   ORIGINAL — owner-written (no external citation). → `articles`: full text
 *     as Lexical paragraphs, byline Redacția, WP featured image downloaded
 *     into the media collection (owner's own upload — allowed).
 *
 * Idempotent: originals dedup by slug, aggregated by guid (= WP post link).
 * Re-running creates nothing new and spends no LLM budget on existing items.
 *
 * Budgets: max IMPORT_MAX_SUMMARIES LLM excerpts (default 60; newest first,
 * overflow becomes linkOnly) and max IMPORT_MAX_IMAGES media downloads
 * (default 30). IMPORT_LIMIT=N processes only the N newest posts (dev/test).
 *
 * Run from the project root (loads .env + TypeScript imports):
 *
 *   npx payload run scripts/seed/import-wordpress.mjs
 *
 * SECRETS: reads process.env only; never prints env values.
 */

import crypto from 'node:crypto'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { getPayload } from 'payload'
import Parser from 'rss-parser'

// Loaded through `payload run`'s tsx runtime, so .ts imports work directly.
import configPromise from '../../src/payload.config.ts'
import { summarizeExcerpt } from '../../src/lib/llm.ts'
import { roSlugify } from '../../src/lib/slugify.ts'

const SITE = 'https://newsromania.info'
const OWN_HOSTS = new Set(['newsromania.info', 'www.newsromania.info'])
const USER_AGENT = 'newsromania-import/1.0'
const REQUEST_GAP_MS = 1000 // polite: 1 req/sec
const WINDOW_DAYS = 14

const MAX_SUMMARIES = intEnv('IMPORT_MAX_SUMMARIES', 60)
const MAX_IMAGES = intEnv('IMPORT_MAX_IMAGES', 30)
const LIMIT = intEnv('IMPORT_LIMIT', 0) // 0 = no limit
const REDACTIA_EMAIL = 'redactia@newsromania.info'

/**
 * WP category slug → our 8 canonical slugs (src/config/site.ts). Derived from
 * exploration (2026-07-06): the live site files EVERY post under
 * „fara-categorie”, so the table mostly documents the obvious identities for
 * robustness. Unknown slugs fall back to 'actualitate'.
 */
const CATEGORY_MAP = {
  'fara-categorie': 'actualitate',
  actualitate: 'actualitate',
  stiri: 'actualitate',
  politica: 'politica',
  economie: 'economie',
  externe: 'externe',
  international: 'externe',
  sport: 'sport',
  sanatate: 'sanatate',
  tehnologie: 'tehnologie',
  'stiinta-tehnologie': 'tehnologie',
  cultura: 'cultura',
}
const DEFAULT_CATEGORY = 'actualitate'

/** Pretty publisher names for hosts seen in the wild; fallback = bare host. */
const PUBLISHER_NAMES = {
  'hotnews.ro': 'HotNews.ro',
  'g4media.ro': 'G4Media.ro',
  'digi24.ro': 'Digi24',
  'libertatea.ro': 'Libertatea',
  'agerpres.ro': 'Agerpres',
}

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// ---------------------------------------------------------------------------
// Small HTML helpers (no DOM — seed-script simple)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  laquo: '«',
  raquo: '»',
  bdquo: '„',
  rdquo: '”',
  ldquo: '“',
  rsquo: '’',
  lsquo: '‘',
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** HTML → array of plain-text paragraphs (per <p>; fallback: line split). */
function htmlToParagraphs(html) {
  const paragraphs = []
  const re = /<p[\s>][\s\S]*?<\/p>|<p>[\s\S]*?<\/p>/gi
  let match
  while ((match = re.exec(html))) {
    const text = stripTags(match[0])
    if (text.length > 0) paragraphs.push(text)
  }
  if (paragraphs.length === 0) {
    for (const chunk of html.split(/<br\s*\/?>|\n{2,}/i)) {
      const text = stripTags(chunk)
      if (text.length > 0) paragraphs.push(text)
    }
  }
  return paragraphs
}

/** string[] paragraphs → minimal valid Lexical editor state (as baseline.mjs). */
function toLexical(paragraphs) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: [
          { type: 'text', text, detail: 0, format: 0, mode: 'normal', style: '', version: 1 },
        ],
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Classification (Section 22) — rule derived from live-site exploration
// ---------------------------------------------------------------------------

function externalAnchors(html) {
  const anchors = []
  const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(html))) {
    try {
      const url = new URL(decodeEntities(match[1]))
      if (!OWN_HOSTS.has(url.hostname)) {
        anchors.push({ url: url.href, host: url.hostname, text: stripTags(match[2]) })
      }
    } catch {
      // malformed href — ignore
    }
  }
  return anchors
}

function publisherNameFor(host) {
  const bare = host.replace(/^www\./, '')
  return PUBLISHER_NAMES[bare] ?? bare
}

/**
 * AGGREGATED iff the body cites an external source. On the live site every
 * aggregated post ends with an outbound „Citeste articolul integral pe X”
 * anchor; we also accept a „Sursa:” / „sursa foto” mention next to an
 * external link, or a publisher-prefixed title, as weaker signals.
 * Returns null (ORIGINAL) or { sourceUrl, sourceName, sourceHomepage, note }.
 */
function detectExternalSource(post) {
  const anchors = externalAnchors(post.contentHtml)
  const plain = stripTags(post.contentHtml)
  const titlePrefix = post.title.match(/^\s*([\w.\- ]{2,30}?)\s*[:|]/)

  if (anchors.length > 0) {
    // Prefer the tail anchor — on this site it IS the canonical source link.
    const tail =
      anchors.findLast((a) => /citeste|citește|articolul integral|sursa/i.test(a.text)) ??
      anchors[anchors.length - 1]
    const url = new URL(tail.url)
    return {
      sourceUrl: tail.url,
      sourceName: publisherNameFor(url.hostname),
      sourceHomepage: url.origin,
      note: null,
    }
  }

  // Weaker signals without a usable link: cite exists but URL is unreliable —
  // per the brief, fall back to the WP link itself and flag it.
  const mentionsSource = /\bsursa(\s+foto)?\s*[:\-]/i.test(plain)
  const publisherPrefixed =
    titlePrefix &&
    /\.(ro|com|net|info|eu)$/i.test(titlePrefix[1].trim().replace(/\s+/g, '').toLowerCase())
  if (mentionsSource || publisherPrefixed) {
    return {
      sourceUrl: post.link,
      sourceName: 'NewsRomania (arhivă)',
      sourceHomepage: SITE,
      note: 'sursă externă citată, dar fără URL fiabil — folosit linkul WP',
    }
  }

  return null // ORIGINAL
}

/** Strip a leading publisher prefix („HOTNEWS.RO:”, „www.g4media |”) when it matches the detected source host. */
function cleanAggregatedTitle(title, sourceHost) {
  const match = title.match(/^\s*([\w.\- ]{2,30}?)\s*[:|]\s*(.+)$/s)
  if (!match) return title.trim()
  const prefixKey = match[1].toLowerCase().replace(/[^a-z0-9]/g, '')
  const hostKey = sourceHost
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]/g, '')
  return prefixKey.length >= 4 && (hostKey.includes(prefixKey) || prefixKey.includes(hostKey))
    ? match[2].trim()
    : title.trim()
}

/** Body text WITHOUT the boilerplate tail — used ONLY in-memory as LLM input. */
function sourceTextFor(post) {
  const paragraphs = htmlToParagraphs(post.contentHtml).filter(
    (p) => !/citeste articolul integral|citește articolul integral/i.test(p) && p !== '…',
  )
  return paragraphs.join('\n').replace(/…\s*$/g, '').trim()
}

// ---------------------------------------------------------------------------
// Fetch: WP REST (paginated) with RSS fallback
// ---------------------------------------------------------------------------

async function politeFetch(url) {
  await sleep(REQUEST_GAP_MS)
  return fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
}

/** Normalized post shape used by the rest of the script. */
function normalizeRestPost(raw) {
  const terms = (raw._embedded?.['wp:term'] ?? []).flat()
  const media = raw._embedded?.['wp:featuredmedia']?.[0]
  return {
    link: raw.link,
    slug: raw.slug,
    title: decodeEntities(raw.title?.rendered ?? '').trim(),
    contentHtml: raw.content?.rendered ?? '',
    excerptHtml: raw.excerpt?.rendered ?? '',
    dateGmt: raw.date_gmt ? `${raw.date_gmt}Z` : new Date().toISOString(),
    categorySlugs: terms.filter((t) => t?.taxonomy === 'category').map((t) => t.slug),
    featuredMedia:
      media?.source_url != null
        ? {
            sourceUrl: media.source_url,
            alt: (media.alt_text || stripTags(media.title?.rendered ?? '') || '').trim(),
          }
        : null,
  }
}

async function fetchViaRest(afterIso) {
  const posts = []
  let page = 1
  let totalPages = 1
  do {
    const url =
      `${SITE}/wp-json/wp/v2/posts?after=${encodeURIComponent(afterIso)}` +
      `&per_page=20&_embed&page=${page}`
    const res = await politeFetch(url)
    if (!res.ok) throw new Error(`REST ${url} → HTTP ${res.status}`)
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) throw new Error(`REST răspuns non-JSON (${contentType})`)
    totalPages = Number.parseInt(res.headers.get('x-wp-totalpages') ?? '1', 10) || 1
    const batch = await res.json()
    if (!Array.isArray(batch)) throw new Error('REST răspuns neașteptat (nu este listă)')
    posts.push(...batch.map(normalizeRestPost))
    page += 1
  } while (page <= totalPages)
  return posts
}

async function fetchViaRss(afterIso) {
  await sleep(REQUEST_GAP_MS)
  const parser = new Parser({
    headers: { 'User-Agent': USER_AGENT },
    timeout: 20_000,
    customFields: { item: [['content:encoded', 'contentEncoded']] },
  })
  const feed = await parser.parseURL(`${SITE}/feed`)
  const cutoff = new Date(afterIso).getTime()
  return (feed.items ?? [])
    .filter((item) => item.link && new Date(item.isoDate ?? item.pubDate ?? 0).getTime() >= cutoff)
    .map((item) => ({
      link: item.link,
      slug: roSlugify(
        new URL(item.link).pathname.replace(/\/+$/, '').split('/').pop() || item.title || '',
      ),
      title: decodeEntities(item.title ?? '').trim(),
      contentHtml: item.contentEncoded ?? item.content ?? '',
      excerptHtml: item.contentSnippet ?? '',
      dateGmt: new Date(item.isoDate ?? item.pubDate).toISOString(),
      categorySlugs: (item.categories ?? []).map((c) => roSlugify(String(c))),
      featuredMedia: null, // RSS fallback carries no reliable owned-media info
    }))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const afterIso = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 19)

console.log(`[import-wp] Sursă: ${SITE} — postări după ${afterIso} (UTC)`)

let posts
let fetchMode = 'rest'
try {
  posts = await fetchViaRest(afterIso)
} catch (restErr) {
  console.warn(`[import-wp] REST indisponibil (${restErr.message}) — încerc RSS /feed …`)
  fetchMode = 'rss'
  try {
    posts = await fetchViaRss(afterIso)
  } catch (rssErr) {
    console.error(
      `[import-wp] Situl nu a putut fi citit nici prin REST, nici prin RSS.\n` +
        `  REST: ${restErr.message}\n  RSS:  ${rssErr.message}\n` +
        `Nu import nimic (nu inventez conținut) — scriptul rămâne rulabil ulterior.`,
    )
    process.exit(1)
  }
}

// Newest first (WP default order); LIMIT applies to the newest posts.
posts.sort((a, b) => new Date(b.dateGmt) - new Date(a.dateGmt))
if (LIMIT > 0) posts = posts.slice(0, LIMIT)
console.log(`[import-wp] Preluate ${posts.length} postări prin ${fetchMode.toUpperCase()}.`)

const payload = await getPayload({ config: configPromise })

const stats = {
  fetched: posts.length,
  original: 0,
  aggregated: 0,
  createdArticles: 0,
  createdAggregated: 0,
  skippedExistingArticles: 0,
  skippedExistingAggregated: 0,
  summarized: 0,
  linkOnly: 0,
  imagesUploaded: 0,
  anomalies: [],
}

try {
  // Reference data --------------------------------------------------------
  const categoryIdBySlug = {}
  const { docs: categories } = await payload.find({ collection: 'categories', limit: 50, depth: 0 })
  for (const cat of categories) categoryIdBySlug[cat.slug] = cat.id
  if (!categoryIdBySlug[DEFAULT_CATEGORY]) {
    console.error(
      '[import-wp] Categoriile canonice lipsesc — rulează întâi scripts/seed/baseline.mjs',
    )
    process.exit(1)
  }

  const { docs: redactiaDocs } = await payload.find({
    collection: 'users',
    where: { email: { equals: REDACTIA_EMAIL } },
    limit: 1,
    depth: 0,
  })
  const redactiaUser = redactiaDocs[0]

  const categoryIdFor = (slugs) => {
    for (const slug of slugs) {
      const mapped = CATEGORY_MAP[slug]
      if (mapped && categoryIdBySlug[mapped]) return categoryIdBySlug[mapped]
    }
    return categoryIdBySlug[DEFAULT_CATEGORY]
  }

  let summariesLeft = MAX_SUMMARIES
  let imagesLeft = MAX_IMAGES

  for (const post of posts) {
    const source = detectExternalSource(post)

    if (source) {
      // ---------------------------------------------------- AGGREGATED item
      stats.aggregated += 1
      if (source.note) stats.anomalies.push(`${post.link}: ${source.note}`)

      const existing = await payload.find({
        collection: 'aggregated-items',
        where: { guid: { equals: post.link } },
        limit: 1,
        depth: 0,
      })
      if (existing.docs[0]) {
        stats.skippedExistingAggregated += 1
        continue
      }

      const title = cleanAggregatedTitle(post.title, new URL(source.sourceUrl).hostname)
      const sourceText = sourceTextFor(post) // in-memory ONLY, never stored
      const contentHash = crypto.createHash('sha256').update(sourceText).digest('hex')

      let excerpt = null
      if (summariesLeft > 0 && sourceText.length >= 40) {
        try {
          excerpt = await summarizeExcerpt(
            { title, sourceText, sourceName: source.sourceName },
            { purpose: 'seed' },
          )
          summariesLeft -= 1
          if (excerpt) stats.summarized += 1
        } catch (err) {
          stats.anomalies.push(`${post.link}: rezumat eșuat (${err.message}) — doar link`)
        }
      }
      if (!excerpt) stats.linkOnly += 1

      await payload.create({
        collection: 'aggregated-items',
        data: {
          title,
          slug: post.slug,
          guid: post.link,
          sourceUrl: source.sourceUrl,
          sourceName: source.sourceName,
          sourceHomepage: source.sourceHomepage,
          excerpt: excerpt ?? '',
          linkOnly: excerpt === null,
          category: categoryIdFor(post.categorySlugs),
          imageUrl: '', // third-party image rights unclear (PROJECT_BRIEF 0.2)
          imageAllowed: false,
          publishedAt: post.dateGmt,
          contentHash,
          archived: false,
        },
        depth: 0,
      })
      stats.createdAggregated += 1
    } else {
      // ------------------------------------------------------ ORIGINAL article
      stats.original += 1

      const slug = roSlugify(post.slug || post.title)
      const existing = await payload.find({
        collection: 'articles',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 0,
        draft: true,
      })
      if (existing.docs[0]) {
        stats.skippedExistingArticles += 1
        continue
      }
      if (!redactiaUser) {
        stats.anomalies.push(
          `${post.link}: fără utilizatorul Redacția — rulează baseline.mjs întâi`,
        )
        continue
      }

      const paragraphs = htmlToParagraphs(post.contentHtml)
      if (paragraphs.length === 0) {
        stats.anomalies.push(`${post.link}: corp gol — sărit`)
        continue
      }

      // Featured image — the owner's OWN WordPress upload (allowed).
      let featuredImageId = null
      if (post.featuredMedia && imagesLeft > 0) {
        try {
          const res = await politeFetch(post.featuredMedia.sourceUrl)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buffer = Buffer.from(await res.arrayBuffer())
          const name =
            path.basename(new URL(post.featuredMedia.sourceUrl).pathname) || `${slug}.jpg`
          const media = await payload.create({
            collection: 'media',
            data: { alt: post.featuredMedia.alt || post.title },
            file: {
              data: buffer,
              name,
              size: buffer.length,
              mimetype: res.headers.get('content-type') ?? 'image/jpeg',
            },
            depth: 0,
          })
          featuredImageId = media.id
          imagesLeft -= 1
          stats.imagesUploaded += 1
        } catch (err) {
          stats.anomalies.push(`${post.link}: imagine nedescărcată (${err.message})`)
        }
      }

      await payload.create({
        collection: 'articles',
        data: {
          title: post.title,
          slug,
          category: categoryIdFor(post.categorySlugs),
          author: redactiaUser.id,
          excerpt: stripTags(post.excerptHtml)
            .replace(/\s*\[…\]\s*$/, '')
            .slice(0, 300),
          body: toLexical(paragraphs),
          featuredImage: featuredImageId,
          _status: 'published',
          // Articles have no publishedAt field (arch §3) — preserve the WP
          // date via createdAt so feed ordering (§6) stays correct.
          createdAt: post.dateGmt,
        },
        depth: 0,
      })
      stats.createdArticles += 1
    }
  }

  console.log('[import-wp] Rezumat rulare:', JSON.stringify(stats, null, 2))
  console.log('[import-wp] Gata — rularea repetată nu creează duplicate.')
} finally {
  await payload.destroy()
}

process.exit(0)
