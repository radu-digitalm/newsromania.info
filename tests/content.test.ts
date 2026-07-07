import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Content read layer tests (architecture.md §6/§10) — the mappers that turn
 * Payload docs into the FeedItem contract, plus getFeed/search merge logic.
 * Payload local API and Redis are ALWAYS mocked (tests/helpers/mocks.ts).
 */

const findMock = vi.hoisted(() => vi.fn())
const cacheCalls = vi.hoisted(() => [] as Array<{ key: string; ttlSec: number }>)

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({ find: findMock }),
}))

vi.mock('@/lib/redis', async () =>
  (await import('./helpers/mocks')).passthroughRedisModule({ calls: cacheCalls }),
)

import { siteConfig } from '../src/config/site'
import {
  aggregatedToFeedItem,
  articleToFeedItem,
  getFeaturedArticle,
  getFeed,
  search,
  searchPage,
  toFeedItem,
} from '../src/lib/content'
import type {
  AggregatedItem as PayloadAggregatedItem,
  Article as PayloadArticle,
} from '../src/payload-types'
import { aggregatedDoc, articleDoc, lexicalBody } from './helpers/mocks'

const asArticle = (doc: Record<string, unknown>) => doc as unknown as PayloadArticle
const asAggregated = (doc: Record<string, unknown>) => doc as unknown as PayloadAggregatedItem

beforeEach(() => {
  findMock.mockReset()
  cacheCalls.length = 0
})

// ---------------------------------------------------------------------------
// articleToFeedItem (lexical fixture)
// ---------------------------------------------------------------------------

describe('articleToFeedItem', () => {
  it('maps a published article with a lexical body onto the OriginalArticle contract', () => {
    const item = articleToFeedItem(
      asArticle(
        articleDoc({
          id: 42,
          title: 'Bugetul pe 2026 a fost aprobat',
          slug: 'bugetul-pe-2026-a-fost-aprobat',
          excerpt: 'Rezumatul redacției.',
          tags: [{ id: 1, name: 'buget' }, 7, { id: 2, name: 'guvern' }],
          createdAt: '2026-07-03T08:30:00.000Z',
        }),
      ),
    )

    expect(item).toMatchObject({
      id: 'original-42',
      type: 'original',
      slug: 'bugetul-pe-2026-a-fost-aprobat',
      title: 'Bugetul pe 2026 a fost aprobat',
      excerpt: 'Rezumatul redacției.',
      category: { slug: 'actualitate', name: 'Actualitate' },
      publishedAt: '2026-07-03T08:30:00.000Z', // createdAt — no publish date field
      author: { name: 'Ana Ionescu', slug: 'ana-ionescu' },
    })
    // Un-populated tag relations (bare ids) are dropped, names kept in order.
    expect(item.tags).toEqual(['buget', 'guvern'])
    expect(item.body).toEqual([
      'Primul paragraf al articolului.',
      'Al doilea paragraf, cu detalii.',
    ])
  })

  it('flattens nested lexical children and skips empty/whitespace-only nodes', () => {
    const item = articleToFeedItem(
      asArticle(
        articleDoc({
          body: lexicalBody([
            ['Text cu ', 'link intern', ' și coadă.'],
            '   ',
            '',
            'Ultimul paragraf.',
          ]),
        }),
      ),
    )
    expect(item.body).toEqual(['Text cu link intern și coadă.', 'Ultimul paragraf.'])
  })

  it('tolerates a missing/empty lexical root (no crash, empty body)', () => {
    expect(articleToFeedItem(asArticle(articleDoc({ body: null }))).body).toEqual([])
    expect(articleToFeedItem(asArticle(articleDoc({ body: { root: null } }))).body).toEqual([])
  })

  it('falls back to the first canonical category when the relation is un-populated', () => {
    const item = articleToFeedItem(asArticle(articleDoc({ category: 9 })))
    expect(item.category).toEqual(siteConfig.categories[0])
  })

  it('un-populated author falls back to the Redacția byline (slugified)', () => {
    const item = articleToFeedItem(asArticle(articleDoc({ author: 3 })))
    expect(item.author.name).toBe('Redacția NewsRomania')
    expect(item.author.slug).toBe('redactia-newsromania')
  })

  it('maps a populated featuredImage with 1200×675 fallback dimensions', () => {
    const withDims = articleToFeedItem(
      asArticle(
        articleDoc({
          featuredImage: {
            id: 1,
            url: '/media/foto.jpg',
            alt: 'Fotografie',
            width: 800,
            height: 450,
          },
        }),
      ),
    )
    expect(withDims.image).toEqual({
      url: '/media/foto.jpg',
      alt: 'Fotografie',
      width: 800,
      height: 450,
    })

    const noDims = articleToFeedItem(
      asArticle(
        articleDoc({
          featuredImage: { id: 2, url: '/media/foto2.jpg', alt: 'Alt', width: null, height: null },
        }),
      ),
    )
    expect(noDims.image).toMatchObject({ width: 1200, height: 675 })
  })

  it('missing image ⇒ category placeholder; unknown category ⇒ generic placeholder', () => {
    const known = articleToFeedItem(asArticle(articleDoc({ featuredImage: null })))
    expect(known.image?.url).toBe('/placeholders/actualitate.png')
    expect(known.image?.alt).toContain('Actualitate')

    const unknown = articleToFeedItem(
      asArticle(
        articleDoc({
          featuredImage: null,
          category: { id: 99, slug: 'inexistent', name: 'Inexistent' },
        }),
      ),
    )
    expect(unknown.image?.url).toBe('/placeholders/generic.png')
  })

  it('null excerpt becomes an empty string (render-safe)', () => {
    expect(articleToFeedItem(asArticle(articleDoc({ excerpt: null }))).excerpt).toBe('')
  })
})

