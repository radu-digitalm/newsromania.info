import { NextResponse, type NextRequest } from 'next/server'

import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { getFeed, searchPage } from '@/lib/content'
import { buildFeedBatchResponse, parseFeedParams } from '@/lib/feed-serialize'
import { getClientIp, normalizeIp } from '@/lib/geo'
import { rateLimit, rkey } from '@/lib/redis'

/**
 * GET /api/feed — the infinite-scroll batch endpoint (design direction v2.1
 * §8.8). Node runtime, per-request:
 *
 *   ?page=N                 → home stream batch
 *   ?page=N&category=<slug> → category batch (slug drives contextual keywords)
 *   ?page=N&q=<term>        → search batch (ALWAYS ad-free; category+q → 400)
 *
 * The ITEMS reuse the existing Redis-cached read layer untouched (getFeed /
 * searchPage). The AD decisions are computed per request EXACTLY like the
 * pages do — getRequestAdPlan() runs the same resolveGeo(headers) →
 * readConsent(cookies) → profile-only-if-accepted chain, so consent → NPA and
 * keyword rules are byte-identical to SSR page 1. The route READS existing
 * cookies (nr_consent, nr_vid) and sets NONE (no Set-Cookie ever); the
 * response is `private, no-store` because the ad plan is per-visitor.
 *
 * Rate limit: 120 requests / 60 s / IP via redis rateLimit() — fail-open.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT = 120
const RATE_WINDOW_SEC = 60

/** The ad plan is per-visitor (geo + consent) — never shared-cacheable. */
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = parseFeedParams(request.nextUrl.searchParams)
  if (!params.ok) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400, headers: NO_STORE })
  }

  // Same client-IP extraction as geo.ts uses for the ad plan itself.
  const ip = normalizeIp(getClientIp(request.headers)) ?? 'unknown'
  const allowed = await rateLimit(rkey('rl', 'feed', ip), RATE_LIMIT, RATE_WINDOW_SEC)
  if (!allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } },
    )
  }

  // Search batches: paged windows over the existing search(), NO ads at any
  // depth (parity with the ad-free /cautare SSR page — §8.3).
  if (params.q !== undefined) {
    const feedPage = await searchPage(params.q, params.page)
    return NextResponse.json(
      buildFeedBatchResponse({ page: params.page, feedPage, adPlan: null }),
      {
        headers: NO_STORE,
      },
    )
  }

  const [feedPage, adPlan] = await Promise.all([
    getFeed({ page: params.page, categorySlug: params.category }),
    getRequestAdPlan(params.category),
  ])

  return NextResponse.json(buildFeedBatchResponse({ page: params.page, feedPage, adPlan }), {
    headers: NO_STORE,
  })
}
