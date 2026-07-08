import { describe, expect, it } from 'vitest'

/**
 * Infinite-stream pure logic (design direction v2.1 §8.6/§8.7) — the batch
 * interleaving math, the auto-load cap, URL builders and aria-live copy that
 * FeedStream/PostBatch render from. All IO-free (src/lib/feed-serialize.ts).
 */

import {
  amazonOrdinalsForBatch,
  AUTO_LOAD_MAX_BATCHES,
  batchAdCount,
  batchEntries,
  feedRequestPath,
  loadedAnnouncement,
  nextPageHref,
  shouldAutoLoad,
} from '../src/lib/feed-serialize'
import type { AmazonProduct } from '../src/lib/ads/amazon-product'
import type { FeedItem } from '../src/types/content'

const item = (id: number): FeedItem => ({
  id: `aggregated-${id}`,
  type: 'aggregated',
  slug: `stire-${id}`,
  title: `Știre ${id}`,
  excerpt: 'Rezumat.',
  category: { slug: 'actualitate', name: 'Actualitate' },
  tags: [],
  publishedAt: '2026-07-06T10:00:00.000Z',
  image: { url: 'https://www.digi24.ro/foto.jpg', alt: 'Ilustrație', width: 1200, height: 675 },
  source: { name: 'Digi24', url: 'https://www.digi24.ro' },
  sourceUrl: 'https://www.digi24.ro/stiri/exemplu',
})

const batch = (count: number) => Array.from({ length: count }, (_, i) => item(i + 1))

/** Positions (1-based, "after item N") of the ad entries in an entry list. */
function adPositions(entries: ReturnType<typeof batchEntries>): number[] {
  const positions: number[] = []
  let posts = 0
  for (const entry of entries) {
    if (entry.kind === 'post') posts += 1
    else positions.push(posts)
  }
  return positions
}

