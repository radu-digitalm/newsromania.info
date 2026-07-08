import { Pool } from 'pg'
import type { Payload } from 'payload'

import { absoluteUrl } from '@/lib/seo'

/**
 * „Cele mai citite" (most read) — sourced from REAL Umami pageviews, not the old
 * server-render counter (which counted bots/crawlers/our own requests and so
 * diverged wildly from the Umami dashboard). Umami only records a pageview when
 * a real browser loads the page and runs its (cookieless, consent-free) tracker,
 * so these counts match what the owner sees in the Umami UI.
 *
 * Umami runs in a SEPARATE database (`umami`) on the SAME postgres instance as
 * the app. `newsromania` is a superuser, so we open a small read-only pool to
 * that db by swapping the db name in DATABASE_URL (or an explicit
 * UMAMI_DATABASE_URL). Everything here is best-effort: any failure (db down,
 * schema drift, no id) resolves to [] so the dashboard shows a friendly empty
 * state instead of breaking the whole ops payload.
 */

export interface TopArticle {
  slug: string
  title: string
  /** On-site (original) or publisher (aggregated) URL — absolute. */
  url: string
  type: 'original' | 'aggregated'
  views: number
}

/** Clamp for the top-N request — a dashboard panel never needs more. */
const MAX_TOP = 20

// Lazy singleton pool to the Umami db. max:2 — this is a low-traffic admin read.
let umamiPool: Pool | null = null
function getUmamiPool(): Pool | null {
  if (umamiPool) return umamiPool
  const base = process.env.UMAMI_DATABASE_URL ?? process.env.DATABASE_URL
  if (!base) return null
  try {
    const url = new URL(base)
    // Same postgres instance, different database — unless an explicit override.
    if (!process.env.UMAMI_DATABASE_URL) url.pathname = '/umami'
    umamiPool = new Pool({
      connectionString: url.toString(),
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    // An idle-client error must never crash the app.
    umamiPool.on('error', () => {})
    return umamiPool
  } catch {
    return null
  }
}

/**
 * Extract the article slug from a `/stiri/<slug>` pageview path. Pure + exported
 * for tests. Returns null for any non-article path (home, category, …).
 */
export function slugFromStiriPath(path: string): string | null {
  if (typeof path !== 'string') return null
  const match = path.match(/^\/stiri\/([^/?#]+)/)
  if (!match) return null
  try {
    const slug = decodeURIComponent(match[1]!).trim()
    return slug.length > 0 && slug.length <= 512 ? slug : null
  } catch {
    return null
  }
}

interface ReadEntry {
  slug: string
  views: number
}

/**
 * Top article slugs by REAL Umami pageviews (event_type=1) over the last `days`.
 * Aggregates multiple url_path variants (trailing slash, query) to one slug.
 * Returns [] on any error / missing config.
 */
export async function topArticleReads(n: number, days = 7): Promise<ReadEntry[]> {
  const limit = Math.max(0, Math.min(Math.trunc(n) || 0, MAX_TOP))
  const websiteId = process.env.UMAMI_WEBSITE_ID
  const pool = getUmamiPool()
  if (limit === 0 || !websiteId || !pool) return []
  const safeDays = Math.max(1, Math.min(Math.trunc(days) || 7, 365))
  try {
    const res = await pool.query<{ url_path: string; views: number }>(
      `select url_path, count(*)::int as views
         from website_event
        where website_id = $1::uuid
          and event_type = 1
          and url_path like '/stiri/%'
          and created_at >= now() - ($2 || ' days')::interval
        group by url_path
        order by views desc
        limit $3`,
      [websiteId, String(safeDays), limit * 3],
    )
    const bySlug = new Map<string, number>()
    for (const row of res.rows) {
      const slug = slugFromStiriPath(row.url_path)
      if (!slug) continue
      bySlug.set(slug, (bySlug.get(slug) ?? 0) + Number(row.views))
    }
    return [...bySlug.entries()]
      .map(([slug, views]) => ({ slug, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit)
  } catch {
    return []
  }
}

/**
 * Join the top-read slugs to article/aggregated-item metadata (title + URL) via
 * a bounded Local API lookup (two `find`s with `slug in [...]`). Originals →
 * on-site page; aggregated → publisher URL (design §3.5). Order follows the
 * Umami view counts (most read first). NEVER throws → [] on any error.
 */
export async function topArticlesFromUmami(
  payload: Payload,
  n: number,
  days = 7,
): Promise<TopArticle[]> {
  const entries = await topArticleReads(n, days)
  if (entries.length === 0) return []
  const slugs = entries.map((e) => e.slug)

  try {
    const [articlesResult, aggregatedResult] = await Promise.all([
      payload.find({
        collection: 'articles',
        depth: 0,
        limit: slugs.length,
        pagination: false,
        where: { and: [{ slug: { in: slugs } }, { _status: { equals: 'published' } }] },
      }),
      payload.find({
        collection: 'aggregated-items',
        depth: 0,
        limit: slugs.length,
        pagination: false,
        where: { and: [{ slug: { in: slugs } }, { archived: { not_equals: true } }] },
      }),
    ])

    const bySlug = new Map<string, Omit<TopArticle, 'views'>>()
    for (const item of aggregatedResult.docs) {
      if (!item.slug) continue
      bySlug.set(item.slug, {
        slug: item.slug,
        title: item.title ?? item.slug,
        url: item.sourceUrl ?? absoluteUrl(`/stiri/${item.slug}`),
        type: 'aggregated',
      })
    }
    for (const article of articlesResult.docs) {
      if (!article.slug) continue
      bySlug.set(article.slug, {
        slug: article.slug,
        title: article.title ?? article.slug,
        url: absoluteUrl(`/stiri/${article.slug}`),
        type: 'original',
      })
    }

    const rows: TopArticle[] = []
    for (const entry of entries) {
      const meta = bySlug.get(entry.slug)
      if (meta) rows.push({ ...meta, views: entry.views })
    }
    return rows
  } catch {
    return []
  }
}
