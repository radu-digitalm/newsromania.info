import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AMAZON_CACHE_TTL_SEC,
  AMAZON_STALE_TTL_SEC,
  mapItems,
  mapPricing,
  resetAmazonClient,
  resolveAmazonProduct,
  searchProducts,
  searchProductsWithTimeout,
  withPartnerTag,
  type AmazonProduct,
} from '../src/lib/ads/amazon'
import {
  SNAPSHOT_PRICING_MAX_AGE_MS,
  deadKey,
  resetCatalogMemo,
  snapshotKey,
} from '../src/lib/ads/amazon-catalog'
import { stripPricing } from '../src/lib/ads/amazon-product'
import { houseProductsForMarketplace } from '../src/lib/ads/house-amazon-products'

/**
 * src/lib/ads/amazon.ts — SDK and Redis fully mocked (the real Creators API
 * throttles and must NEVER be hit from tests). Covers the four contract
 * paths: 24h cache hit, stale-while-error on throttle, affiliate URL/tag
 * mapping, and the 800ms render-budget timeout guard.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks: vendored SDK + Redis
// ---------------------------------------------------------------------------

const { searchItemsMock, store, ttls, sets, redisMock } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const ttls = new Map<string, number>()
  /** Redis SETs (the amazon-dead:<marketplace> dead-ASIN overlay). */
  const sets = new Map<string, Set<string>>()
  const redisMock = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, ttl: number) => {
      store.set(key, value)
      ttls.set(key, ttl)
      return 'OK'
    }),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? [])]),
  }
  return { searchItemsMock: vi.fn(), store, ttls, sets, redisMock }
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INPUT = {
  keywords: ['laptop', 'gadgeturi'],
  marketplace: 'www.amazon.de',
  partnerTag: 'newsr01-21',
  count: 3,
}

/** Mirrors amazon.ts cacheHash(): sha1('<keywords|joined>::<count>::<tag>'). */
function hashFor(keywords: string[], count: number, tag: string): string {
  return createHash('sha1')
    .update(`${keywords.join('|')}::${count}::${tag}`)
    .digest('hex')
}

const HASH = hashFor(INPUT.keywords, INPUT.count, INPUT.partnerTag)
const FRESH_KEY = `newsromania:amazon:www.amazon.de:${HASH}`
const STALE_KEY = `newsromania:amazon-stale:www.amazon.de:${HASH}`

/** Plain-JSON shape of a searchItems response (SDK models deserialize to this). */
function sdkResponse(overrides: { detailPageURL?: string } = {}) {
  return {
    searchResult: {
      items: [
        {
          asin: 'B0EXAMPLE1',
          detailPageURL:
            overrides.detailPageURL ??
            'https://www.amazon.de/dp/B0EXAMPLE1?tag=newsr01-21&linkCode=osi',
          images: {
            primary: {
              medium: { url: 'https://m.media-amazon.com/images/I/1.jpg', width: 160, height: 160 },
            },
          },
          itemInfo: { title: { displayValue: 'Laptop de test 15,6"' } },
          offersV2: {
            listings: [
              {
                price: {
                  money: { displayAmount: '449,00 €' },
                  savings: { money: { displayAmount: '50,00 €' }, percentage: 10 },
                  savingBasis: {
                    money: { displayAmount: '499,00 €' },
                    savingBasisTypeLabel: 'Unverb. Preisempf.',
                  },
                },
                dealDetails: { badge: 'Angebot des Tages' },
              },
            ],
          },
        },
        {
          asin: 'B0EXAMPLE2',
          detailPageURL: 'https://www.amazon.de/dp/B0EXAMPLE2?tag=newsr01-21',
          itemInfo: { title: { displayValue: 'Alt laptop' } },
        },
      ],
    },
  }
}

const CACHED: AmazonProduct[] = [
  {
    asin: 'B0CACHED00',
    title: 'Produs din cache',
    url: 'https://www.amazon.de/dp/B0CACHED00?tag=newsr01-21',
  },
]

