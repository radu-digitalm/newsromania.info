import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * „Mai multe știri” section (owner requirement 4) — the read-layer pool
 * (getMoreNews: same-category first, latest-backfill, exclusion, cache
 * contract) and the random ad replacement (pickAdIndex + the MoreNews server
 * component): EXACTLY ONE of the section's cards becomes the plan's 'feed'
 * ad block, position driven by the injectable rng, never cached.
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
import { MORE_NEWS_COUNT, MoreNews, pickAdIndex } from '../src/components/articles/MoreNews'
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
// pickAdIndex — the injectable-rng replacement position
// ---------------------------------------------------------------------------

describe('pickAdIndex', () => {
  it('maps rng() uniformly onto [0, count-1]', () => {
    expect(pickAdIndex(6, () => 0)).toBe(0)
    expect(pickAdIndex(6, () => 0.5)).toBe(3)
    expect(pickAdIndex(6, () => 0.9999)).toBe(5)
  })

  it('every rng output in [0,1) lands on a valid tile (exactly-one-ad guarantee)', () => {
    for (let i = 0; i < 100; i++) {
      const index = pickAdIndex(6, () => i / 100)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThanOrEqual(5)
    }
  })

  it('clamps out-of-range or garbage rng outputs into the tile range', () => {
    expect(pickAdIndex(6, () => 1)).toBe(5) // rng contract edge
    expect(pickAdIndex(6, () => 42)).toBe(5)
    expect(pickAdIndex(6, () => -1)).toBe(0)
    expect(pickAdIndex(6, () => Number.NaN)).toBe(0)
  })

  it('defaults to Math.random and stays in range', () => {
    for (let i = 0; i < 20; i++) {
      const index = pickAdIndex(6)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThanOrEqual(5)
    }
  })

  it('never replaces a lone card and never fires on empty input (news must remain)', () => {
    expect(pickAdIndex(1, () => 0)).toBe(-1)
    expect(pickAdIndex(0, () => 0)).toBe(-1)
    expect(pickAdIndex(Number.NaN, () => 0)).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// MoreNews — element tree: exactly one ad tile at the rng position
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
  image: { url: '/placeholders/sport.png', alt: 'Ilustrație', width: 1200, height: 675 },
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
  it('renders an h2 „Mai multe știri” section with 6 tiles: 5 h3 cards + EXACTLY 1 feed ad', async () => {
    seedSixSportItems()
    const section = (await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
      rng: () => 0.5,
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
    expect(all).toHaveLength(MORE_NEWS_COUNT)

    const ads = all.filter((el) => el.type === AdSlot)
    const cards = all.filter((el) => el.type === ArticleCard)
    expect(ads).toHaveLength(1)
    expect(cards).toHaveLength(5)

    // rng 0.5 over 6 tiles → the ad replaces the 4th tile (index 3).
    expect(all[3]?.type).toBe(AdSlot)
    const adProps = ads[0]?.props as { variant: string; decision?: unknown }
    expect(adProps.variant).toBe('feed')
    expect(adProps.decision).toBe(feedDecision)

    // Cards keep the section's heading hierarchy (h2 section → h3 cards).
    for (const card of cards) {
      expect((card.props as { as?: string }).as).toBe('h3')
    }
  })

  it('moves the ad with the rng (first tile at rng→0, last tile at rng→~1) — per-request variety', async () => {
    seedSixSportItems()
    const first = (await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
      rng: () => 0,
    })) as ReactElement
    expect(tiles(first)[0]?.type).toBe(AdSlot)

    seedSixSportItems()
    const last = (await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
      rng: () => 0.9999,
    })) as ReactElement
    expect(tiles(last)[5]?.type).toBe(AdSlot)
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
      rng: () => 0,
    })) as ReactElement
    const slugs = tiles(section)
      .filter((el) => el.type === ArticleCard)
      .map((el) => (el.props as { item: FeedItem }).item.slug)
    expect(slugs).not.toContain('stirea-curenta')
  })

  it('no feed decision in the plan ⇒ the reserved „Publicitate” box still renders (never fake content)', async () => {
    seedSixSportItems()
    const section = (await MoreNews({
      article: currentArticle,
      adPlan: planWithoutFeed,
      rng: () => 0,
    })) as ReactElement
    const ads = tiles(section).filter((el) => el.type === AdSlot)
    expect(ads).toHaveLength(1)
    // AdSlot renders its inert reserved shell for an undefined decision.
    expect((ads[0]?.props as { decision?: unknown }).decision).toBeUndefined()
  })

  it('renders nothing at all with an empty pool', async () => {
    serveCatalog({ articles: [], aggregated: [] })
    const section = await MoreNews({
      article: currentArticle,
      adPlan: planWithFeed,
      rng: () => 0,
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
      rng: () => 0,
    })) as ReactElement
    const all = tiles(section)
    expect(all).toHaveLength(1)
    expect(all[0]?.type).toBe(ArticleCard)
  })

  it('caches the ITEMS under the feed:more key — the ad choice itself is never cached', async () => {
    seedSixSportItems()
    await MoreNews({ article: currentArticle, adPlan: planWithFeed, rng: () => 0.2 })
    expect(cacheCalls).toEqual([
      { key: 'newsromania:feed:more:sport:stirea-curenta:6', ttlSec: 60 },
    ])
  })
})