// ---------------------------------------------------------------------------
// aggregatedToFeedItem
// ---------------------------------------------------------------------------

describe('aggregatedToFeedItem', () => {
  it('maps onto the AggregatedItem contract with prefixed id and source block', () => {
    const item = aggregatedToFeedItem(
      asAggregated(
        aggregatedDoc({
          id: 7,
          sourceUrl: 'https://publisher.example/articol-7',
          sourceHomepage: 'https://publisher.example',
          sourceName: 'Publisher Exemplu',
          publishedAt: '2026-07-04T12:00:00.000Z',
        }),
      ),
    )
    expect(item).toMatchObject({
      id: 'aggregated-7',
      type: 'aggregated',
      publishedAt: '2026-07-04T12:00:00.000Z',
      source: { name: 'Publisher Exemplu', url: 'https://publisher.example' },
      sourceUrl: 'https://publisher.example/articol-7',
    })
  })

  it('source.url falls back to sourceUrl when the homepage is missing', () => {
    const item = aggregatedToFeedItem(
      asAggregated(aggregatedDoc({ sourceHomepage: null, sourceUrl: 'https://alt.example/x' })),
    )
    expect(item.source.url).toBe('https://alt.example/x')
  })

  // Deliberate v2 behavior change (design-direction-v2 §5.1 — owner point 5):
  // allowed remote publisher photos render for real; the placeholder is only
  // the missing/disallowed fallback.
  it('imageAllowed + imageUrl ⇒ real publisher photo (alt = title, 16:9 nominal box)', () => {
    const item = aggregatedToFeedItem(
      asAggregated(
        aggregatedDoc({
          title: 'Titlu foto',
          imageUrl: 'https://publisher.example/foto.jpg',
          imageAllowed: true,
        }),
      ),
    )
    expect(item.image).toEqual({
      url: 'https://publisher.example/foto.jpg',
      alt: 'Titlu foto',
      width: 1200,
      height: 675,
    })
  })

  it('missing, blank or disallowed imageUrl ⇒ category placeholder', () => {
    const missing = aggregatedToFeedItem(asAggregated(aggregatedDoc()))
    expect(missing.image?.url).toBe('/placeholders/sport.png')

    const blank = aggregatedToFeedItem(
      asAggregated(aggregatedDoc({ imageUrl: '   ', imageAllowed: true })),
    )
    expect(blank.image?.url).toBe('/placeholders/sport.png')

    const disallowed = aggregatedToFeedItem(
      asAggregated(
        aggregatedDoc({ imageUrl: 'https://publisher.example/foto.jpg', imageAllowed: false }),
      ),
    )
    expect(disallowed.image?.url).toBe('/placeholders/sport.png')
  })

  it('ids can never collide with originals sharing the same numeric id', () => {
    const original = articleToFeedItem(asArticle(articleDoc({ id: 5 })))
    const aggregated = aggregatedToFeedItem(asAggregated(aggregatedDoc({ id: 5 })))
    expect(original.id).not.toBe(aggregated.id)
  })
})

// ---------------------------------------------------------------------------
// toFeedItem (union dispatch)
// ---------------------------------------------------------------------------

describe('toFeedItem', () => {
  it('dispatches on the aggregated-only sourceUrl field', () => {
    expect(toFeedItem(asArticle(articleDoc())).type).toBe('original')
    expect(toFeedItem(asAggregated(aggregatedDoc())).type).toBe('aggregated')
  })
})

