import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * „Mai multe știri” section (owner requirement 4) — the read-layer pool
 * (getMoreNews: same-category first, latest-backfill, exclusion, cache
 * contract) and the per-row ad layout (moreNewsCells + the MoreNews server
 * component): one 'feed' ad block at the end of each 3-column desktop row
 * (ad after every 2 cards), items cached but the ad layout never cached.
 *
 * Payload local API and Redis are ALWAYS mocked (tests/helpers/mocks.ts).
 * The MoreNews component is invoked as a plain async function (React server
 * components are just functions) and asserted on its element tree — no DOM.
 */

const findMock = vi.hoisted(() => vi.fn())
const cacheCalls = vi.hoisted(() => [] as Array<{ key: string; ttlSec: number }>)

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({ find: findMock }),
}))

vi.mock('@/lib/redis', async () =>
  (await import('./helpers/mocks')).passthroughRedisModule({ calls: cacheCalls }),
)

import type { ReactElement, ReactNode } from 'react'

import { AdSlot } from '../src/components/ads/AdSlot'
import { ArticleCard } from '../src/components/articles/ArticleCard'
import { MORE_NEWS_COUNT, MoreNews, moreNewsCells } from '../src/components/articles/MoreNews'
import type { AdPlan } from '../src/lib/ads/engine-core'
import { getMoreNews } from '../src/lib/content'
import type { FeedItem } from '../src/types/content'
import { aggregatedDoc, articleDoc } from './helpers/mocks'

beforeEach(() => {
  findMock.mockReset()
  cacheCalls.length = 0
})

const iso = (day: number, hour: number) =>
  `2026-07-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`

/**
 * find() stub with Payload-like where/sort/limit handling: filters by the
 * category.slug clause when present, newest-first, sliced to `limit` — so
 * the category-first + backfill queries see realistic windows.
 */
function serveCatalog({
  articles,
  aggregated,
}: {
  articles: Array<Record<string, unknown>>
  aggregated: Array<Record<string, unknown>>
}) {
  findMock.mockImplementation(async ({ collection, where, limit }) => {
    const docs = collection === 'articles' ? articles : aggregated
    const clauses = (where?.and ?? []) as Array<Record<string, { equals?: string }>>
    const category = clauses.find((clause) => 'category.slug' in clause)?.['category.slug']?.equals
    const stamp = (doc: Record<string, unknown>) =>
      Date.parse((doc.publishedAt ?? doc.createdAt) as string)
    const filtered = docs.filter(
      (doc) => !category || (doc.category as { slug?: string })?.slug === category,
    )
    return { docs: [...filtered].sort((a, b) => stamp(b) - stamp(a)).slice(0, limit) }
  })
}

const sportCategory = { id: 2, slug: 'sport', name: 'Sport' }
const politicsCategory = { id: 3, slug: 'politica', name: 'Politică' }

// ---------------------------------------------------------------------------
// getMoreNews — pool composition + cache contract
// ---------------------------------------------------------------------------

