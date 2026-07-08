import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted): Payload Local API + Redis. buildOpsStats() și ruta GET
// rulează codul REAL, dar ating Payload/Redis doar prin aceste mock-uri —
// niciun apel LLM/API extern (regula de testare din arhitectură §10).
// ---------------------------------------------------------------------------

const authMock = vi.hoisted(() => vi.fn())
const countMock = vi.hoisted(() => vi.fn())
const findMock = vi.hoisted(() => vi.fn())
const findGlobalMock = vi.hoisted(() => vi.fn())
const topArticlesMock = vi.hoisted(() => vi.fn())
const cacheCalls = vi.hoisted(() => [] as Array<{ key: string; ttlSec: number }>)

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({
    auth: authMock,
    count: countMock,
    find: findMock,
    findGlobal: findGlobalMock,
  }),
}))

vi.mock('@/lib/redis', () => ({
  rkey: (...parts: Array<string | number>) => ['newsromania', ...parts].join(':'),
  cacheJson: async <T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> => {
    cacheCalls.push({ key, ttlSec })
    return fn()
  },
}))

// „Cele mai citite” este acoperit de tests/article-views.test.ts; aici îl
// izolăm ca buildOpsStats să nu depindă de Redis pentru contorul de vizualizări.
vi.mock('@/lib/article-views', () => ({
  topArticles: topArticlesMock,
}))

import type { Payload } from 'payload'

import {
  ageMinutes,
  buildOpsStats,
  lastNDays,
  rollupLlmUsage,
  type OpsStats,
} from '../src/lib/ops-stats'
import { GET } from '../src/app/api/admin/ops-stats/route'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-07-06T10:00:00.000Z')

const FEED_DOCS = [
  {
    name: 'Digi24',
    active: true,
    lastFetchedAt: '2026-07-06T09:40:00.000Z',
    lastItemAt: '2026-07-06T09:35:00.000Z',
    consecutiveFailures: 0,
    lastError: null,
  },
  {
    name: 'HotNews',
    active: null, // valorile lipsă trebuie normalizate
    lastFetchedAt: null,
    lastItemAt: null,
    consecutiveFailures: 4,
    lastError: 'HTTP 503 Service Unavailable',
  },
]

// Cel mai recent articol agregat (find limit:1, sort:-publishedAt) — 30 min
// înainte de NOW pentru a verifica prospețimea ingestiei.
const NEWEST_ITEM_DOCS = [{ publishedAt: '2026-07-06T09:30:00.000Z' }]

// Eșantion page_view de azi: 4 evenimente, 3 vizitatori unici (v1 apare de 2 ori).
const TODAY_EVENT_DOCS = [
  { visitorId: 'v1' },
  { visitorId: 'v2' },
  { visitorId: 'v1' },
  { visitorId: 'v3' },
]

// „Cele mai citite” — două rânduri deterministe (join-ul real e testat separat).
const MOST_READ = [
  {
    slug: 'orig-1',
    title: 'Original unu',
    url: 'https://newsromania.info/stiri/orig-1',
    type: 'original' as const,
    views: 9,
  },
  {
    slug: 'agg-1',
    title: 'Agregat unu',
    url: 'https://sursa.example/x',
    type: 'aggregated' as const,
    views: 5,
  },
]

const LLM_DOCS = [
  // Două rânduri în aceeași zi (purpose diferit) — trebuie însumate.
  { day: '2026-07-06', calls: 10, inputTokens: 1_000, outputTokens: 500, estCostUsd: 0.1 },
  { day: '2026-07-06', calls: 5, inputTokens: 200, outputTokens: 100, estCostUsd: 0.2 },
  { day: '2026-07-01', calls: 2, inputTokens: 50, outputTokens: 25, estCostUsd: 0.05 },
  // Zi din afara ferestrei de 7 zile — trebuie ignorată de rollup.
  { day: '2026-06-01', calls: 99, inputTokens: 9_999, outputTokens: 9_999, estCostUsd: 9.99 },
]

const SITE_CONFIG = {
  adNetworks: {
    adSensePublisherId: 'ca-pub-8098077913729716',
    adUnitIds: [
      { slot: 'feed', unitId: 'u1' },
      { slot: 'article', unitId: 'u2' },
    ],
    amazonPartnerTags: [{ marketplace: 'www.amazon.de', tag: 'newsr01-21' }],
  },
}

type CountArgs = { collection: string; where?: Record<string, unknown> }

/** Dispecer determinist pentru payload.count(), pe colecție + filtru. */
function countFor({ collection, where }: CountArgs): number {
  const raw = JSON.stringify(where ?? {})
  switch (collection) {
    case 'articles':
      return raw.includes('createdAt') ? 2 : 12
    case 'aggregated-items':
      if (raw.includes('createdAt')) return 3 // ingestate în ultima oră
      return raw.includes('publishedAt') ? 5 : 34
    case 'cdp-events':
      // Vizualizări de azi (page_view + ts) vs. evenimente pe 24h.
      return raw.includes('page_view') ? 18 : 120
    case 'cdp-profiles':
      return 40
    case 'consent-records':
      if (raw.includes('accepted')) return 30
      if (raw.includes('refused')) return 9
      return 3
    case 'social-queue':
      if (raw.includes('queued')) return 4
      if (raw.includes('approved')) return 2
      return 1
    default:
      throw new Error(`count neașteptat pentru colecția ${collection}`)
  }
}

