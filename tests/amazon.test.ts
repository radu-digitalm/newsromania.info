import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AMAZON_CACHE_TTL_SEC,
  AMAZON_STALE_TTL_SEC,
  mapItems,
  resetAmazonClient,
  searchProducts,
  searchProductsWithTimeout,
  withPartnerTag,
  type AmazonProduct,
} from '../src/lib/ads/amazon'

/**
 * src/lib/ads/amazon.ts — SDK and Redis fully mocked (the real Creators API
 * throttles and must NEVER be hit from tests). Covers the four contract
 * paths: 24h cache hit, stale-while-error on throttle, affiliate URL/tag
 * mapping, and the 800ms render-budget timeout guard.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks: vendored SDK + Redis
// ---------------------------------------------------------------------------

const { searchItemsMock, store, ttls, redisMock } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const ttls = new Map<string, number>()
  const redisMock = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, ttl: number) => {
      store.set(key, value)
      ttls.set(key, ttl)
      return 'OK'
    }),
  }
  return { searchItemsMock: vi.fn(), store, ttls, redisMock }
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
          offersV2: { listings: [{ price: { money: { displayAmount: '449,00 €' } } }] },
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
  searchItemsMock.mockReset()
  redisMock.get.mockClear()
  redisMock.set.mockClear()
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
      resources: ['images.primary.medium', 'itemInfo.title', 'offersV2.listings.price'],
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

  it('mapItems maps asin/title/url/image/price and drops incomplete items', () => {
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
      price: '449,00 €',
    })
    expect(products[1].image).toBeUndefined()
    expect(products[1].price).toBeUndefined()
    expect(new URL(products[1].url).searchParams.get('tag')).toBe('newsr01-21')
  })

  it('mapItems caps the result at count', () => {
    expect(mapItems(sdkResponse(), 'newsr01-21', 1)).toHaveLength(1)
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
