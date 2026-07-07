import { siteConfig } from '@/config/site'
import { getPayloadClient } from '@/lib/payload'
import { cacheJson, rkey } from '@/lib/redis'
import { roSlugify } from '@/lib/slugify'
import type {
  AggregatedItem as PayloadAggregatedItem,
  Article as PayloadArticle,
} from '@/payload-types'
import type { AggregatedItem, Category, FeedItem, ImageRef, OriginalArticle } from '@/types/content'
import type { Where } from 'payload'

/**
 * Content read layer (architecture.md §6) — the ONLY place the frontend
 * talks to Payload. Every function maps Payload docs onto the existing
 * `FeedItem` contract (src/types/content.ts), so pages keep their exact
 * rendering contracts (byline vs Sursa, canonical rules, JSON-LD).
 *
 * Feed reads are Redis-cached 60s under `newsromania:feed:<cat>:<page>`;
 * the articles afterChange hook purges `newsromania:feed:*` on publish.
 */

const PAGE_SIZE = 10

/**
 * Upper bound on ?page= — without it, an arbitrary page number would force
 * both collections to be fetched in full (fetchLimit = page*10+1) and each
 * distinct number would mint its own Redis cache key (cheap request →
 * expensive query amplification). 100 pages × 10 items covers far more than
 * the 14-day aggregated window ever holds.
 */
const MAX_PAGE = 100

/** How many recent docs per collection the search scans (keep simple, §6). */
const SEARCH_WINDOW = 100

const FEED_CACHE_TTL_SEC = 60

export interface FeedPage {
  items: FeedItem[]
  hasNextPage: boolean
}

// ---------------------------------------------------------------------------
// Mappers: Payload doc -> FeedItem
// ---------------------------------------------------------------------------

/** Diacritic-stripping, lowercasing normalizer („sanatate” matches „sănătate”). */
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function mapCategory(category: PayloadArticle['category'] | null | undefined): Category {
  if (category && typeof category === 'object') {
    return { slug: category.slug, name: category.name }
  }
  // Un-populated (depth 0) or missing relation — fall back to the first
  // canonical category so the card/kicker still renders. Queries below use
  // depth 1, so in practice this branch only covers legacy/broken docs.
  return siteConfig.categories[0]
}

function mapTags(tags: PayloadArticle['tags']): string[] {
  return (tags ?? []).flatMap((tag) => (typeof tag === 'object' ? [tag.name] : []))
}

/** Category placeholder illustration (public/placeholders/<slug>.png). */
function placeholderImage(category: Category): ImageRef {
  const known = siteConfig.categories.some((c) => c.slug === category.slug)
  return {
    url: `/placeholders/${known ? category.slug : 'generic'}.png`,
    alt: `Ilustrație pentru categoria ${category.name}`,
    width: 1200,
    height: 675,
  }
}

function mapFeaturedImage(media: PayloadArticle['featuredImage'], category: Category): ImageRef {
  if (media && typeof media === 'object' && media.url) {
    return {
      url: media.url,
      alt: media.alt,
      width: media.width ?? 1200,
      height: media.height ?? 675,
    }
  }
  return placeholderImage(category)
}

/**
 * Lexical body -> plain paragraphs (string[]). For now each top-level node's
 * text content becomes one paragraph — the article page renders string[]
 * exactly as before. Rich rendering (headings, links, embeds) comes later.
 */
function lexicalToParagraphs(body: PayloadArticle['body']): string[] {
  const paragraphs: string[] = []
  for (const node of body?.root?.children ?? []) {
    const text = extractText(node).trim()
    if (text.length > 0) paragraphs.push(text)
  }
  return paragraphs
}

function extractText(node: unknown): string {
  if (node === null || typeof node !== 'object') return ''
  const n = node as { text?: unknown; children?: unknown }
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) return n.children.map(extractText).join('')
  return ''
}

export function articleToFeedItem(doc: PayloadArticle): OriginalArticle {
  const category = mapCategory(doc.category)
  const authorName =
    typeof doc.author === 'object' && doc.author !== null ? doc.author.name : 'Redacția NewsRomania'
  return {
    // Prefixed so original/aggregated ids can never collide in one feed.
    id: `original-${doc.id}`,
    type: 'original',
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt ?? '',
    category,
    tags: mapTags(doc.tags),
    // publishedAt is stamped on the draft→published transition (Articles
    // beforeChange hook); createdAt covers legacy docs from before the field.
    publishedAt: doc.publishedAt ?? doc.createdAt,
    image: mapFeaturedImage(doc.featuredImage, category),
    author: { name: authorName, slug: roSlugify(authorName) },
    body: lexicalToParagraphs(doc.body),
  }
}

export function aggregatedToFeedItem(doc: PayloadAggregatedItem): AggregatedItem {
  const category = mapCategory(doc.category)
  // Real publisher photo (design-direction-v2 §5.1): imageUrl comes ONLY from
  // RSS enclosure/media:content (ingest worker) or the owner-approved
  // backfill, and renders only when imageAllowed. Remote URLs are hotlinked
  // by ArticleImage via plain <img> (never proxied through next/image, so no
  // remotePatterns needed); dimensions are the nominal 16:9 box — every
  // surface crops with object-fit: cover, so intrinsic size never drives
  // layout (zero CLS).
  const imageUrl = typeof doc.imageUrl === 'string' ? doc.imageUrl.trim() : ''
  const image: ImageRef =
    doc.imageAllowed && imageUrl.length > 0
      ? { url: imageUrl, alt: doc.title, width: 1200, height: 675 }
      : placeholderImage(category)
  return {
    id: `aggregated-${doc.id}`,
    type: 'aggregated',
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt ?? '',
    category,
    tags: mapTags(doc.tags),
    publishedAt: doc.publishedAt,
    image,
    source: {
      name: doc.sourceName,
      url: doc.sourceHomepage ?? doc.sourceUrl,
    },
    sourceUrl: doc.sourceUrl,
  }
}