function makeRequest(): Request {
  return new Request('http://localhost/api/admin/ops-stats', {
    headers: { cookie: 'payload-token=jwt-de-test' },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  cacheCalls.length = 0
  authMock.mockReset().mockResolvedValue({ user: { id: 1, role: 'admin' } })
  countMock
    .mockReset()
    .mockImplementation(async (args: CountArgs) => ({ totalDocs: countFor(args) }))
  findMock.mockReset().mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === 'feeds') return { docs: FEED_DOCS }
    if (collection === 'llm-usage') return { docs: LLM_DOCS }
    if (collection === 'aggregated-items') return { docs: NEWEST_ITEM_DOCS }
    if (collection === 'cdp-events') return { docs: TODAY_EVENT_DOCS }
    throw new Error(`find neașteptat pentru colecția ${collection}`)
  })
  findGlobalMock.mockReset().mockResolvedValue(SITE_CONFIG)
  topArticlesMock.mockReset().mockResolvedValue(MOST_READ)
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Helpers pure
// ---------------------------------------------------------------------------

describe('lastNDays', () => {
  it('returnează ultimele N zile UTC, de la cea mai veche la azi', () => {
    expect(lastNDays(7, NOW)).toEqual([
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
    ])
  })
})

describe('rollupLlmUsage', () => {
  it('însumează rândurile pe zi, adună tokenii in+out și umple zilele lipsă cu 0', () => {
    const days = lastNDays(7, NOW)
    const rollup = rollupLlmUsage(LLM_DOCS as never, days)

    expect(rollup).toHaveLength(7)
    expect(rollup.map((d) => d.day)).toEqual(days)

    const today = rollup.at(-1)!
    expect(today).toEqual({ day: '2026-07-06', calls: 15, tokens: 1_800, estCostUsd: 0.3 })

    const july1 = rollup.find((d) => d.day === '2026-07-01')!
    expect(july1).toEqual({ day: '2026-07-01', calls: 2, tokens: 75, estCostUsd: 0.05 })

    // Zi fără consum → zerouri explicite (necesare pentru sparkline).
    const empty = rollup.find((d) => d.day === '2026-07-03')!
    expect(empty).toEqual({ day: '2026-07-03', calls: 0, tokens: 0, estCostUsd: 0 })
  })

  it('rotunjește costul la 4 zecimale (fără zgomot de virgulă mobilă)', () => {
    const rollup = rollupLlmUsage(
      [
        { day: '2026-07-06', calls: 1, inputTokens: 0, outputTokens: 0, estCostUsd: 0.1 },
        { day: '2026-07-06', calls: 1, inputTokens: 0, outputTokens: 0, estCostUsd: 0.2 },
      ] as never,
      ['2026-07-06'],
    )
    expect(rollup[0]!.estCostUsd).toBe(0.3)
  })
})