describe('getMoreNews', () => {
  it('serves same-category items newest first when the category can fill the limit', async () => {
    serveCatalog({
      articles: [],
      aggregated: Array.from({ length: 8 }, (_, i) =>
        aggregatedDoc({
          id: i + 1,
          slug: `sport-${i + 1}`,
          category: sportCategory,
          publishedAt: iso(6, 20 - i),
        }),
      ),
    })

    const items = await getMoreNews({ excludeSlug: 'alta-stire', categorySlug: 'sport' })
    expect(items.map((i) => i.id)).toEqual([
      'aggregated-1',
      'aggregated-2',
      'aggregated-3',
      'aggregated-4',
      'aggregated-5',
      'aggregated-6',
    ])
    // Category window was enough — no backfill round trip.
    expect(findMock).toHaveBeenCalledTimes(2)
  })

  it('always excludes the article being read (by slug)', async () => {
    serveCatalog({
      articles: [],
      aggregated: Array.from({ length: 7 }, (_, i) =>
        aggregatedDoc({
          id: i + 1,
          slug: `sport-${i + 1}`,
          category: sportCategory,
          publishedAt: iso(6, 20 - i),
        }),
      ),
    })

    const items = await getMoreNews({ excludeSlug: 'sport-2', categorySlug: 'sport' })
    expect(items).toHaveLength(6)
    expect(items.map((i) => i.slug)).not.toContain('sport-2')
  })

  it('backfills a short category with the latest items from other categories, no duplicates', async () => {
    serveCatalog({
      articles: [
        articleDoc({
          id: 50,
          slug: 'politica-50',
          category: politicsCategory,
          createdAt: iso(6, 23),
          publishedAt: iso(6, 23),
        }),
      ],
      aggregated: [
        aggregatedDoc({
          id: 1,
          slug: 'sport-1',
          category: sportCategory,
          publishedAt: iso(5, 10),
        }),
        aggregatedDoc({
          id: 2,
          slug: 'sport-2',
          category: sportCategory,
          publishedAt: iso(5, 12),
        }),
        aggregatedDoc({
          id: 3,
          slug: 'politica-3',
          category: politicsCategory,
          publishedAt: iso(6, 9),
        }),
        aggregatedDoc({
          id: 4,
          slug: 'politica-4',
          category: politicsCategory,
          publishedAt: iso(6, 11),
        }),
      ],
    })

    const items = await getMoreNews({ excludeSlug: 'curenta', categorySlug: 'sport' })
    // Same category FIRST (newest first), then the newest of the rest —
    // category items never repeated by the backfill.
    expect(items.map((i) => i.id)).toEqual([
      'aggregated-2',
      'aggregated-1',
      'original-50',
      'aggregated-4',
      'aggregated-3',
    ])
  })

  it('without a categorySlug it degrades to the latest items overall', async () => {
    serveCatalog({
      articles: [],
      aggregated: [
        aggregatedDoc({ id: 1, slug: 's-1', category: sportCategory, publishedAt: iso(4, 8) }),
        aggregatedDoc({ id: 2, slug: 's-2', category: politicsCategory, publishedAt: iso(6, 8) }),
      ],
    })
    const items = await getMoreNews({ excludeSlug: 'x' })
    expect(items.map((i) => i.id)).toEqual(['aggregated-2', 'aggregated-1'])
  })

  it('caches ONLY the items, 60s, under newsromania:feed:more:<cat>:<slug>:<limit>', async () => {
    serveCatalog({ articles: [], aggregated: [] })
    await getMoreNews({ excludeSlug: 'stirea-curenta', categorySlug: 'sport' })
    expect(cacheCalls).toEqual([
      { key: 'newsromania:feed:more:sport:stirea-curenta:6', ttlSec: 60 },
    ])
  })

  it('sanitizes garbage limits back to 6', async () => {
    serveCatalog({ articles: [], aggregated: [] })
    for (const limit of [0, -3, Number.NaN]) {
      cacheCalls.length = 0
      await getMoreNews({ excludeSlug: 'x', categorySlug: 'sport', limit })
      expect(cacheCalls[0]?.key).toBe('newsromania:feed:more:sport:x:6')
    }
  })

  it('fetches one doc past the window from each collection (limit+1)', async () => {
    serveCatalog({ articles: [], aggregated: [] })
    await getMoreNews({ excludeSlug: 'x', categorySlug: 'sport', limit: 6 })
    for (const call of findMock.mock.calls) {
      expect(call[0].limit).toBe(7)
    }
  })
})

// ---------------------------------------------------------------------------
// moreNewsCells — one ad after every 2 cards (one ad per 3-col desktop row)
// ---------------------------------------------------------------------------