/** Union mapper — dispatches on the aggregated-only `sourceUrl` field. */
export function toFeedItem(doc: PayloadArticle | PayloadAggregatedItem): FeedItem {
  return 'sourceUrl' in doc ? aggregatedToFeedItem(doc) : articleToFeedItem(doc)
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function publishedArticlesWhere(categorySlug?: string): Where {
  const clauses: Where[] = [{ _status: { equals: 'published' } }]
  if (categorySlug) clauses.push({ 'category.slug': { equals: categorySlug } })
  return { and: clauses }
}

function liveAggregatedWhere(categorySlug?: string): Where {
  const clauses: Where[] = [{ archived: { not_equals: true } }]
  if (categorySlug) clauses.push({ 'category.slug': { equals: categorySlug } })
  return { and: clauses }
}

/**
 * The merged chronological feed: PUBLISHED original articles + non-archived
 * aggregated items, newest first, pages of 10. Redis-cached 60s under
 * `newsromania:feed:<cat|all>:<page>`.
 */
export async function getFeed({
  page,
  categorySlug,
}: {
  page: number
  categorySlug?: string
}): Promise<FeedPage> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.min(Math.floor(page), MAX_PAGE) : 1

  return cacheJson(rkey('feed', categorySlug ?? 'all', safePage), FEED_CACHE_TTL_SEC, async () => {
    const payload = await getPayloadClient()
    // Fetch one doc past the requested window from EACH collection so the
    // merged slice is exact and hasNextPage never lies.
    const fetchLimit = safePage * PAGE_SIZE + 1

    const [articles, aggregated] = await Promise.all([
      payload.find({
        collection: 'articles',
        where: publishedArticlesWhere(categorySlug),
        sort: '-publishedAt',
        limit: fetchLimit,
        depth: 1,
        draft: false,
      }),
      payload.find({
        collection: 'aggregated-items',
        where: liveAggregatedWhere(categorySlug),
        sort: '-publishedAt',
        limit: fetchLimit,
        depth: 1,
      }),
    ])

    const merged: FeedItem[] = [
      ...articles.docs.map(articleToFeedItem),
      ...aggregated.docs.map(aggregatedToFeedItem),
    ].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))

    const start = (safePage - 1) * PAGE_SIZE
    return {
      items: merged.slice(start, start + PAGE_SIZE),
      hasNextPage: merged.length > safePage * PAGE_SIZE,
    }
  })
}

/** A PUBLISHED original article by slug, or null (drafts never leak). */
export async function getArticle(slug: string): Promise<OriginalArticle | null> {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'articles',
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
    limit: 1,
    depth: 1,
    draft: false,
  })
  const doc = res.docs[0]
  return doc ? articleToFeedItem(doc) : null
}

/** A non-archived aggregated item by slug, or null. */
export async function getAggregated(slug: string): Promise<AggregatedItem | null> {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'aggregated-items',
    where: { and: [{ slug: { equals: slug } }, { archived: { not_equals: true } }] },
    limit: 1,
    depth: 1,
  })
  const doc = res.docs[0]
  return doc ? aggregatedToFeedItem(doc) : null
}

/**
 * Any feed item by slug — originals take precedence (they get the full
 * article page; aggregated items get the excerpt + attribution landing page).
 */
export async function getFeedItemBySlug(slug: string): Promise<FeedItem | null> {
  const article = await getArticle(slug)
  if (article) return article
  return getAggregated(slug)
}

/**
 * Homepage hero — the newest PUBLISHED original article (never an aggregated
 * item), or null pre-seed. Cached under the feed:* namespace so the publish
 * hook's purge also refreshes it.
 */
export async function getFeaturedArticle(): Promise<OriginalArticle | null> {
  return cacheJson(rkey('feed', 'featured', 1), FEED_CACHE_TTL_SEC, async () => {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'articles',
      where: publishedArticlesWhere(),
      sort: '-publishedAt',
      limit: 1,
      depth: 1,
      draft: false,
    })
    const doc = res.docs[0]
    return doc ? articleToFeedItem(doc) : null
  })
}

/** Published originals, newest first — sitemap + JSON-LD surfaces. */
export async function getPublishedOriginals(limit = 500): Promise<OriginalArticle[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'articles',
    where: publishedArticlesWhere(),
    sort: '-publishedAt',
    limit,
    depth: 1,
    draft: false,
  })
  return res.docs.map(articleToFeedItem)
}

/**
 * Diacritic-insensitive search over recent titles + excerpts (§6): fetch a
 * recent window of both collections via the local API, normalize in JS
 * (unaccent-style), filter, newest first. Deliberately simple — a proper
 * Postgres full-text index can replace this later without changing callers.
 */
export async function search(q: string): Promise<FeedItem[]> {
  const needle = normalizeForSearch(q.trim())
  if (needle.length === 0) return []

  const payload = await getPayloadClient()
  const [articles, aggregated] = await Promise.all([
    payload.find({
      collection: 'articles',
      where: publishedArticlesWhere(),
      sort: '-publishedAt',
      limit: SEARCH_WINDOW,
      depth: 1,
      draft: false,
    }),
    payload.find({
      collection: 'aggregated-items',
      where: liveAggregatedWhere(),
      sort: '-publishedAt',
      limit: SEARCH_WINDOW,
      depth: 1,
    }),
  ])

  return [...articles.docs.map(articleToFeedItem), ...aggregated.docs.map(aggregatedToFeedItem)]
    .filter((item) => normalizeForSearch(`${item.title} ${item.excerpt}`).includes(needle))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}