// ---------------------------------------------------------------------------
// getFeed — merge, pagination, cache contract
// ---------------------------------------------------------------------------

/** find() stub serving fixed doc sets with Payload-like limit handling. */
function serveDocs({
  articles,
  aggregated,
}: {
  articles: Array<Record<string, unknown>>
  aggregated: Array<Record<string, unknown>>
}) {
  findMock.mockImplementation(async ({ collection, limit }) => {
    const docs = collection === 'articles' ? articles : aggregated
    return { docs: docs.slice(0, limit) }
  })
}

const iso = (day: number, hour: number) =>
  `2026-07-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`

describe('getFeed', () => {
  it('merges both collections newest-first (originals by createdAt, aggregated by publishedAt)', async () => {
    serveDocs({
      articles: [articleDoc({ id: 1, createdAt: iso(5, 10) })],
      aggregated: [
        aggregatedDoc({ id: 2, publishedAt: iso(5, 12) }),
        aggregatedDoc({ id: 3, publishedAt: iso(5, 8) }),
      ],
    })
    const page = await getFeed({ page: 1 })
    expect(page.items.map((i) => i.id)).toEqual(['aggregated-2', 'original-1', 'aggregated-3'])
    expect(page.hasNextPage).toBe(false)
  })

  it('slices exact pages of 10 and reports hasNextPage from the 11th item', async () => {
    const articles = Array.from({ length: 6 }, (_, i) => articleDoc({ createdAt: iso(6, 20 - i) }))
    const aggregated = Array.from({ length: 5 }, (_, i) =>
      aggregatedDoc({ publishedAt: iso(6, 10 - i) }),
    )
    serveDocs({ articles, aggregated })

    const first = await getFeed({ page: 1 })
    expect(first.items).toHaveLength(10)
    expect(first.hasNextPage).toBe(true) // 11 merged docs

    const second = await getFeed({ page: 2 })
    expect(second.items).toHaveLength(1)
    expect(second.hasNextPage).toBe(false)
  })

  it('hasNextPage is false at exactly a full page (no phantom next page)', async () => {
    serveDocs({
      articles: Array.from({ length: 10 }, (_, i) => articleDoc({ createdAt: iso(6, 20 - i) })),
      aggregated: [],
    })
    const page = await getFeed({ page: 1 })
    expect(page.items).toHaveLength(10)
    expect(page.hasNextPage).toBe(false)
  })

  it('fetches one doc past the window from EACH collection (limit = page*10+1)', async () => {
    serveDocs({ articles: [], aggregated: [] })
    await getFeed({ page: 3 })
    for (const call of findMock.mock.calls) {
      expect(call[0].limit).toBe(31)
    }
  })

  it('sanitizes garbage page numbers to 1', async () => {
    serveDocs({ articles: [articleDoc()], aggregated: [] })
    for (const page of [0, -4, Number.NaN, 1.7]) {
      cacheCalls.length = 0
      await getFeed({ page })
      expect(cacheCalls[0]?.key).toBe('newsromania:feed:all:1')
    }
  })

  it('caches under newsromania:feed:<cat|all>:<page> with a 60s TTL', async () => {
    serveDocs({ articles: [], aggregated: [] })
    await getFeed({ page: 2, categorySlug: 'sport' })
    expect(cacheCalls).toEqual([{ key: 'newsromania:feed:sport:2', ttlSec: 60 }])
  })

  it('filters both collections by category.slug and never leaks drafts/archived', async () => {
    serveDocs({ articles: [], aggregated: [] })
    await getFeed({ page: 1, categorySlug: 'sport' })

    const articlesWhere = findMock.mock.calls.find((c) => c[0].collection === 'articles')![0]
    expect(articlesWhere.where.and).toContainEqual({ _status: { equals: 'published' } })
    expect(articlesWhere.where.and).toContainEqual({ 'category.slug': { equals: 'sport' } })
    expect(articlesWhere.draft).toBe(false)

    const aggregatedWhere = findMock.mock.calls.find(
      (c) => c[0].collection === 'aggregated-items',
    )![0]
    expect(aggregatedWhere.where.and).toContainEqual({ archived: { not_equals: true } })
    expect(aggregatedWhere.where.and).toContainEqual({ 'category.slug': { equals: 'sport' } })
  })
})

// ---------------------------------------------------------------------------
// getFeaturedArticle
// ---------------------------------------------------------------------------

