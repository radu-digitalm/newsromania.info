import type { Payload } from 'payload'

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
  }
  llm: OpsLlmDay[]
  cdp: {
    events24h: number
    profiles: number
    consents: {
      accepted: number
      refused: number
      withdrawn: number
    }
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

  const [
    feedsResult,
    originals,
    aggregated,
    originalsToday,
    aggregatedToday,
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
  ])

  return {
    generatedAt: now.toISOString(),
    feeds: feedsResult.docs.map((feed) => ({
      name: feed.name,
      active: feed.active === true,
      lastFetchedAt: feed.lastFetchedAt ?? null,
      consecutiveFailures: feed.consecutiveFailures ?? 0,
      lastError: feed.lastError ?? null,
    })),
    content: {
      originals,
      aggregated,
      publishedToday: originalsToday + aggregatedToday,
    },
    llm: rollupLlmUsage(llmResult.docs, days),
    cdp: {
      events24h,
      profiles,
      consents: {
        accepted: consentsAccepted,
        refused: consentsRefused,
        withdrawn: consentsWithdrawn,
      },
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