describe('batchEntries — ad interleaving per batch of 10 (§8.6)', () => {
  it('everyNth 3 (v2.2 seeded, all regions): 3 ads after items 3, 6, 9 with sequential ordinals', () => {
    const entries = batchEntries(batch(10), 3, 0)
    expect(adPositions(entries)).toEqual([3, 6, 9])
    expect(entries.filter((e) => e.kind === 'ad').map((e) => e.ordinal)).toEqual([0, 1, 2])
    // Posts stay complete and in order.
    expect(entries.filter((e) => e.kind === 'post')).toHaveLength(10)
  })

  it('everyNth 4 (admin override): 2 ads after items 4 and 8', () => {
    expect(adPositions(batchEntries(batch(10), 4, 0))).toEqual([4, 8])
  })

  it('everyNth 5 (admin override): 1 ad after item 5 — never after the final item', () => {
    expect(adPositions(batchEntries(batch(10), 5, 0))).toEqual([5])
  })

  it('caps at MAX_FEED_ADS_PER_PAGE (3), even at everyNth 1', () => {
    expect(adPositions(batchEntries(batch(10), 1, 0))).toEqual([1, 2, 3])
  })

  it('everyNth 0 (ad-free search batches) yields posts only', () => {
    const entries = batchEntries(batch(10), 0, 0)
    expect(entries.every((e) => e.kind === 'post')).toBe(true)
  })

  it('short final batch keeps the no-trailing-ad rule', () => {
    // 5 items at everyNth 5: position 5 is the final item — no ad.
    expect(adPositions(batchEntries(batch(5), 5, 0))).toEqual([])
    // 6 items at everyNth 5: ad after item 5 only.
    expect(adPositions(batchEntries(batch(6), 5, 0))).toEqual([5])
  })

  it('ordinals continue across batches from adOrdinalStart (unit rotation §8.6)', () => {
    // Page 1 (SSR) rendered ordinals 0..2 (UK) — the first client batch
    // continues at 3, the next at 6: same request+position ⇒ same unit.
    const second = batchEntries(batch(10), 3, 3)
    expect(second.filter((e) => e.kind === 'ad').map((e) => e.ordinal)).toEqual([3, 4, 5])
    const third = batchEntries(batch(10), 3, 6)
    expect(third.filter((e) => e.kind === 'ad').map((e) => e.ordinal)).toEqual([6, 7, 8])
  })

  it('batchAdCount matches the entries the batch actually renders', () => {
    expect(batchAdCount(3, 10)).toBe(3)
    expect(batchAdCount(4, 10)).toBe(2)
    expect(batchAdCount(5, 10)).toBe(1)
    expect(batchAdCount(0, 10)).toBe(0)
    expect(batchAdCount(5, 5)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2 AdSense : 1 Amazon in the feed (owner v2.4) — networks + serialized products
// ---------------------------------------------------------------------------

const houseProduct = (asin: string): AmazonProduct => ({
  asin,
  title: `Produs ${asin}`,
  url: `https://www.amazon.de/dp/${asin}?tag=newsromaniade-21`,
})

describe('amazonOrdinalsForBatch — which of a batch’s slots are Amazon', () => {
  it('page 1 (adOrdinalStart 0, everyNth 3): ordinals 0,1,2 → only 2 is amazon', () => {
    expect(amazonOrdinalsForBatch(3, 10, 0)).toEqual([2])
  })

  it('the next batch continues the cumulative ordinal so the pattern never resets', () => {
    // Page 1 ended at ordinal 3; batch 2 (ordinals 3,4,5) → 5 is amazon.
    expect(amazonOrdinalsForBatch(3, 10, 3)).toEqual([5])
    // Batch 3 (ordinals 6,7,8) → 8 is amazon.
    expect(amazonOrdinalsForBatch(3, 10, 6)).toEqual([8])
  })

  it('a batch that spans an amazon boundary can carry it at any position', () => {
    // Start at ordinal 1: batch ordinals 1,2,3 → 2 is the amazon one.
    expect(amazonOrdinalsForBatch(3, 10, 1)).toEqual([2])
    // Start at ordinal 2: batch ordinals 2,3,4 → 2 is amazon (first slot).
    expect(amazonOrdinalsForBatch(3, 10, 2)).toEqual([2])
  })

  it('no ads ⇒ no amazon ordinals', () => {
    expect(amazonOrdinalsForBatch(0, 10, 0)).toEqual([])
    expect(amazonOrdinalsForBatch(5, 5, 0)).toEqual([]) // trailing-ad rule
  })
})

describe('batchEntries — network + serialized product per ad slot (owner v2.4)', () => {
  it('tags each ad with its ordinal-decided network', () => {
    const entries = batchEntries(batch(10), 3, 0)
    const ads = entries.filter((e) => e.kind === 'ad')
    expect(ads.map((e) => (e.kind === 'ad' ? e.network : null))).toEqual([
      'adsense', // ordinal 0
      'adsense', // ordinal 1
      'amazon', // ordinal 2
    ])
  })

  it('attaches the serialized product to the amazon-ordinal slot only', () => {
    const products = { 2: houseProduct('B0AMAZON02') }
    const entries = batchEntries(batch(10), 3, 0, products)
    const ads = entries.filter((e) => e.kind === 'ad')
    // Ordinals 0,1 (adsense) carry no product; ordinal 2 (amazon) carries it.
    expect(ads.map((e) => (e.kind === 'ad' ? e.product?.asin : null))).toEqual([
      undefined,
      undefined,
      'B0AMAZON02',
    ])
  })

  it('an amazon slot with no resolved product carries network amazon but no product (degrades to AdSense)', () => {
    const entries = batchEntries(batch(10), 3, 0, {}) // empty product map
    const amazonAd = entries.find((e) => e.kind === 'ad' && e.network === 'amazon')
    expect(amazonAd && amazonAd.kind === 'ad' ? amazonAd.product : 'x').toBeUndefined()
  })

  it('a product keyed to a NON-amazon ordinal is never attached', () => {
    // Even if the server mistakenly ships a product for an adsense ordinal,
    // batchEntries only reads products for amazon ordinals.
    const entries = batchEntries(batch(10), 3, 0, { 0: houseProduct('B0WRONG000') })
    const first = entries.find((e) => e.kind === 'ad')
    expect(first && first.kind === 'ad' ? first.product : 'x').toBeUndefined()
  })
})

describe('auto-load cap (§8.7)', () => {
  it('auto-loads exactly 4 consecutive batches, then requires the manual button', () => {
    expect(AUTO_LOAD_MAX_BATCHES).toBe(4)
    expect(shouldAutoLoad(0)).toBe(true)
    expect(shouldAutoLoad(3)).toBe(true)
    expect(shouldAutoLoad(4)).toBe(false)
    expect(shouldAutoLoad(9)).toBe(false)
  })
})

describe('URL builders', () => {
  it('feedRequestPath builds the /api/feed batch URL per route', () => {
    expect(feedRequestPath({}, 2)).toBe('/api/feed?page=2')
    expect(feedRequestPath({ category: 'sport' }, 3)).toBe('/api/feed?page=3&category=sport')
    expect(feedRequestPath({ q: 'alegeri locale' }, 2)).toBe('/api/feed?page=2&q=alegeri+locale')
  })

  it('feedRequestPath appends ?ao= (the batch’s first ad ordinal) for feed/category, never for search', () => {
    // Owner v2.4: the cumulative ad ordinal keeps the 2:1 Amazon interleave
    // aligned across batches.
    expect(feedRequestPath({}, 3, 3)).toBe('/api/feed?page=3&ao=3')
    expect(feedRequestPath({ category: 'sport' }, 4, 6)).toBe(
      '/api/feed?page=4&category=sport&ao=6',
    )
    // 0 ordinal (page 1 handoff at start) ⇒ omitted.
    expect(feedRequestPath({}, 2, 0)).toBe('/api/feed?page=2')
    // Search batches are ad-free ⇒ never carry ?ao=.
    expect(feedRequestPath({ q: 'alegeri' }, 2, 6)).toBe('/api/feed?page=2&q=alegeri')
  })

  it('nextPageHref builds the real ?page=N fallback link per route (§8.11)', () => {
    expect(nextPageHref({}, 2)).toBe('/?page=2')
    expect(nextPageHref({ category: 'sport' }, 4)).toBe('/categorie/sport?page=4')
    expect(nextPageHref({ q: 'sănătate' }, 2)).toBe('/cautare?q=s%C4%83n%C4%83tate&page=2')
  })
})

describe('aria-live copy (§8.7 — comma-below diacritics)', () => {
  it('singular and plural append announcements', () => {
    expect(loadedAnnouncement(1)).toBe('S-a încărcat o știre nouă.')
    expect(loadedAnnouncement(10)).toBe('S-au încărcat 10 știri noi.')
  })
})
