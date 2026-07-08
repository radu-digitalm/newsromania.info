import type { Payload } from 'payload'

import { topArticles, type TopArticle } from '@/lib/article-views'
import type { LlmUsage, SiteConfig } from '@/payload-types'

/**
 * Agregarea statisticilor operaționale pentru panoul de administrare
 * (PROJECT_BRIEF §17 — monitorizare sănătate feed-uri, cost LLM, CDP, social).
 *
 * Ruta /api/admin/ops-stats apelează buildOpsStats() prin Local API și pune
 * rezultatul în cache Redis 60 s — vezi src/app/api/admin/ops-stats/route.ts.
 * Forma de mai jos este contractul consumat de OpsDashboard.tsx.
 */

export interface OpsFeedStatus {
  name: string
  active: boolean
  lastFetchedAt: string | null
  lastItemAt: string | null
  consecutiveFailures: number
  lastError: string | null
}

export interface OpsLlmDay {
  /** YYYY-MM-DD (UTC — aceeași convenție ca src/lib/llm.ts). */
  day: string
  calls: number
  tokens: number
  estCostUsd: number
}

export interface OpsStats {
  generatedAt: string
  feeds: OpsFeedStatus[]
  content: {
    originals: number
    aggregated: number
    publishedToday: number
    ingestedLastHour: number
    /** Vârsta celui mai recent articol agregat, în minute (null = niciun articol). */
    newestItemAgeMinutes: number | null
  }
  llm: OpsLlmDay[]
  /** Content performance — „cele mai citite” (aggregate view tally, no PII). */
  mostRead: TopArticle[]
  cdp: {
    events24h: number
    profiles: number
    consents: {
      accepted: number
      refused: number
      withdrawn: number
    }
    /** Consent-gated traffic for the current UTC day (page_view events). */
    todayViews: number
    /** Distinct visitorId seen today (bounded sample — see buildOpsStats). */
    todayVisitors: number
  }
  social: {
    queued: number
    approved: number
    postedToday: number
  }
  adConfig: {
    unitsConfigured: number
    amazonTags: number
  }
}

const LLM_WINDOW_DAYS = 7
const MAX_FEEDS = 200
const MAX_LLM_ROWS = 500
/** How many „most read” rows the dashboard panel shows. */
const TOP_ARTICLES = 5
/**
 * Bounded page_view sample for today's unique-visitor count. Payload has no
 * COUNT(DISTINCT), so we pull today's page_view rows (id+visitorId only, depth
 * 0) up to this cap and dedupe in memory — cheap and correct at current volume;
 * degrades to „≥ cap” semantics only if a single day ever exceeds it.
 */
const MAX_TODAY_EVENTS = 5_000

/** Ultimele `count` zile (UTC, YYYY-MM-DD), de la cea mai veche la azi. */
export function lastNDays(count: number, now: Date = new Date()): string[] {
  const days: string[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10))
  }
  return days
}

/**
 * Miezul nopții UTC al zilei curente — pragul pentru „publicate azi”.
 * UTC (nu Europe/București) ca să rămână consecvent cu `llm-usage.day`.
 */
