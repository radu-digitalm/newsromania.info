import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  orderedHouseSet,
  resolveAmazonProduct,
  resetAmazonClient,
  type AmazonProduct,
} from '../src/lib/ads/amazon'
import {
  HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE,
  houseProductsForMarketplace,
} from '../src/lib/ads/house-amazon-products'
import { hasCategoryBias, productMatchesCategory } from '../src/lib/ads/house-category'

/**
 * House catalog + variety/rotation/personalization (owner fix round).
 *
 * The Creators SDK + Redis are mocked so the LIVE path always returns [] and
 * every resolve falls through to the house set — exactly the production state
 * while the Associates account is AssociateNotEligible.
 */

const { searchItemsMock, redisMock } = vi.hoisted(() => {
  const redisMock = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
  }
  return { searchItemsMock: vi.fn(), redisMock }
})

vi.mock('@amzn/creatorsapi-nodejs-sdk', () => ({
  ApiClient: class {
    credentialId: string | null = null
    credentialSecret: string | null = null
    version: string | null = null
  },
  DefaultApi: class {
    searchItems = searchItemsMock
  },
}))

vi.mock('@/lib/redis', () => ({
  getRedis: () => redisMock,
  rkey: (...parts: Array<string | number>) => ['newsromania', ...parts].join(':'),
}))

const MARKETS = ['www.amazon.co.uk', 'www.amazon.fr', 'www.amazon.de'] as const