describe('ageMinutes', () => {
  it('calculează vârsta în minute întregi față de now', () => {
    expect(ageMinutes('2026-07-06T09:30:00.000Z', NOW)).toBe(30)
    expect(ageMinutes('2026-07-06T08:00:00.000Z', NOW)).toBe(120)
  })

  it('returnează 0 pentru timestamp din viitor (nenegativ)', () => {
    expect(ageMinutes('2026-07-06T11:00:00.000Z', NOW)).toBe(0)
  })

  it('returnează null pentru valori lipsă sau nevalide', () => {
    expect(ageMinutes(null, NOW)).toBeNull()
    expect(ageMinutes(undefined, NOW)).toBeNull()
    expect(ageMinutes('nu-e-o-dată', NOW)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildOpsStats — forma agregatului
// ---------------------------------------------------------------------------

describe('buildOpsStats', () => {
  it('produce forma completă din contract, cu valorile normalizate', async () => {
    const payload = {
      count: countMock,
      find: findMock,
      findGlobal: findGlobalMock,
    } as unknown as Payload

    const stats = await buildOpsStats(payload, NOW)

    expect(stats).toEqual({
      generatedAt: NOW.toISOString(),
      feeds: [
        {
          name: 'Digi24',
          active: true,
          lastFetchedAt: '2026-07-06T09:40:00.000Z',
          lastItemAt: '2026-07-06T09:35:00.000Z',
          consecutiveFailures: 0,
          lastError: null,
        },
        {
          name: 'HotNews',
          active: false,
          lastFetchedAt: null,
          lastItemAt: null,
          consecutiveFailures: 4,
          lastError: 'HTTP 503 Service Unavailable',
        },
      ],
      content: {
        originals: 12,
        aggregated: 34,
        publishedToday: 7,
        ingestedLastHour: 3,
        // NEWEST_ITEM_DOCS.publishedAt este cu 30 min înainte de NOW.
        newestItemAgeMinutes: 30,
      },
      llm: rollupLlmUsage(LLM_DOCS as never, lastNDays(7, NOW)),
      mostRead: MOST_READ,
      cdp: {
        events24h: 120,
        profiles: 40,
        consents: { accepted: 30, refused: 9, withdrawn: 3 },
        todayViews: 18,
        todayVisitors: 3,
      },
      social: { queued: 4, approved: 2, postedToday: 1 },
      adConfig: { unitsConfigured: 2, amazonTags: 1 },
    })
  })

  it('interoghează llm-usage doar pe fereastra de 7 zile', async () => {
    const payload = {
      count: countMock,
      find: findMock,
      findGlobal: findGlobalMock,
    } as unknown as Payload

    await buildOpsStats(payload, NOW)

    const llmCall = findMock.mock.calls.find(([args]) => args.collection === 'llm-usage')!
    expect(llmCall[0].where).toEqual({ day: { in: lastNDays(7, NOW) } })
    expect(llmCall[0].limit).toBeLessThanOrEqual(500)
  })

  it('raportează prospețime null când nu există niciun articol agregat', async () => {
    findMock.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'feeds') return { docs: FEED_DOCS }
      if (collection === 'llm-usage') return { docs: LLM_DOCS }
      if (collection === 'aggregated-items') return { docs: [] }
      if (collection === 'cdp-events') return { docs: TODAY_EVENT_DOCS }
      throw new Error(`find neașteptat pentru colecția ${collection}`)
    })
    const payload = {
      count: countMock,
      find: findMock,
      findGlobal: findGlobalMock,
    } as unknown as Payload

    const stats = await buildOpsStats(payload, NOW)
    expect(stats.content.newestItemAgeMinutes).toBeNull()
  })

  it('tratează site-config fără adNetworks (zero unități, zero taguri)', async () => {
    findGlobalMock.mockResolvedValue({})
    const payload = {
      count: countMock,
      find: findMock,
      findGlobal: findGlobalMock,
    } as unknown as Payload

    const stats = await buildOpsStats(payload, NOW)
    expect(stats.adConfig).toEqual({ unitsConfigured: 0, amazonTags: 0 })
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/ops-stats — autentificare + cache
// ---------------------------------------------------------------------------

describe('GET /api/admin/ops-stats', () => {
  it('răspunde 403 fără utilizator autentificat și nu atinge datele', async () => {
    authMock.mockResolvedValue({ user: null })

    const response = await GET(makeRequest())

    expect(response.status).toBe(403)
    expect(countMock).not.toHaveBeenCalled()
    expect(findMock).not.toHaveBeenCalled()
    expect(cacheCalls).toHaveLength(0)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain('Acces interzis')
  })

  it('răspunde 403 și când payload.auth aruncă (token corupt)', async () => {
    authMock.mockRejectedValue(new Error('jwt malformed'))
    const response = await GET(makeRequest())
    expect(response.status).toBe(403)
  })

  it('răspunde 403 pentru un rol non-admin (editor/author) — date de business', async () => {
    authMock.mockResolvedValue({ user: { id: 2, role: 'author' } })
    const response = await GET(makeRequest())
    expect(response.status).toBe(403)
    expect(countMock).not.toHaveBeenCalled()
    expect(cacheCalls).toHaveLength(0)
  })

  it('răspunde 200 cu agregatul complet pentru un utilizator logat', async () => {
    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    const stats = (await response.json()) as OpsStats

    expect(stats.content).toEqual({
      originals: 12,
      aggregated: 34,
      publishedToday: 7,
      ingestedLastHour: 3,
      newestItemAgeMinutes: 30,
    })
    expect(stats.feeds).toHaveLength(2)
    expect(stats.llm).toHaveLength(7)
    expect(stats.mostRead).toEqual(MOST_READ)
    expect(stats.cdp.consents).toEqual({ accepted: 30, refused: 9, withdrawn: 3 })
    expect(stats.cdp.todayViews).toBe(18)
    expect(stats.cdp.todayVisitors).toBe(3)
    expect(stats.social).toEqual({ queued: 4, approved: 2, postedToday: 1 })
    expect(stats.adConfig).toEqual({ unitsConfigured: 2, amazonTags: 1 })

    // Autentificarea s-a făcut cu antetele cererii (cookie-ul de sesiune).
    expect(authMock).toHaveBeenCalledTimes(1)
    const authArgs = authMock.mock.calls[0]![0] as { headers: Headers }
    expect(authArgs.headers.get('cookie')).toContain('payload-token=')
  })

  it('folosește cache-ul Redis cu cheia prefixată și TTL 60 s', async () => {
    await GET(makeRequest())
    expect(cacheCalls).toEqual([{ key: 'newsromania:admin:ops-stats', ttlSec: 60 }])
  })

  it('răspunde 500 (fără a propaga excepția) când agregarea eșuează', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    countMock.mockRejectedValue(new Error('db down'))

    const response = await GET(makeRequest())

    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain('nu au putut fi calculate')
    consoleError.mockRestore()
  })
})