describe('getFeaturedArticle', () => {
  it('returns the newest published original (never aggregated) via the feed cache namespace', async () => {
    serveDocs({ articles: [articleDoc({ id: 9, createdAt: iso(6, 9) })], aggregated: [] })
    const featured = await getFeaturedArticle()
    expect(featured?.id).toBe('original-9')
    expect(featured?.type).toBe('original')
    expect(cacheCalls[0]).toEqual({ key: 'newsromania:feed:featured:1', ttlSec: 60 })
    expect(findMock).toHaveBeenCalledTimes(1)
    expect(findMock.mock.calls[0]![0].collection).toBe('articles')
  })

  it('returns null pre-seed (no published originals)', async () => {
    serveDocs({ articles: [], aggregated: [] })
    await expect(getFeaturedArticle()).resolves.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// search — diacritic-insensitive, recent-window, newest first
// ---------------------------------------------------------------------------

describe('search', () => {
  it('empty/whitespace query short-circuits without touching Payload', async () => {
    await expect(search('')).resolves.toEqual([])
    await expect(search('   ')).resolves.toEqual([])
    expect(findMock).not.toHaveBeenCalled()
  })

  it('matches diacritics-insensitively across title + excerpt of both types', async () => {
    serveDocs({
      articles: [
        articleDoc({ id: 1, title: 'Sistemul de sănătate se schimbă', createdAt: iso(5, 10) }),
        articleDoc({ id: 2, title: 'Meciul serii', excerpt: 'Fotbal pur.', createdAt: iso(5, 11) }),
      ],
      aggregated: [
        aggregatedDoc({
          id: 3,
          title: 'Alt subiect',
          excerpt: 'Reformă în sănătatea publică',
          publishedAt: iso(5, 12),
        }),
      ],
    })
    const results = await search('sanatate')
    // „sanatate” (fără diacritice) găsește și „sănătate”, și „sănătatea”
    // (substring match) — newest first.
    expect(results.map((r) => r.id)).toEqual(['aggregated-3', 'original-1'])
  })

  it('the query may carry diacritics while the content does not', async () => {
    serveDocs({
      articles: [articleDoc({ id: 4, title: 'Stiri despre sanatate', createdAt: iso(5, 9) })],
      aggregated: [],
    })
    const results = await search('sănătate')
    expect(results.map((r) => r.id)).toEqual(['original-4'])
  })

  it('returns [] when nothing matches', async () => {
    serveDocs({
      articles: [articleDoc({ title: 'Cu totul altceva' })],
      aggregated: [aggregatedDoc({ title: 'Nici aici' })],
    })
    await expect(search('criptomonede')).resolves.toEqual([])
  })
})

// ---------------------------------------------------------------------------
// searchPage — paged windows over search() (design direction v2.1 §8.8)
// ---------------------------------------------------------------------------

describe('searchPage', () => {
  /** 12 matching originals, newest first by createdAt hour (12 → 1). */
  const twelveMatches = () =>
    serveDocs({
      articles: Array.from({ length: 12 }, (_, i) =>
        articleDoc({ id: i + 1, title: `Economie locală ${i + 1}`, createdAt: iso(1, i + 1) }),
      ),
      aggregated: [],
    })

  it('slices results into 10-item windows, newest first, hasNextPage while more remain', async () => {
    twelveMatches()
    const page1 = await searchPage('economie', 1)
    expect(page1.items).toHaveLength(10)
    expect(page1.items[0]?.id).toBe('original-12')
    expect(page1.items[9]?.id).toBe('original-3')
    expect(page1.hasNextPage).toBe(true)
  })

  it('the final window carries the remainder with hasNextPage false', async () => {
    twelveMatches()
    const page2 = await searchPage('economie', 2)
    expect(page2.items.map((r) => r.id)).toEqual(['original-2', 'original-1'])
    expect(page2.hasNextPage).toBe(false)
  })

  it('a page past the results is empty, not an error', async () => {
    twelveMatches()
    await expect(searchPage('economie', 3)).resolves.toEqual({ items: [], hasNextPage: false })
  })

  it('invalid page numbers clamp to 1 (same guard as getFeed)', async () => {
    twelveMatches()
    const page = await searchPage('economie', Number.NaN)
    expect(page.items[0]?.id).toBe('original-12')
    expect(page.hasNextPage).toBe(true)
  })

  it('empty query short-circuits without touching Payload', async () => {
    await expect(searchPage('   ', 1)).resolves.toEqual({ items: [], hasNextPage: false })
    expect(findMock).not.toHaveBeenCalled()
  })
})