beforeEach(() => {
  searchItemsMock.mockReset()
  // Live API returns nothing (AssociateNotEligible) ⇒ house fallback everywhere.
  searchItemsMock.mockResolvedValue({ searchResult: { items: [] } })
  redisMock.get.mockClear()
  resetAmazonClient()
  vi.stubEnv('AMAZON_CREATORS_CREDENTIAL_ID', 'test-id')
  vi.stubEnv('AMAZON_CREATORS_CREDENTIAL_SECRET', 'test-secret')
  vi.stubEnv('AMAZON_CREATORS_CREDENTIAL_VERSION', '3.2')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const decisionFor = (marketplace: string, preferredCategories?: string[]) => ({
  keywords: ['gadgeturi'],
  marketplace,
  partnerTag: 'newsromaniade-21',
  ...(preferredCategories ? { preferredCategories } : {}),
})

// ---------------------------------------------------------------------------
// Catalog data — VARIETY, correct titles/prices/tags (owner fix round)
// ---------------------------------------------------------------------------

describe('house catalog — variety & data correctness', () => {
  it('carries MANY products per marketplace (variety, not 3)', () => {
    for (const mp of MARKETS) {
      expect(HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[mp].length).toBeGreaterThanOrEqual(10)
    }
  })

  it('every product has a marketplace-correct partner tag in its url', () => {
    const tagByMarket: Record<string, string> = {
      'www.amazon.co.uk': 'tag=newsr01-21',
      'www.amazon.fr': 'tag=newsromaniafr-21',
      'www.amazon.de': 'tag=newsromaniade-21',
    }
    for (const mp of MARKETS) {
      for (const p of HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[mp]) {
        expect(p.url).toContain(mp)
        expect(p.url).toContain(tagByMarket[mp])
      }
    }
  })

  it('ASINs are unique within each marketplace set', () => {
    for (const mp of MARKETS) {
      const asins = HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[mp].map((p) => p.asin)
      expect(new Set(asins).size).toBe(asins.length)
    }
  })

  it('fixes the AirTag title to the real amazon.fr French ordinal (not "2ª generație")', () => {
    const airtag = HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE['www.amazon.fr'].find(
      (p) => p.asin === 'B0GJTCB2QM',
    )
    expect(airtag).toBeDefined()
    expect(airtag!.title).toContain('2ᵉ génération')
    expect(airtag!.title).not.toContain('2ª generație')
  })

  // Replaces the old "co.uk prices in GBP" check: there are no prices here any
  // more. Amazon only permits displaying pricing pulled from the PA-API within
  // the last 24h, and nothing refreshes this static file — so it carries none,
  // and the currency can no longer be wrong. See amazon-product.ts/AmazonPricing.
  it('carries NO pricing on any product (a static catalog cannot satisfy the 24h rule)', () => {
    for (const mp of MARKETS) {
      for (const p of HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[mp]) {
        expect(p.pricing).toBeUndefined()
      }
    }
  })

  it('spans several departments per marketplace (category variety)', () => {
    for (const mp of MARKETS) {
      const cats = new Set(
        HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[mp].map((p) => p.category).filter(Boolean),
      )
      expect(cats.size).toBeGreaterThanOrEqual(3)
    }
  })
})

// ---------------------------------------------------------------------------
// productMatchesCategory / hasCategoryBias (pure)
// ---------------------------------------------------------------------------

describe('house-category mapping', () => {
  it('matches tech departments to the tehnologie slug across markets', () => {
    expect(productMatchesCategory('High-Tech', 'tehnologie')).toBe(true)
    expect(productMatchesCategory('Informatique', 'tehnologie')).toBe(true)
    expect(productMatchesCategory('Kamera & Foto', 'tehnologie')).toBe(true)
    expect(productMatchesCategory('Electronics & Photo', 'tehnologie')).toBe(true)
  })

  it('matches health/beauty departments to the sanatate slug', () => {
    expect(productMatchesCategory('Health & Personal Care', 'sanatate')).toBe(true)
    expect(productMatchesCategory('Drogerie & Körperpflege', 'sanatate')).toBe(true)
    expect(productMatchesCategory('Beauty', 'sanatate')).toBe(true)
    expect(productMatchesCategory('Hygiène et Santé', 'sanatate')).toBe(true)
  })

  it('returns false for unmapped slug / missing category / mismatch', () => {
    expect(productMatchesCategory('High-Tech', 'politica')).toBe(false)
    expect(productMatchesCategory(undefined, 'tehnologie')).toBe(false)
    expect(productMatchesCategory('High-Tech', undefined)).toBe(false)
    expect(productMatchesCategory('Küche, Haushalt & Wohnen', 'tehnologie')).toBe(false)
  })

  it('hasCategoryBias is true only for mapped slugs', () => {
    expect(hasCategoryBias('tehnologie')).toBe(true)
    expect(hasCategoryBias('sanatate')).toBe(true)
    expect(hasCategoryBias('politica')).toBe(false)
    expect(hasCategoryBias(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// orderedHouseSet — preferred category first, then rotation order (pure)
// ---------------------------------------------------------------------------

const SET: AmazonProduct[] = [
  { asin: 'A', title: 'a', url: 'https://x/A', category: 'Küche, Haushalt & Wohnen' },
  { asin: 'B', title: 'b', url: 'https://x/B', category: 'High-Tech' },
  { asin: 'C', title: 'c', url: 'https://x/C', category: 'Beauty' },
  { asin: 'D', title: 'd', url: 'https://x/D', category: 'Informatique' },
]

describe('orderedHouseSet', () => {
  it('returns the catalog order unchanged when there are no preferences', () => {
    expect(orderedHouseSet(SET, undefined).map((p) => p.asin)).toEqual(['A', 'B', 'C', 'D'])
    expect(orderedHouseSet(SET, []).map((p) => p.asin)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('floats products of the preferred category to the front, keeping the rest', () => {
    // tehnologie ⇒ High-Tech (B) + Informatique (D) first, then A, C.
    expect(orderedHouseSet(SET, ['tehnologie']).map((p) => p.asin)).toEqual(['B', 'D', 'A', 'C'])
  })

  it('honours preference PRIORITY order and never duplicates a product', () => {
    // sanatate (Beauty=C) first, then tehnologie (B, D), then the rest (A).
    const ordered = orderedHouseSet(SET, ['sanatate', 'tehnologie'])
    expect(ordered.map((p) => p.asin)).toEqual(['C', 'B', 'D', 'A'])
    expect(new Set(ordered.map((p) => p.asin)).size).toBe(SET.length)
  })
})

// ---------------------------------------------------------------------------
// resolveAmazonProduct — rotation + personalization end to end
// ---------------------------------------------------------------------------

describe('resolveAmazonProduct — rotation (no repeat until exhausted)', () => {
  it('consecutive variants pick DIFFERENT products across the whole set', async () => {
    const set = houseProductsForMarketplace('www.amazon.de')
    const seen = new Set<string>()
    for (let v = 0; v < set.length; v++) {
      const p = await resolveAmazonProduct(decisionFor('www.amazon.de'), v)
      expect(p).toBeDefined()
      seen.add(p!.asin)
    }
    // Every variant in [0, len) yields a distinct product — no early repeat.
    expect(seen.size).toBe(set.length)
  })

  it('wraps around the set with modulo (variant === len → first)', async () => {
    const set = houseProductsForMarketplace('www.amazon.de')
    const first = await resolveAmazonProduct(decisionFor('www.amazon.de'), 0)
    const wrapped = await resolveAmazonProduct(decisionFor('www.amazon.de'), set.length)
    expect(wrapped?.asin).toBe(first?.asin)
  })
})

describe('resolveAmazonProduct — personalization (based on cookies + content)', () => {
  it('variant 0 lands on the preferred-category product (interest leads)', async () => {
    // sanatate preference ⇒ the first product resolved is a health/beauty SKU.
    const p = await resolveAmazonProduct(decisionFor('www.amazon.de', ['sanatate']), 0)
    expect(p).toBeDefined()
    expect(productMatchesCategory(p!.category, 'sanatate')).toBe(true)
  })

  it('is deterministic: same (marketplace, preferences, variant) ⇒ same product', async () => {
    const a = await resolveAmazonProduct(decisionFor('www.amazon.fr', ['tehnologie']), 2)
    const b = await resolveAmazonProduct(decisionFor('www.amazon.fr', ['tehnologie']), 2)
    expect(a?.asin).toBe(b?.asin)
  })

  it('unmapped marketplace still resolves from the amazon.de set (R6 default)', async () => {
    const p = await resolveAmazonProduct(decisionFor('www.amazon.it'), 0)
    expect(p).toEqual(houseProductsForMarketplace('www.amazon.de')[0])
  })
})
