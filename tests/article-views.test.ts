import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * article-views — the consent-free aggregate view counter behind the admin
 * „cele mai citite” panel. Exercised through mocked Redis + Payload (no live
 * services, arch §10). Guarantees under test:
 *   - recordArticleView ZINCRBYs the prefixed sorted-set key and NEVER throws;
 *   - topViewedSlugs reads ZREVRANGE WITHSCORES and parses the flat reply;
 *   - topArticles joins slugs to titles/URLs, drops missing rows, keeps score
 *     order, and degrades to [] on any error.
 */

const zincrbyMock = vi.hoisted(() => vi.fn())
const zrevrangeMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/redis', () => ({
  rkey: (...parts: Array<string | number>) => ['newsromania', ...parts].join(':'),
  getRedis: () => ({ zincrby: zincrbyMock, zrevrange: zrevrangeMock }),
}))

vi.mock('@/lib/seo', () => ({
  absoluteUrl: (p: string) => `https://newsromania.info${p.startsWith('/') ? p : `/${p}`}`,
}))

import type { Payload } from 'payload'

import {
  recordArticleView,
  topArticles,
  topViewedSlugs,
  type TopArticle,
} from '../src/lib/article-views'

beforeEach(() => {
  zincrbyMock.mockReset().mockResolvedValue(1)
  zrevrangeMock.mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recordArticleView', () => {
  it('ZINCRBYs the prefixed sorted-set key by 1 for a valid slug', async () => {
    await expect(recordArticleView('un-articol')).resolves.toBe(true)
    expect(zincrbyMock).toHaveBeenCalledWith('newsromania:views:articles', 1, 'un-articol')
  })

  it('trims the member and rejects empty / oversized input without touching Redis', async () => {
    await expect(recordArticleView('  spatii  ')).resolves.toBe(true)
    expect(zincrbyMock).toHaveBeenLastCalledWith('newsromania:views:articles', 1, 'spatii')

    zincrbyMock.mockClear()
    await expect(recordArticleView('   ')).resolves.toBe(false)
    await expect(recordArticleView('x'.repeat(513))).resolves.toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(recordArticleView(undefined as any)).resolves.toBe(false)
    expect(zincrbyMock).not.toHaveBeenCalled()
  })

  it('NEVER throws — swallows a Redis failure and returns false', async () => {
    zincrbyMock.mockRejectedValue(new Error('redis down'))
    await expect(recordArticleView('un-articol')).resolves.toBe(false)
  })
})

describe('topViewedSlugs', () => {
  it('parses the flat WITHSCORES reply into {slug, views}, most read first', async () => {
    zrevrangeMock.mockResolvedValue(['a', '10', 'b', '4', 'c', '1'])
    const entries = await topViewedSlugs(5)
    expect(entries).toEqual([
      { slug: 'a', views: 10 },
      { slug: 'b', views: 4 },
      { slug: 'c', views: 1 },
    ])
    expect(zrevrangeMock).toHaveBeenCalledWith('newsromania:views:articles', 0, 4, 'WITHSCORES')
  })

  it('clamps N to [0, 20] and short-circuits at 0 without hitting Redis', async () => {
    await expect(topViewedSlugs(0)).resolves.toEqual([])
    await expect(topViewedSlugs(-3)).resolves.toEqual([])
    expect(zrevrangeMock).not.toHaveBeenCalled()

    await topViewedSlugs(999)
    expect(zrevrangeMock).toHaveBeenCalledWith('newsromania:views:articles', 0, 19, 'WITHSCORES')
  })

  it('drops zero/NaN scores and returns [] on a Redis error', async () => {
    zrevrangeMock.mockResolvedValue(['a', '0', 'b', 'nan', 'c', '3'])
    expect(await topViewedSlugs(5)).toEqual([{ slug: 'c', views: 3 }])

    zrevrangeMock.mockRejectedValue(new Error('redis down'))
    expect(await topViewedSlugs(5)).toEqual([])
  })
})

describe('topArticles', () => {
  function fakePayload(articles: unknown[], aggregated: unknown[]): Payload {
    return {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'articles') return { docs: articles }
        if (collection === 'aggregated-items') return { docs: aggregated }
        throw new Error(`find neașteptat: ${collection}`)
      }),
    } as unknown as Payload
  }

  it('joins slugs to titles/URLs, keeps score order, resolves both types', async () => {
    zrevrangeMock.mockResolvedValue(['orig-1', '9', 'agg-1', '5'])
    const payload = fakePayload(
      [{ slug: 'orig-1', title: 'Original unu' }],
      [{ slug: 'agg-1', title: 'Agregat unu', sourceUrl: 'https://sursa.example/x' }],
    )

    const rows = await topArticles(payload, 5)
    expect(rows).toEqual<TopArticle[]>([
      {
        slug: 'orig-1',
        title: 'Original unu',
        url: 'https://newsromania.info/stiri/orig-1',
        type: 'original',
        views: 9,
      },
      {
        slug: 'agg-1',
        title: 'Agregat unu',
        url: 'https://sursa.example/x',
        type: 'aggregated',
        views: 5,
      },
    ])
  })

  it('drops slugs that no longer resolve (deleted/renamed article)', async () => {
    zrevrangeMock.mockResolvedValue(['orig-1', '9', 'ghost', '5'])
    const payload = fakePayload([{ slug: 'orig-1', title: 'Original unu' }], [])
    const rows = await topArticles(payload, 5)
    expect(rows.map((r) => r.slug)).toEqual(['orig-1'])
  })

  it('returns [] when nothing has been read yet', async () => {
    zrevrangeMock.mockResolvedValue([])
    const payload = fakePayload([], [])
    expect(await topArticles(payload, 5)).toEqual([])
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('degrades to [] when the Postgres join throws (never crashes the dashboard)', async () => {
    zrevrangeMock.mockResolvedValue(['orig-1', '9'])
    const payload = {
      find: vi.fn(async () => {
        throw new Error('db down')
      }),
    } as unknown as Payload
    expect(await topArticles(payload, 5)).toEqual([])
  })
})