describe('moreNewsCells', () => {
  it('interleaves an ad after every 2 cards (6 cards → 3 ads, one per desktop row)', () => {
    const cells = moreNewsCells(6)
    expect(cells.map((c) => c.kind)).toEqual([
      'card',
      'card',
      'ad',
      'card',
      'card',
      'ad',
      'card',
      'card',
      'ad',
    ])
    // Ads land at grid indices 2, 5, 8 → the last cell of each 3-column row.
    expect(cells.flatMap((c, i) => (c.kind === 'ad' ? [i] : []))).toEqual([2, 5, 8])
    // Card indices and ad ordinals both stay sequential.
    expect(
      cells.filter((c) => c.kind === 'card').map((c) => (c as { cardIndex: number }).cardIndex),
    ).toEqual([0, 1, 2, 3, 4, 5])
    expect(
      cells.filter((c) => c.kind === 'ad').map((c) => (c as { adIndex: number }).adIndex),
    ).toEqual([0, 1, 2])
  })

  it('never emits a lone ad-only row: a single card yields just that card', () => {
    expect(moreNewsCells(1)).toEqual([{ kind: 'card', cardIndex: 0 }])
    expect(moreNewsCells(0)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// MoreNews — element tree: 6 cards + one ad per row (ads at tiles 2, 5, 8)
// ---------------------------------------------------------------------------

const feedDecision = {
  placement: 'feed' as const,
  network: 'adsense' as const,
  adsense: { format: 'fluid', npa: true },
}

const planWithFeed: AdPlan = { everyNth: 3, slots: [feedDecision] }
const planWithoutFeed: AdPlan = { everyNth: 3, slots: [] }

const currentArticle: FeedItem = {
  id: 'aggregated-999',
  type: 'aggregated',
  slug: 'stirea-curenta',
  title: 'Știrea curentă',
  excerpt: 'Rezumat.',
  category: { slug: 'sport', name: 'Sport' },
  tags: [],
  publishedAt: iso(6, 12),
  image: { url: 'https://www.digisport.ro/foto.jpg', alt: 'Ilustrație', width: 1200, height: 675 },
  source: { name: 'Publisher Exemplu', url: 'https://publisher.example' },
  sourceUrl: 'https://publisher.example/stiri/999',
}

/** Depth-first walk over a React element tree (plain objects — no rendering). */
function walk(node: ReactNode, visit: (el: ReactElement) => void): void {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (!('type' in el)) return
  visit(el)
  walk(el.props?.children, visit)
}

function tiles(section: ReactElement) {
  const found: ReactElement[] = []
  walk(section, (el) => {
    if (el.type === AdSlot || el.type === ArticleCard) found.push(el)
  })
  return found
}

function seedSixSportItems() {
  serveCatalog({
    articles: [],
    aggregated: Array.from({ length: 8 }, (_, i) =>
      aggregatedDoc({
        id: i + 1,
        slug: `sport-${i + 1}`,
        category: sportCategory,
        publishedAt: iso(6, 20 - i),
      }),
    ),
  })
}

describe('MoreNews (server component output)', () => {
  it('renders an h2 „Mai multe știri” with 6 h3 cards + one feed ad per row (9 tiles, ads at 2/5/8)', async () => {
    seedSixSportItems()
    const section = (await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
    })) as ReactElement

    expect(section).not.toBeNull()
    expect(section.type).toBe('section')

    let heading: ReactElement | undefined
    walk(section, (el) => {
      if (el.type === 'h2') heading = el
    })
    expect(heading).toBeDefined()
    // The heading text is the exact section title (plus the decorative bar).
    expect(JSON.stringify(heading?.props)).toContain('Mai multe știri')

    const all = tiles(section)
    expect(all).toHaveLength(MORE_NEWS_COUNT + 3)

    const ads = all.filter((el) => el.type === AdSlot)
    const cards = all.filter((el) => el.type === ArticleCard)
    expect(ads).toHaveLength(3)
    expect(cards).toHaveLength(MORE_NEWS_COUNT)

    // One ad as the last cell of each 3-column desktop row.
    expect(all[2]?.type).toBe(AdSlot)
    expect(all[5]?.type).toBe(AdSlot)
    expect(all[8]?.type).toBe(AdSlot)

    for (const ad of ads) {
      const adProps = ad.props as { variant: string; decision?: unknown }
      expect(adProps.variant).toBe('feed')
      expect(adProps.decision).toBe(feedDecision)
    }

    // Cards keep the section's heading hierarchy (h2 section → h3 cards).
    for (const card of cards) {
      expect((card.props as { as?: string }).as).toBe('h3')
    }
  })

  it('assigns sequential ad ordinals (0,1,2) so configured units rotate per row', async () => {
    seedSixSportItems()
    const section = (await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
    })) as ReactElement
    const ads = tiles(section).filter((el) => el.type === AdSlot)
    expect(ads.map((a) => (a.props as { index?: number }).index)).toEqual([0, 1, 2])
  })

  it('excludes the article being read from its own section', async () => {
    serveCatalog({
      articles: [],
      aggregated: [
        aggregatedDoc({
          id: 999,
          slug: 'stirea-curenta',
          category: sportCategory,
          publishedAt: iso(6, 12),
        }),
        ...Array.from({ length: 6 }, (_, i) =>
          aggregatedDoc({
            id: i + 1,
            slug: `sport-${i + 1}`,
            category: sportCategory,
            publishedAt: iso(6, 10 - i),
          }),
        ),
      ],
    })
    const section = (await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
    })) as ReactElement
    const slugs = tiles(section)
      .filter((el) => el.type === ArticleCard)
      .map((el) => (el.props as { item: FeedItem }).item.slug)
    expect(slugs).not.toContain('stirea-curenta')
  })

  it('no feed decision in the plan ⇒ the reserved „Publicitate” boxes still render (never fake content)', async () => {
    seedSixSportItems()
    const section = (await MoreNews({
      article: currentArticle,
      adPlan: planWithoutFeed,
    })) as ReactElement
    const ads = tiles(section).filter((el) => el.type === AdSlot)
    expect(ads).toHaveLength(3)
    // AdSlot renders its inert reserved shell for an undefined decision.
    for (const ad of ads) {
      expect((ad.props as { decision?: unknown }).decision).toBeUndefined()
    }
  })

  it('renders nothing at all with an empty pool', async () => {
    serveCatalog({ articles: [], aggregated: [] })
    const section = await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
    })
    expect(section).toBeNull()
  })

  it('a single-item pool keeps its news card — the section is never ad-only', async () => {
    serveCatalog({
      articles: [],
      aggregated: [
        aggregatedDoc({
          id: 1,
          slug: 'singura-stire',
          category: sportCategory,
          publishedAt: iso(6, 10),
        }),
      ],
    })
    const section = (await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
    })) as ReactElement
    const all = tiles(section)
    expect(all).toHaveLength(1)
    expect(all[0]?.type).toBe(ArticleCard)
  })

  it('caches the ITEMS under the feed:more key — the ad layout itself is never cached', async () => {
    seedSixSportItems()
    await MoreNews({ article: currentArticle, adPlan: planWithFeed })
    expect(cacheCalls).toEqual([
      { key: 'newsromania:feed:more:sport:stirea-curenta:6', ttlSec: 60 },
    ])
  })
})
