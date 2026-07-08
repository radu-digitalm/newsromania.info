import { describe, expect, it } from 'vitest'

/**
 * GET /api/feed contract tests (design direction v2.1 §8.8) — the PURE layer
 * only: parseFeedParams validation and the batch response builder. The route
 * itself is a thin composition over these + the existing read layer/ad plan
 * (both covered by their own suites).
 */

import { buildAdPlan, type AdEngineConfig, type AdPlanInput } from '../src/lib/ads/engine'
import {
  buildFeedBatchResponse,
  FEED_MAX_PAGE,
  MAX_QUERY_LENGTH,
  parseFeedParams,
} from '../src/lib/feed-serialize'
import type { FeedItem } from '../src/types/content'

const params = (query: string) => new URLSearchParams(query)

const originalItem = (id: number): FeedItem => ({
  id: `original-${id}`,
  type: 'original',
  slug: `articol-${id}`,
  title: `Articol ${id}`,
  excerpt: 'Un rezumat scurt.',
  category: { slug: 'actualitate', name: 'Actualitate' },
  tags: [],
  publishedAt: '2026-07-06T10:00:00.000Z',
  image: { url: 'https://www.digi24.ro/foto.jpg', alt: 'Ilustrație', width: 1200, height: 675 },
  author: { name: 'Ana Ionescu', slug: 'ana-ionescu' },
  body: ['Primul paragraf al articolului.', 'Al doilea paragraf.'],
})

const feedItem = (id: number): FeedItem => ({
  id: `aggregated-${id}`,
  type: 'aggregated',
  slug: `stire-${id}`,
  title: `Știre ${id}`,
  excerpt: 'Un rezumat scurt.',
  category: { slug: 'actualitate', name: 'Actualitate' },
  tags: [],
  publishedAt: '2026-07-06T10:00:00.000Z',
  image: { url: 'https://www.digi24.ro/foto.jpg', alt: 'Ilustrație', width: 1200, height: 675 },
  source: { name: 'Digi24', url: 'https://www.digi24.ro' },
  sourceUrl: 'https://www.digi24.ro/stiri/exemplu',
})

const ukConfig: AdEngineConfig = {
  adUnitIds: [{ slot: 'feed', unitId: '1234567890', format: null }],
  // Amazon tags configured — must still NEVER surface on the feed placement.
  amazonPartnerTags: [{ marketplace: 'www.amazon.co.uk', tag: 'newsro-21' }],
  // v2.2 seeded defaults: every 3rd post for ALL regions.
  adFrequency: [
    { region: 'UK', everyNth: 3 },
    { region: 'default', everyNth: 3 },
  ],
  behaviouralTargetingEnabled: false,
}

const ukInput: AdPlanInput = {
  region: 'UK',
  adSet: 'uk',
  country: 'GB',
  categorySlug: 'sport',
  consent: 'refused',
  profile: null,
}

// ---------------------------------------------------------------------------
// parseFeedParams (§8.8)
// ---------------------------------------------------------------------------

describe('parseFeedParams', () => {
  it('accepts a plain home batch: page only (adOrdinalStart defaults to 0)', () => {
    expect(parseFeedParams(params('page=1'))).toEqual({ ok: true, page: 1, adOrdinalStart: 0 })
    expect(parseFeedParams(params(`page=${FEED_MAX_PAGE}`))).toEqual({
      ok: true,
      page: FEED_MAX_PAGE,
      adOrdinalStart: 0,
    })
  })

  it('reads the optional ?ao= cumulative ad ordinal (owner v2.4, 2:1 Amazon)', () => {
    // Valid ordinal passes through; the amazon-ordinal alignment (§networkForOrdinal)
    // depends on it holding across batch boundaries.
    expect(parseFeedParams(params('page=3&ao=6'))).toEqual({
      ok: true,
      page: 3,
      adOrdinalStart: 6,
    })
    // Invalid / out-of-range / negative ?ao= degrades to 0 (never rejects the batch).
    expect(parseFeedParams(params('page=3&ao=abc'))).toMatchObject({ adOrdinalStart: 0 })
    expect(parseFeedParams(params('page=3&ao=-2'))).toMatchObject({ adOrdinalStart: 0 })
    expect(parseFeedParams(params('page=3&ao=999999'))).toMatchObject({ adOrdinalStart: 0 })
  })

  it('rejects missing / NaN / 0 / negative / >MAX_PAGE pages', () => {
    expect(parseFeedParams(params(''))).toEqual({ ok: false })
    expect(parseFeedParams(params('page=abc'))).toEqual({ ok: false })
    expect(parseFeedParams(params('page=2.5'))).toEqual({ ok: false })
    expect(parseFeedParams(params('page=0'))).toEqual({ ok: false })
    expect(parseFeedParams(params('page=-3'))).toEqual({ ok: false })
    expect(parseFeedParams(params('page=101'))).toEqual({ ok: false })
  })

  it('accepts known category slugs and rejects unknown ones', () => {
    expect(parseFeedParams(params('page=2&category=sport'))).toEqual({
      ok: true,
      page: 2,
      adOrdinalStart: 0,
      category: 'sport',
    })
    expect(parseFeedParams(params('page=2&category=gaming'))).toEqual({ ok: false })
    expect(parseFeedParams(params('page=2&category='))).toEqual({ ok: false })
  })

  it('accepts a trimmed q of 1–100 chars', () => {
    expect(parseFeedParams(params('page=3&q=alegeri'))).toEqual({
      ok: true,
      page: 3,
      adOrdinalStart: 0,
      q: 'alegeri',
    })
    expect(parseFeedParams(params('page=3&q=%20%20sănătate%20'))).toEqual({
      ok: true,
      page: 3,
      adOrdinalStart: 0,
      q: 'sănătate',
    })
  })

  it('rejects empty/whitespace q and q over 100 chars', () => {
    expect(parseFeedParams(params('page=2&q='))).toEqual({ ok: false })
    expect(parseFeedParams(params('page=2&q=%20%20'))).toEqual({ ok: false })
    const long = 'a'.repeat(MAX_QUERY_LENGTH + 1)
    expect(parseFeedParams(params(`page=2&q=${long}`))).toEqual({ ok: false })
    expect(parseFeedParams(params(`page=2&q=${'a'.repeat(MAX_QUERY_LENGTH)}`))).toMatchObject({
      ok: true,
    })
  })

  it('rejects category and q together (mutually exclusive)', () => {
    expect(parseFeedParams(params('page=2&category=sport&q=fotbal'))).toEqual({ ok: false })
  })
})

