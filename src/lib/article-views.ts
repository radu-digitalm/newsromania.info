import type { Payload } from 'payload'

import { absoluteUrl } from '@/lib/seo'
import { getRedis, rkey } from '@/lib/redis'

/**
 * Consent-free AGGREGATE article view counters (owner ask #2b — „cele mai
 * citite” panel in /admin).
 *
 * Storage: a single Redis sorted set `newsromania:views:articles`, member =
 * article slug, score = cumulative view count. A sorted set keeps the whole
 * dataset in one key and makes topArticles() a single bounded ZREVRANGE — no
 * SCAN over per-article keys, no unbounded growth of key space.
 *
 * PRIVACY: this is a plain global tally. It stores NO visitorId, IP, cookie,
 * timestamp, or any per-user signal — it is not behavioural tracking and needs
 * no consent (distinct from cdp-events, which is consent-gated). It complements
 * the CDP: cdp-events only records page_view AFTER consent, so its counts are a
 * lower bound; this counter reflects real reach.
 *
 * RESILIENCE: recordArticleView is best-effort and NEVER throws (a counter must
 * never take a page render down); topArticles degrades to [] on any failure so
 * the dashboard panel shows a friendly empty state instead of crashing.
 */

/** Redis sorted-set key holding every article's cumulative view tally. */
function viewsKey(): string {
  return rkey('views', 'articles')
}

/**
 * Normalise a slug/id argument to the sorted-set member. We store by SLUG
 * (stable, human-readable, shared vocabulary between originals and aggregated
 * items and the article URL). Trims and lowercases nothing — slugs are already
 * canonical — but rejects empty/oversized input defensively.
 */
function normaliseMember(idOrSlug: string): string | null {
  if (typeof idOrSlug !== 'string') return null
  const member = idOrSlug.trim()
  if (!member || member.length > 512) return null
  return member
}

/**
 * Increment the aggregate view counter for one article. Call from the article
 * page render (FIX-ADS wires this into src/app/(frontend)/stiri/[slug]).
 *
 * Best-effort: swallows every error (bad input, Redis down) and resolves to
 * false rather than throwing. Returns true only when the counter was bumped.
 */
export async function recordArticleView(idOrSlug: string): Promise<boolean> {
  const member = normaliseMember(idOrSlug)
  if (!member) return false
  try {
    await getRedis().zincrby(viewsKey(), 1, member)
    return true
  } catch {
    // A view counter must never surface an error to the caller.
    return false
  }
}

/** One row of the „most read” panel. */
export interface TopArticle {
  slug: string
  title: string
  /** On-site (original) or publisher (aggregated) URL — absolute. */
  url: string
  /** 'original' | 'aggregated' — drives the label/target in the UI. */
  type: 'original' | 'aggregated'
  views: number
}

/** Clamp for the top-N request — a dashboard panel never needs more. */
const MAX_TOP = 20

interface ViewEntry {
  slug: string
  views: number
}

/**
 * Read the top-N slugs (by score, desc) from the sorted set. Returns [] on any
 * Redis error. Exported for testing.
 */
export async function topViewedSlugs(n: number): Promise<ViewEntry[]> {
  const limit = Math.max(0, Math.min(Math.trunc(n) || 0, MAX_TOP))
  if (limit === 0) return []
  try {
    // ZREVRANGE key 0 limit-1 WITHSCORES → [member, score, member, score, …]
    const flat = await getRedis().zrevrange(viewsKey(), 0, limit - 1, 'WITHSCORES')
    const entries: ViewEntry[] = []
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const slug = flat[i]!
      const views = Number(flat[i + 1])
      if (slug && Number.isFinite(views) && views > 0) {
        entries.push({ slug, views })
      }
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Join the top slugs to article/aggregated-item metadata (title + URL) via a
 * bounded Local API lookup — two `find` queries with a `slug in [...]` filter,
 * never a table scan. Originals resolve to their on-site page; aggregated items
 * link out to the publisher (design §3.5 — we never claim their page as ours).
 *
 * Rows whose slug no longer resolves (deleted/renamed article) are dropped, so
 * the panel only ever shows live, clickable entries. Order follows the Redis
 * score (most read first).
 *
 * NEVER throws: on any error it returns [] so the dashboard shows an empty
 * state rather than failing the whole ops payload.
 */
export async function topArticles(payload: Payload, n: number): Promise<TopArticle[]> {
  let entries: ViewEntry[]
  try {
    entries = await topViewedSlugs(n)
  } catch {
    return []
  }
  if (entries.length === 0) return []

  const slugs = entries.map((e) => e.slug)

  try {
    const [articlesResult, aggregatedResult] = await Promise.all([
      payload.find({
        collection: 'articles',
        depth: 0,
        limit: slugs.length,
        pagination: false,
        where: {
          and: [{ slug: { in: slugs } }, { _status: { equals: 'published' } }],
        },
      }),
      payload.find({
        collection: 'aggregated-items',
        depth: 0,
        limit: slugs.length,
        pagination: false,
        where: {
          and: [{ slug: { in: slugs } }, { archived: { not_equals: true } }],
        },
      }),
    ])

    // slug → resolved metadata. Originals take precedence if a slug somehow
    // collides across collections (originals own the /stiri/<slug> route).
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