beforeEach(() => {
  store.clear()
  ttls.clear()
  sets.clear()
  searchItemsMock.mockReset()
  redisMock.get.mockClear()
  redisMock.set.mockClear()
  redisMock.smembers.mockClear()
  resetAmazonClient()
  resetCatalogMemo() // the render-path overlay memoizes for 60s
  vi.stubEnv('AMAZON_CREATORS_CREDENTIAL_ID', 'test-id')
  vi.stubEnv('AMAZON_CREATORS_CREDENTIAL_SECRET', 'test-secret')
  vi.stubEnv('AMAZON_CREATORS_CREDENTIAL_VERSION', '3.2')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Cache hit path
// ---------------------------------------------------------------------------

describe('searchProducts — cache', () => {
  it('serves the fresh 24h cache without touching the SDK', async () => {
    store.set(FRESH_KEY, JSON.stringify(CACHED))

    const products = await searchProducts(INPUT)

    expect(products).toEqual(CACHED)
    expect(searchItemsMock).not.toHaveBeenCalled()
  })

  it('on a miss calls searchItems once and writes fresh (24h) + stale (7d) copies', async () => {
    searchItemsMock.mockResolvedValueOnce(sdkResponse())

    const products = await searchProducts(INPUT)

    expect(searchItemsMock).toHaveBeenCalledTimes(1)
    const [marketplace, opts] = searchItemsMock.mock.calls[0]
    expect(marketplace).toBe('www.amazon.de')
    expect(opts.searchItemsRequestContent).toMatchObject({
      partnerTag: 'newsr01-21',
      keywords: 'laptop', // first (strongest) phrase is the query
      itemCount: 3,
      resources: [
        'images.primary.medium',
        'itemInfo.title',
        'offersV2.listings.price',
        'offersV2.listings.dealDetails',
      ],
    })

    expect(products).toHaveLength(2)
    expect(ttls.get(FRESH_KEY)).toBe(AMAZON_CACHE_TTL_SEC)
    expect(ttls.get(STALE_KEY)).toBe(AMAZON_STALE_TTL_SEC)
    expect(JSON.parse(store.get(FRESH_KEY)!)).toEqual(products)
    expect(JSON.parse(store.get(STALE_KEY)!)).toEqual(products)
  })

  it('returns [] without any I/O when keywords are empty', async () => {
    const products = await searchProducts({ ...INPUT, keywords: ['  ', ''] })
    expect(products).toEqual([])
    expect(searchItemsMock).not.toHaveBeenCalled()
    expect(redisMock.get).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Stale-while-error (throttle / tag-marketplace rejection)
// ---------------------------------------------------------------------------

describe('searchProducts — stale-while-error', () => {
  it('serves the 7d stale copy when the API throttles (HTTP 429)', async () => {
    store.set(STALE_KEY, JSON.stringify(CACHED))
    searchItemsMock.mockRejectedValueOnce(Object.assign(new Error('throttled'), { status: 429 }))

    const products = await searchProducts(INPUT)

    expect(products).toEqual(CACHED)
    expect(searchItemsMock).toHaveBeenCalledTimes(1)
  })

  it('returns [] (never throws) on rejection with no stale copy — e.g. tag/marketplace mismatch', async () => {
    searchItemsMock.mockRejectedValueOnce(Object.assign(new Error('rejected'), { status: 400 }))

    await expect(searchProducts(INPUT)).resolves.toEqual([])
  })

  // Amazon: displayed pricing must come from the PA-API and be <24h old. The
  // stale copy can be 7 days old, so the PRODUCT survives and the PRICE does not.
  it('strips pricing off the stale copy — a 7d-old price must never render', async () => {
    const stalePriced: AmazonProduct[] = [
      {
        asin: 'B0STALE001',
        title: 'Produs vechi',
        url: 'https://www.amazon.de/dp/B0STALE001?tag=newsr01-21',
        pricing: { price: '449,00 €', dealBadge: 'Angebot des Tages' },
      },
    ]
    store.set(STALE_KEY, JSON.stringify(stalePriced))
    searchItemsMock.mockRejectedValueOnce(Object.assign(new Error('throttled'), { status: 429 }))

    const products = await searchProducts(INPUT)

    expect(products).toHaveLength(1)
    expect(products[0].title).toBe('Produs vechi') // product still shown
    expect(products[0].pricing).toBeUndefined() // price + deal badge gone
  })

  it('returns [] when credentials are missing from env', async () => {
    vi.stubEnv('AMAZON_CREATORS_CREDENTIAL_SECRET', '')

    await expect(searchProducts(INPUT)).resolves.toEqual([])
    expect(searchItemsMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// URL / partner-tag mapping
// ---------------------------------------------------------------------------

describe('affiliate URL mapping', () => {
  it('keeps an existing tag param intact', () => {
    const url = withPartnerTag(
      'https://www.amazon.de/dp/B01?tag=newsr01-21&linkCode=osi',
      'other-99',
    )
    expect(new URL(url).searchParams.get('tag')).toBe('newsr01-21')
  })

  it('appends the partnerTag when detailPageURL carries none', () => {
    const url = withPartnerTag('https://www.amazon.de/dp/B01?linkCode=osi', 'newsr01-21')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('tag')).toBe('newsr01-21')
    expect(parsed.searchParams.get('linkCode')).toBe('osi') // existing params survive
  })

  it('returns "" for an unparseable URL — never an untagged affiliate link', () => {
    expect(withPartnerTag('/dp/B01', 'newsr01-21')).toBe('')
  })

  it('mapItems maps asin/title/url/image/pricing and drops incomplete items', () => {
    const response = sdkResponse({ detailPageURL: 'https://www.amazon.de/dp/B0EXAMPLE1' })
    response.searchResult.items.push({
      asin: 'B0NOTITLE0',
      detailPageURL: 'https://www.amazon.de/dp/x',
    } as never)

    const products = mapItems(response, 'newsr01-21', 3)

    expect(products).toHaveLength(2) // the title-less third item is dropped
    expect(products[0]).toEqual({
      asin: 'B0EXAMPLE1',
      title: 'Laptop de test 15,6"',
      url: 'https://www.amazon.de/dp/B0EXAMPLE1?tag=newsr01-21', // tag appended
      image: { url: 'https://m.media-amazon.com/images/I/1.jpg', width: 160, height: 160 },
      pricing: {
        price: '449,00 €',
        savings: { display: '50,00 €', percentage: 10 },
        was: { display: '499,00 €', label: 'Unverb. Preisempf.' },
        dealBadge: 'Angebot des Tages',
      },
    })
    expect(products[1].image).toBeUndefined()
    expect(products[1].pricing).toBeUndefined() // no offer ⇒ no pricing object
    expect(new URL(products[1].url).searchParams.get('tag')).toBe('newsr01-21')
  })

  it('mapPricing returns undefined without a display price (out of stock)', () => {
    expect(mapPricing(undefined)).toBeUndefined()
    expect(mapPricing({})).toBeUndefined()
    expect(mapPricing({ dealDetails: { badge: 'Deal' } })).toBeUndefined()
  })

  it('mapPricing omits savings/was/dealBadge when Amazon sends none (no promo invented)', () => {
    expect(mapPricing({ price: { money: { displayAmount: '9,99 €' } } })).toEqual({
      price: '9,99 €',
    })
  })

  it('mapPricing drops a zero/absent savings percentage rather than rendering "−0%"', () => {
    const pricing = mapPricing({
      price: {
        money: { displayAmount: '9,99 €' },
        savings: { money: { displayAmount: '0,00 €' } },
      },
    })
    expect(pricing?.savings).toEqual({ display: '0,00 €' })
    expect(pricing?.savings?.percentage).toBeUndefined()
  })

  it('mapItems caps the result at count', () => {
    expect(mapItems(sdkResponse(), 'newsr01-21', 1)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// resolveAmazonProduct — live → always-on house fallback (owner v2.4)
// ---------------------------------------------------------------------------

const DECISION = {
  keywords: ['laptop', 'gadgeturi'],
  marketplace: 'www.amazon.de',
  partnerTag: 'newsromaniade-21',
}

describe('resolveAmazonProduct', () => {
  it('prefers the LIVE Creators API product when one resolves', async () => {
    // resolveAmazonProduct asks for exactly ONE product (count:1), so the fresh
    // cache key uses count 1 — seed that key so the live path hits.
    const liveKey = `newsromania:amazon:www.amazon.de:${hashFor(INPUT.keywords, 1, INPUT.partnerTag)}`
    store.set(liveKey, JSON.stringify(CACHED))
    const product = await resolveAmazonProduct({
      keywords: INPUT.keywords,
      marketplace: INPUT.marketplace,
      partnerTag: INPUT.partnerTag,
    })
    expect(product).toEqual(CACHED[0])
    expect(searchItemsMock).not.toHaveBeenCalled()
  })

  it('falls back to the marketplace-correct HOUSE bestseller (default-on, NOT preview) when the live API is empty', async () => {
    // No cache, API returns an empty result set (AssociateNotEligible shape).
    searchItemsMock.mockResolvedValue({ searchResult: { items: [] } })
    const product = await resolveAmazonProduct(DECISION)
    const house = houseProductsForMarketplace('www.amazon.de')
    expect(product).toEqual(house[0])
    // Real affiliate: the house URL carries the marketplace-correct tag.
    expect(product?.url).toContain('tag=newsromaniade-21')
  })

  it('rotates the house set by the variant index (feed spreads several slots)', async () => {
    searchItemsMock.mockResolvedValue({ searchResult: { items: [] } })
    const house = houseProductsForMarketplace('www.amazon.de')
    expect(await resolveAmazonProduct(DECISION, 0)).toEqual(house[0])
    expect(await resolveAmazonProduct(DECISION, 1)).toEqual(house[1 % house.length])
    // Wraps around the set (modulo), never out of range.
    expect(await resolveAmazonProduct(DECISION, house.length)).toEqual(house[0])
  })

  it('falls back to the amazon.de house set for an unmapped marketplace (R6 default)', async () => {
    searchItemsMock.mockResolvedValue({ searchResult: { items: [] } })
    const product = await resolveAmazonProduct({ ...DECISION, marketplace: 'www.amazon.it' })
    expect(product).toEqual(houseProductsForMarketplace('www.amazon.de')[0])
  })
})

// ---------------------------------------------------------------------------
// Daily catalog overlay (newsromania-amazon-catalog.timer)
// ---------------------------------------------------------------------------

describe('resolveAmazonProduct — daily catalog overlay', () => {
  const DECISION = {
    keywords: INPUT.keywords,
    marketplace: 'www.amazon.de',
    partnerTag: 'newsromaniade-21',
  }
  const snapshotProduct = (asin: string): AmazonProduct => ({
    asin,
    title: `Produs proaspăt ${asin}`,
    url: `https://www.amazon.de/dp/${asin}?tag=newsromaniade-21`,
    pricing: { price: '99,00 €', savings: { display: '10,00 €', percentage: 9 } },
  })

  function publishSnapshot(products: AmazonProduct[], fetchedAt: number) {
    store.set(snapshotKey('www.amazon.de'), JSON.stringify({ fetchedAt, products }))
  }

  beforeEach(() => {
    searchItemsMock.mockResolvedValue({ searchResult: { items: [] } }) // API gated
  })

  it('prefers a fresh PA-API snapshot over the static house catalog — with its pricing', async () => {
    publishSnapshot([snapshotProduct('B0FRESH001')], Date.now())

    const product = await resolveAmazonProduct(DECISION)

    expect(product?.asin).toBe('B0FRESH001')
    expect(product?.pricing?.price).toBe('99,00 €')
    expect(product?.pricing?.savings?.percentage).toBe(9)
  })

  it('strips pricing from a snapshot older than 24h (products stay, prices go)', async () => {
    publishSnapshot(
      [snapshotProduct('B0FRESH001')],
      Date.now() - SNAPSHOT_PRICING_MAX_AGE_MS - 1000,
    )

    const product = await resolveAmazonProduct(DECISION)

    expect(product?.asin).toBe('B0FRESH001') // still a usable fallback
    expect(product?.pricing).toBeUndefined() // but never a stale price
  })

  it('filters out ASINs the daily link check confirmed dead', async () => {
    const house = houseProductsForMarketplace('www.amazon.de')
    sets.set(deadKey('www.amazon.de'), new Set([house[0].asin]))

    const product = await resolveAmazonProduct(DECISION, 0)

    expect(product?.asin).not.toBe(house[0].asin)
    expect(house.some((p) => p.asin === product?.asin)).toBe(true)
  })

  it('keeps serving the pool when EVERY ASIN is marked dead (empty ad box is worse)', async () => {
    const house = houseProductsForMarketplace('www.amazon.de')
    sets.set(deadKey('www.amazon.de'), new Set(house.map((p) => p.asin)))

    await expect(resolveAmazonProduct(DECISION, 0)).resolves.toEqual(house[0])
  })

  it('falls back to the static catalog when Redis is down (ads never throw)', async () => {
    redisMock.smembers.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    redisMock.get.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(resolveAmazonProduct(DECISION, 0)).resolves.toEqual(
      houseProductsForMarketplace('www.amazon.de')[0],
    )
  })
})

// ---------------------------------------------------------------------------
// The compliance invariant itself
// ---------------------------------------------------------------------------

describe('pricing invariant', () => {
  it('stripPricing removes pricing without mutating the input', () => {
    const input: AmazonProduct[] = [
      { asin: 'A', title: 't', url: 'u', pricing: { price: '1 €' } },
      { asin: 'B', title: 't', url: 'u' },
    ]
    const out = stripPricing(input)

    expect(out[0].pricing).toBeUndefined()
    expect(out[1].pricing).toBeUndefined()
    expect(input[0].pricing).toEqual({ price: '1 €' }) // original untouched
    expect(out[1]).toBe(input[1]) // priceless products pass through by reference
  })

  it('the static house catalog carries NO pricing on any marketplace', () => {
    for (const marketplace of ['www.amazon.de', 'www.amazon.fr', 'www.amazon.co.uk']) {
      const set = houseProductsForMarketplace(marketplace)
      expect(set.length).toBeGreaterThan(0)
      expect(set.filter((product) => product.pricing)).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// Render-budget timeout guard
// ---------------------------------------------------------------------------

describe('searchProductsWithTimeout', () => {
  it('falls back to [] when the lookup exceeds the budget (ads never block rendering)', async () => {
    // Hang the whole lookup at the cache read — nothing resolves.
    redisMock.get.mockImplementationOnce(() => new Promise<never>(() => {}))

    const products = await searchProductsWithTimeout(INPUT, 25)

    expect(products).toEqual([])
  })

  it('returns the products when the lookup is faster than the budget', async () => {
    store.set(FRESH_KEY, JSON.stringify(CACHED))

    await expect(searchProductsWithTimeout(INPUT, 800)).resolves.toEqual(CACHED)
  })
})