// ---------------------------------------------------------------------------
// buildFeedBatchResponse (§8.8)
// ---------------------------------------------------------------------------

describe('buildFeedBatchResponse', () => {
  it('serializes card fields and carries the plan feed decision + everyNth', () => {
    const items = [feedItem(1), feedItem(2)]
    const plan = buildAdPlan(ukInput, ukConfig)
    const response = buildFeedBatchResponse({
      page: 2,
      feedPage: { items, hasNextPage: true },
      adPlan: plan,
    })

    expect(response.items).toEqual(items)
    expect(response.hasMore).toBe(true)
    expect(response.nextPage).toBe(3)
    expect(response.ads).not.toBeNull()
    expect(response.ads?.everyNth).toBe(3) // UK frequency
    expect(response.ads?.decisions).toHaveLength(1)
    expect(response.ads?.decisions[0]?.placement).toBe('feed')
    // Rotation pool travels with the decision (adsenseAt on the client).
    expect(response.ads?.decisions[0]?.adsense?.unitId).toBe('1234567890')
    // CMP reconciliation (2026-07): npa is always false — Google's certified
    // CMP + Consent Mode v2 govern personalization, not our consent state.
    expect(response.ads?.decisions[0]?.adsense?.npa).toBe(false)
  })

  it('strips the original full body from the wire DTO (cards never render it)', () => {
    const response = buildFeedBatchResponse({
      page: 2,
      feedPage: { items: [originalItem(1), feedItem(2)], hasNextPage: true },
      adPlan: null,
    })
    expect(response.items).toHaveLength(2)
    // Original: every card field survives, the body does NOT travel.
    expect(response.items[0]).not.toHaveProperty('body')
    expect(response.items[0]).toMatchObject({
      id: 'original-1',
      type: 'original',
      title: 'Articol 1',
      author: { name: 'Ana Ionescu', slug: 'ana-ionescu' },
    })
    // Aggregated items (no body by contract) pass through untouched.
    expect(response.items[1]).toEqual(feedItem(2))
  })

  it('the feed decision is NEVER amazon, even with partner tags configured', () => {
    const plan = buildAdPlan(ukInput, ukConfig)
    const response = buildFeedBatchResponse({
      page: 2,
      feedPage: { items: [feedItem(1)], hasNextPage: false },
      adPlan: plan,
    })
    expect(response.ads?.decisions[0]?.network).toBe('adsense')
    expect(response.ads?.decisions[0]?.network).not.toBe('amazon')
  })

  it('ships serialized Amazon products for the amazon-ordinal feed slots (owner v2.4)', () => {
    const plan = buildAdPlan(ukInput, ukConfig)
    const products = {
      2: {
        asin: 'B0AMAZON02',
        title: 'Produs Amazon',
        url: 'https://www.amazon.co.uk/dp/B0AMAZON02?tag=newsro-21',
      },
    }
    const response = buildFeedBatchResponse({
      page: 2,
      feedPage: { items: [feedItem(1)], hasNextPage: true },
      adPlan: plan,
      products,
    })
    expect(response.ads?.products).toEqual(products)
  })

  it('omits ads.products entirely when the batch has no amazon-ordinal products', () => {
    const plan = buildAdPlan(ukInput, ukConfig)
    const response = buildFeedBatchResponse({
      page: 2,
      feedPage: { items: [feedItem(1)], hasNextPage: true },
      adPlan: plan,
      products: {},
    })
    expect(response.ads).not.toBeNull()
    expect(response.ads?.products).toBeUndefined()
  })

  it('ads is null for search batches (adPlan null — §8.3 ad-free parity)', () => {
    const response = buildFeedBatchResponse({
      page: 4,
      feedPage: { items: [feedItem(1)], hasNextPage: true },
      adPlan: null,
    })
    expect(response.ads).toBeNull()
    expect(response.hasMore).toBe(true)
    expect(response.nextPage).toBe(5)
  })

  it('ends the stream at the last page: hasMore false, nextPage null', () => {
    const response = buildFeedBatchResponse({
      page: 7,
      feedPage: { items: [feedItem(1)], hasNextPage: false },
      adPlan: null,
    })
    expect(response.hasMore).toBe(false)
    expect(response.nextPage).toBeNull()
  })

  it('never points past MAX_PAGE, even if the read layer claims more', () => {
    const response = buildFeedBatchResponse({
      page: FEED_MAX_PAGE,
      feedPage: { items: [feedItem(1)], hasNextPage: true },
      adPlan: null,
    })
    expect(response.hasMore).toBe(false)
    expect(response.nextPage).toBeNull()
  })
})
