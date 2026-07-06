import { vi, type Mock } from 'vitest'

/**
 * Shared test doubles (architecture.md §10) — EVERY unit test runs without
 * network, Postgres or Redis. Two building blocks live here:
 *
 * 1. `createMemoryRedis()` — an in-memory ioredis stand-in covering the
 *    subset the codebase uses (get/set EX/incr/expire/del/scan/ping).
 * 2. `passthroughRedisModule()` — a drop-in mock for `@/lib/redis` whose
 *    `cacheJson` always calls the loader (so tests see fresh values) while
 *    recording `{ key, ttlSec }` for cache-contract assertions.
 *
 * plus Payload doc fixture builders (lexical body, article, aggregated item)
 * used by the content-mapper tests.
 *
 * Usage — vi.mock factories may dynamically import this file:
 *
 *   vi.mock('@/lib/redis', async () =>
 *     (await import('./helpers/mocks')).passthroughRedisModule(),
 *   )
 */

// ---------------------------------------------------------------------------
// ioredis stand-in
// ---------------------------------------------------------------------------

export interface MemoryRedis {
  store: Map<string, string>
  get: Mock
  set: Mock
  incr: Mock
  expire: Mock
  del: Mock
  scan: Mock
  ping: Mock
}

/** Minimal in-memory ioredis look-alike (no TTL expiry — tests are fast). */
export function createMemoryRedis(): MemoryRedis {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
      return 'OK'
    }),
    incr: vi.fn(async (key: string) => {
      const next = Number(store.get(key) ?? '0') + 1
      store.set(key, String(next))
      return next
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (...keys: string[]) => {
      let deleted = 0
      for (const key of keys) if (store.delete(key)) deleted += 1
      return deleted
    }),
    scan: vi.fn(async (_cursor: string, _m: string, match: string) => {
      const re = new RegExp(`^${match.split('*').map(escapeRe).join('.*')}$`)
      return ['0', [...store.keys()].filter((k) => re.test(k))] as const
    }),
    ping: vi.fn(async () => 'PONG'),
  }
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// `@/lib/redis` module mock
// ---------------------------------------------------------------------------

export interface CacheCall {
  key: string
  ttlSec: number
}

/**
 * Drop-in mock for `@/lib/redis`: `rkey` mirrors the real prefixing,
 * `cacheJson` is a recording pass-through (loader always runs), `getRedis`
 * hands out one shared MemoryRedis. Pass a `calls` array to assert on the
 * cache keys/TTLs a code path used.
 */
export function passthroughRedisModule({ calls }: { calls?: CacheCall[] } = {}) {
  const redis = createMemoryRedis()
  return {
    getRedis: () => redis,
    rkey: (...parts: Array<string | number>) => ['newsromania', ...parts].join(':'),
    cacheJson: async <T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> => {
      calls?.push({ key, ttlSec })
      return fn()
    },
    purgeFeedCache: vi.fn(async () => 0),
    // exposed for tests that need to inspect the raw store
    __memory: redis,
  }
}

// ---------------------------------------------------------------------------
// Payload doc fixtures (content.ts mappers)
// ---------------------------------------------------------------------------

/** Lexical editor state: one top-level node per entry; strings become
 *  paragraphs, arrays become a paragraph of joined inline children. */
export function lexicalBody(paragraphs: Array<string | string[]>) {
  return {
    root: {
      type: 'root',
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: paragraphs.map((entry) => ({
        type: 'paragraph',
        version: 1,
        children: (Array.isArray(entry) ? entry : [entry]).map((text) => ({
          type: 'text',
          version: 1,
          text,
        })),
      })),
    },
  }
}

let seq = 0

/** Published original-article doc as the Local API returns it at depth 1. */
export function articleDoc(overrides: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: seq,
    title: `Articol original ${seq}`,
    slug: `articol-original-${seq}`,
    category: { id: 1, slug: 'actualitate', name: 'Actualitate' },
    tags: [],
    author: { id: 1, name: 'Ana Ionescu', email: 'ana@newsromania.info' },
    excerpt: 'Un rezumat scurt al articolului.',
    body: lexicalBody(['Primul paragraf al articolului.', 'Al doilea paragraf, cu detalii.']),
    featuredImage: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    _status: 'published',
    ...overrides,
  }
}

/** Non-archived aggregated-item doc as the Local API returns it at depth 1. */
export function aggregatedDoc(overrides: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: seq,
    title: `Știre agregată ${seq}`,
    slug: `stire-agregata-${seq}`,
    guid: `guid-${seq}`,
    sourceUrl: `https://publisher.example/stiri/${seq}`,
    sourceName: 'Publisher Exemplu',
    sourceHomepage: 'https://publisher.example',
    excerpt: 'Rezumat transformativ fair-use.',
    linkOnly: false,
    category: { id: 2, slug: 'sport', name: 'Sport' },
    tags: [],
    imageUrl: null,
    imageAllowed: false,
    publishedAt: '2026-07-02T09:00:00.000Z',
    archived: false,
    createdAt: '2026-07-02T09:05:00.000Z',
    updatedAt: '2026-07-02T09:05:00.000Z',
    ...overrides,
  }
}