function todayStartIso(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 10)}T00:00:00.000Z`
}

/**
 * Vârsta unui timestamp ISO în minute întregi față de `now` (nenegativă).
 * Returnează null pentru valori lipsă/nevalide. Folosită pentru prospețimea
 * ingestiei (cel mai recent articol agregat).
 */
export function ageMinutes(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((now.getTime() - then) / 60_000))
}

/** Rulaj pe zile: sumează calls/tokens/cost și completează zilele lipsă cu 0. */
export function rollupLlmUsage(rows: LlmUsage[], days: string[]): OpsLlmDay[] {
  const byDay = new Map<string, OpsLlmDay>(
    days.map((day) => [day, { day, calls: 0, tokens: 0, estCostUsd: 0 }]),
  )
  for (const row of rows) {
    const bucket = byDay.get(row.day)
    if (!bucket) continue
    bucket.calls += row.calls ?? 0
    bucket.tokens += (row.inputTokens ?? 0) + (row.outputTokens ?? 0)
    bucket.estCostUsd += row.estCostUsd ?? 0
  }
  return days.map((day) => {
    const bucket = byDay.get(day)!
    // Suma float-urilor per rând adună zgomot binar — rotunjim la 4 zecimale.
    return { ...bucket, estCostUsd: Math.round(bucket.estCostUsd * 10_000) / 10_000 }
  })
}

async function countDocs(
  payload: Payload,
  collection: Parameters<Payload['count']>[0]['collection'],
  where?: Parameters<Payload['count']>[0]['where'],
): Promise<number> {
  const result = await payload.count({ collection, where })
  return result.totalDocs
}

/**
 * Colectează toate statisticile printr-un set fix de interogări Local API
 * (count/find cu limite stricte — niciodată tabele întregi). Apelantul este
 * responsabil de autentificare și de cache.
 */
export async function buildOpsStats(payload: Payload, now: Date = new Date()): Promise<OpsStats> {
  const days = lastNDays(LLM_WINDOW_DAYS, now)
  const dayStart = todayStartIso(now)
  const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const since1h = new Date(now.getTime() - 3_600_000).toISOString()

  const [
    feedsResult,
    originals,
    aggregated,
    originalsToday,
    aggregatedToday,
    ingestedLastHour,
    newestItemResult,
    llmResult,
    events24h,
    profiles,
    consentsAccepted,
    consentsRefused,
    consentsWithdrawn,
    socialQueued,
    socialApproved,
    socialPostedToday,
    siteConfig,
    mostRead,
    todayViews,
    todayEventsResult,
  ] = await Promise.all([
    payload.find({
      collection: 'feeds',
      depth: 0,
      limit: MAX_FEEDS,
      sort: 'name',
    }),
    countDocs(payload, 'articles', { _status: { equals: 'published' } }),
    countDocs(payload, 'aggregated-items', { archived: { not_equals: true } }),
    // Aproximare rezonabilă: articolele nu păstrează un `publishedAt` propriu,
    // deci numărăm documentele publicate CREATE azi (arh. §3 — drafts).
    countDocs(payload, 'articles', {
      and: [{ _status: { equals: 'published' } }, { createdAt: { greater_than_equal: dayStart } }],
    }),
    countDocs(payload, 'aggregated-items', {
      and: [{ archived: { not_equals: true } }, { publishedAt: { greater_than_equal: dayStart } }],
    }),
    // Ritmul ingestiei: câte articole agregate au intrat în ultima oră.
    countDocs(payload, 'aggregated-items', { createdAt: { greater_than_equal: since1h } }),
    // Prospețimea ingestiei: cel mai recent articol (după publishedAt) — o
    // singură linie, sortare descrescătoare (interogare mărginită).
    payload.find({
      collection: 'aggregated-items',
      depth: 0,
      limit: 1,
      sort: '-publishedAt',
    }),
    payload.find({
      collection: 'llm-usage',
      depth: 0,
      limit: MAX_LLM_ROWS,
      pagination: false,
      where: { day: { in: days } },
    }),
    countDocs(payload, 'cdp-events', { ts: { greater_than_equal: since24h } }),
    countDocs(payload, 'cdp-profiles'),
    countDocs(payload, 'consent-records', { choice: { equals: 'accepted' } }),
    countDocs(payload, 'consent-records', { choice: { equals: 'refused' } }),
    countDocs(payload, 'consent-records', { choice: { equals: 'withdrawn' } }),
    countDocs(payload, 'social-queue', { status: { equals: 'queued' } }),
    countDocs(payload, 'social-queue', { status: { equals: 'approved' } }),
    countDocs(payload, 'social-queue', {
      and: [{ status: { equals: 'posted' } }, { postedAt: { greater_than_equal: dayStart } }],
    }),
    payload.findGlobal({ slug: 'site-config', depth: 0 }) as Promise<SiteConfig>,
    // „Cele mai citite” — aggregate view tally joined to titles (never throws;
    // returns [] if Redis is down or nothing has been read yet).
    topArticles(payload, TOP_ARTICLES),
    // Today at a glance: consent-gated page_view volume for the current UTC day.
    countDocs(payload, 'cdp-events', {
      and: [{ type: { equals: 'page_view' } }, { ts: { greater_than_equal: dayStart } }],
    }),
    // Bounded sample of today's page_view rows to count DISTINCT visitors in JS
    // (Payload has no COUNT(DISTINCT)); id+visitorId only, depth 0.
    payload.find({
      collection: 'cdp-events',
      depth: 0,
      limit: MAX_TODAY_EVENTS,
      pagination: false,
      where: {
        and: [{ type: { equals: 'page_view' } }, { ts: { greater_than_equal: dayStart } }],
      },
    }),
  ])

  const newestItem = newestItemResult.docs[0]
  const newestIso = newestItem?.publishedAt ?? newestItem?.createdAt ?? null
  const newestItemAgeMinutes = ageMinutes(newestIso, now)

  const todayVisitors = new Set(
    todayEventsResult.docs.map((event) => event.visitorId).filter(Boolean),
  ).size

  return {
    generatedAt: now.toISOString(),
    feeds: feedsResult.docs.map((feed) => ({
      name: feed.name,
      active: feed.active === true,
      lastFetchedAt: feed.lastFetchedAt ?? null,
      lastItemAt: feed.lastItemAt ?? null,
      consecutiveFailures: feed.consecutiveFailures ?? 0,
      lastError: feed.lastError ?? null,
    })),
    content: {
      originals,
      aggregated,
      publishedToday: originalsToday + aggregatedToday,
      ingestedLastHour,
      newestItemAgeMinutes,
    },
    llm: rollupLlmUsage(llmResult.docs, days),
    mostRead,
    cdp: {
      events24h,
      profiles,
      consents: {
        accepted: consentsAccepted,
        refused: consentsRefused,
        withdrawn: consentsWithdrawn,
      },
      todayViews,
      todayVisitors,
    },
    social: {
      queued: socialQueued,
      approved: socialApproved,
      postedToday: socialPostedToday,
    },
    adConfig: {
      unitsConfigured: siteConfig.adNetworks?.adUnitIds?.length ?? 0,
      amazonTags: siteConfig.adNetworks?.amazonPartnerTags?.length ?? 0,
    },
  }
}
