import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STOCK_CACHE_TTL_SEC, searchStockPhoto, type StockPhoto } from '../src/lib/stock-photos'

/**
 * src/lib/stock-photos.ts — global fetch + Redis fully mocked (the real Pexels
 * and Pixabay APIs are NEVER hit from tests). Covers the contract paths:
 * Pexels primary hit, Pixabay fallback when Pexels misses, graceful null when
 * no keys are configured, and the 24h read-through cache (both hit + write).
 */

// ---------------------------------------------------------------------------
// Hoisted Redis mock (matches amazon.test.ts convention)
// ---------------------------------------------------------------------------

const { store, ttls, redisMock } = vi.hoisted(() => {
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
  return { store, ttls, redisMock }
})

vi.mock('@/lib/redis', () => ({
  getRedis: () => redisMock,
  rkey: (...parts: Array<string | number>) => ['newsromania', ...parts].join(':'),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const QUERY = 'parlamentul romaniei'

/** Mirrors stock-photos.ts cacheHash(): sha1('<query>::<orientation>'). */
function hashFor(query: string, orientation = 'landscape'): string {
  return createHash('sha1').update(`${query}::${orientation}`).digest('hex')
}

const HASH = hashFor(QUERY)
const PEXELS_KEY = `newsromania:stock:pexels:${HASH}`
const PIXABAY_KEY = `newsromania:stock:pixabay:${HASH}`

function pexelsResponse() {
  return {
    photos: [
      {
        width: 1920,
        height: 1080,
        photographer: 'Ana Popescu',
        src: {
          large2x: 'https://images.pexels.com/photos/1/large2x.jpg',
          large: 'https://images.pexels.com/photos/1/large.jpg',
          original: 'https://images.pexels.com/photos/1/original.jpg',
        },
      },
    ],
  }
}

function pixabayResponse() {
  return {
    hits: [
      {
        imageWidth: 3000,
        imageHeight: 2000,
        user: 'PixabayUser',
        largeImageURL: 'https://pixabay.com/get/large.jpg',
        webformatURL: 'https://pixabay.com/get/webformat.jpg',
      },
    ],
  }
}

/** A fetch Response stub with the given JSON body and ok flag. */
function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as unknown as Response
}

const fetchMock = vi.fn()

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  store.clear()
  ttls.clear()
  redisMock.get.mockClear()
  redisMock.set.mockClear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Pexels primary
// ---------------------------------------------------------------------------

describe('searchStockPhoto — Pexels primary', () => {
  it('returns the first Pexels result and caches it 24h', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    fetchMock.mockResolvedValueOnce(jsonResponse(pexelsResponse()))

    const photo = await searchStockPhoto({ query: QUERY })

    expect(photo).toEqual<StockPhoto>({
      url: 'https://images.pexels.com/photos/1/large2x.jpg',
      attribution: 'Foto: Ana Popescu / Pexels',
      source: 'pexels',
      width: 1920,
      height: 1080,
    })
    // Only Pexels was hit — no Pixabay call once Pexels succeeds.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Cached under the pexels key with a 24h TTL.
    expect(store.has(PEXELS_KEY)).toBe(true)
    expect(ttls.get(PEXELS_KEY)).toBe(STOCK_CACHE_TTL_SEC)
  })

  it('sends the RAW key in the Authorization header (not Bearer)', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'raw-key-123')
    fetchMock.mockResolvedValueOnce(jsonResponse(pexelsResponse()))

    await searchStockPhoto({ query: QUERY })

    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers).toEqual({ Authorization: 'raw-key-123' })
  })
})

// ---------------------------------------------------------------------------
// Pixabay fallback
// ---------------------------------------------------------------------------

describe('searchStockPhoto — Pixabay fallback', () => {
  it('falls back to Pixabay when Pexels returns no photos', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    vi.stubEnv('PIXABAY_API_KEY', 'pixabay-test-key')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ photos: [] })) // Pexels: empty
      .mockResolvedValueOnce(jsonResponse(pixabayResponse())) // Pixabay: hit

    const photo = await searchStockPhoto({ query: QUERY })

    expect(photo).toEqual<StockPhoto>({
      url: 'https://pixabay.com/get/large.jpg',
      attribution: 'Foto: PixabayUser / Pixabay',
      source: 'pixabay',
      width: 3000,
      height: 2000,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.has(PIXABAY_KEY)).toBe(true)
    expect(ttls.get(PIXABAY_KEY)).toBe(STOCK_CACHE_TTL_SEC)
  })

  it('falls back to Pixabay when Pexels errors (non-2xx)', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    vi.stubEnv('PIXABAY_API_KEY', 'pixabay-test-key')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false)) // Pexels: 5xx/4xx
      .mockResolvedValueOnce(jsonResponse(pixabayResponse()))

    const photo = await searchStockPhoto({ query: QUERY })
    expect(photo?.source).toBe('pixabay')
  })

  it('skips Pexels entirely when only the Pixabay key is set', async () => {
    vi.stubEnv('PIXABAY_API_KEY', 'pixabay-test-key')
    fetchMock.mockResolvedValueOnce(jsonResponse(pixabayResponse()))

    const photo = await searchStockPhoto({ query: QUERY })

    expect(photo?.source).toBe('pixabay')
    // Pexels has no key → no network call for it; only Pixabay is hit.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// No keys → graceful null
// ---------------------------------------------------------------------------

describe('searchStockPhoto — no keys / no match', () => {
  it('returns null and makes NO network call when neither key is set', async () => {
    const photo = await searchStockPhoto({ query: QUERY })
    expect(photo).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null (not throwing) when both providers miss', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    vi.stubEnv('PIXABAY_API_KEY', 'pixabay-test-key')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ photos: [] }))
      .mockResolvedValueOnce(jsonResponse({ hits: [] }))

    await expect(searchStockPhoto({ query: QUERY })).resolves.toBeNull()
  })

  it('returns null for an empty/whitespace query without any fetch', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    const photo = await searchStockPhoto({ query: '   ' })
    expect(photo).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not throw when fetch itself rejects (network error)', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(searchStockPhoto({ query: QUERY })).resolves.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Cache hit
// ---------------------------------------------------------------------------

describe('searchStockPhoto — cache', () => {
  it('serves a cached Pexels photo WITHOUT hitting the network', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    const cached: StockPhoto = {
      url: 'https://images.pexels.com/photos/cached.jpg',
      attribution: 'Foto: Cached Author / Pexels',
      source: 'pexels',
      width: 1600,
      height: 900,
    }
    store.set(PEXELS_KEY, JSON.stringify(cached))

    const photo = await searchStockPhoto({ query: QUERY })

    expect(photo).toEqual(cached)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keys the cache by query + orientation (distinct entries)', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'pexels-test-key')
    fetchMock.mockResolvedValue(jsonResponse(pexelsResponse()))

    await searchStockPhoto({ query: QUERY, orientation: 'portrait' })

    const portraitKey = `newsromania:stock:pexels:${hashFor(QUERY, 'portrait')}`
    expect(store.has(portraitKey)).toBe(true)
    // The default-landscape key is a different entry.
    expect(store.has(PEXELS_KEY)).toBe(false)
  })
})
