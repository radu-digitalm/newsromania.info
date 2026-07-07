import Link from 'next/link'

import { AdSlot } from '@/components/ads/AdSlot'
import { SideRailAd } from '@/components/ads/SideRailAd'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { FeedList } from '@/components/articles/FeedList'
import { FeedStream } from '@/components/articles/FeedStream'
import { Pagination } from '@/components/articles/NextPageLink'
import { PostCard } from '@/components/articles/PostCard'
import { decisionFor, feedAdPositions } from '@/lib/ads/engine'
import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { getFeaturedArticle, getFeed } from '@/lib/content'
import type { FeedItem } from '@/types/content'

/**
 * Home — v2.1 „Flux Social” (design direction §8.3): a centered single-column
 * post stream (max-w-2xl) on the dimmed canvas. v2.2: at lg+ a 300px sticky
 * rail ad column (SideRailAd) sits beside the stream — the feed column +
 * rail are centered together as a pair; below lg nothing changes (no
 * sidebar). Top → bottom on page 1: featured post
 * (§8.5c) → leaderboard AdSlot → „Ultimele știri” section head → PostCard
 * stream with SSR in-feed ad-posts at engine positions → „Cele mai citite”
 * strip-post after content post 6 → FeedStream (client, pages ≥2) with the
 * no-JS rel="next" fallback + a <noscript> classic pagination block.
 *
 * ?page=N (N≥2) renders the CLASSIC server page (§8.3/§8.11): same
 * single-column stream, v2 §4.5 Pagination pills, NO FeedStream — the
 * crawler / no-JS / deep-link surface. Page 1 stays fully SSR with identical
 * data either way.
 *
 * Content comes from Payload via src/lib/content.ts (Redis-cached 60s);
 * ad decisions are per-request (geo → consent → profile), so the route
 * renders dynamically.
 */

export const dynamic = 'force-dynamic'

/**
 * Section head (§3.3.3): inline 4×20px rounded red bar + heading. Same visual
 * recipe at every level; `as` keeps the document outline honest — the
 * mid-stream „Cele mai citite” head is h3 (post level) so the h3 posts that
 * follow it stay under „Ultimele știri”, not nested inside the interlude.
 */
function SectionHead({
  id,
  title,
  className,
  as: Heading = 'h2',
}: {
  id: string
  title: string
  className?: string
  as?: 'h2' | 'h3'
}) {
  return (
    <Heading
      id={id}
      className={`flex items-center gap-2.5 font-serif text-[22px] font-bold leading-7 tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px] ${className ?? ''}`}
    >
      <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-[2px] bg-brand-red" />
      {title}
    </Heading>
  )
}

/**
 * „Cele mai citite” strip-post (§8.3.5) — a surface post-shaped card inside
 * the stream (same radius/border rules as §8.2), list-tier items as a
 * horizontal scroll-snap row with hidden scrollbars and the chip-nav 24px
 * right fade. Home page 1 only, never in client batches, never on ?page≥2.
 */
function MostReadStrip({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null
  return (
    <section
      aria-labelledby="cele-mai-citite"
      className="border-y border-border bg-surface p-4 sm:rounded-[16px] sm:border sm:p-5"
    >
      {/* h3 + h4 items: the interlude sits mid-stream between h3 posts, so an
          h2 here would swallow posts 7–10 into its outline section (WCAG). */}
      <SectionHead id="cele-mai-citite" title="Cele mai citite" as="h3" />
      <ul className="mt-4 flex snap-x gap-4 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_calc(100%-24px),transparent)] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <li key={item.id} className="min-w-[240px] shrink-0 snap-start">
            <ArticleCard item={item} variant="list" as="h4" rank={index + 1} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Friendly pre-seed empty state — the feed can legitimately be empty. */
function EmptyFeed() {
  return (
    <div className="mx-4 mt-10 rounded-[16px] border border-border bg-surface px-6 py-12 text-center sm:mx-0">
      <p className="font-serif text-xl font-bold leading-7 text-ink">
        Încă nu am publicat nicio știre.
      </p>
      <p className="mt-2 font-sans text-[15px] leading-[22px] text-ink-secondary">
        Pregătim primele articole chiar acum — revino în curând.
      </p>
      <p className="mt-4">
        <Link
          href="/despre-noi"
          className="inline-block py-3 font-sans text-[15px] font-semibold leading-5 text-link transition-colors hover:text-link-hover"
        >
          Despre NewsRomania →
        </Link>
      </p>
    </div>
  )
}

interface HomePageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { page: pageParam } = await searchParams
  const parsed = Number.parseInt(pageParam ?? '1', 10)
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed
  const isFirstPage = page === 1

  const [feed, adPlan, featured] = await Promise.all([
    getFeed({ page }),
    // Per-request ad decisions (architecture.md §4): geo + consent + profile.
    // No category on the homepage — keywords stay profile/consent-driven only.
    getRequestAdPlan(),
    // Featured slot logic unchanged from v2 (§8.3.1): newest PUBLISHED
    // original, falling back to the newest feed item. Page 1 only.
    isFirstPage ? getFeaturedArticle() : Promise.resolve(null),
  ])

  // Featured post = first card of the stream; deduped from the rest by id.
  const featuredItem: FeedItem | null = isFirstPage ? (featured ?? feed.items[0] ?? null) : null
  const streamItems = featuredItem
    ? feed.items.filter((item) => item.id !== featuredItem.id)
    : feed.items

  // Stand-in for read counts (analytics arrive at a later step): the
  // deterministic non-hero slice 6–10, unchanged from v2 (§8.3.5).
  const mostRead = streamItems.slice(5, 10)

  // Ordinal handoff for the deterministic AdSense unit rotation (§8.6): page 1
  // renders feed-ad ordinals 0…k−1; client batches continue from k.
  const adOrdinalStart = feedAdPositions(adPlan.everyNth, streamItems.length).size

  return (
    <div className="min-h-full bg-canvas-dim">
      {/* v2.2 pair container: identical to the lone max-w-2xl column below lg;
          at lg+ it widens to fit feed (672px) + 300px rail, centered together. */}
      <div className="mx-auto flex w-full max-w-2xl justify-center lg:max-w-[972px]">
        <div className="w-full min-w-0 max-w-2xl px-0 pb-16 pt-4 sm:px-4 md:px-6 md:pt-6">
          <h1 className="sr-only">NewsRomania — știri din România, la zi</h1>

          {isFirstPage && !featuredItem && streamItems.length === 0 ? (
            <EmptyFeed />
          ) : (
            <>
              {/* Featured post — the „hero” of the single-column world (§8.5c). */}
              {featuredItem && <PostCard item={featuredItem} variant="featured" as="h2" />}

              {/* Leaderboard — full column width, reserved heights unchanged (§4.4). */}
              <AdSlot variant="leaderboard" decision={decisionFor(adPlan, 'leaderboard')} />

              {/* 8px inline padding <640px — must not touch the screen edge
                between full-bleed cards (§8.3.3). */}
              <div className="mb-4">
                <SectionHead id="ultimele-stiri" title="Ultimele știri" className="px-2 sm:px-0" />
              </div>

              {/* Post stream — SSR ad-posts at engine positions; the „Cele mai
                citite” strip-post lands after content post 6, page 1 only. */}
              <FeedList
                items={streamItems}
                adPlan={adPlan}
                headingAs="h3"
                interludeAfter={isFirstPage ? 6 : undefined}
                interlude={isFirstPage ? <MostReadStrip items={mostRead} /> : undefined}
              />

              {isFirstPage ? (
                <>
                  {/* Client stream for pages ≥2 — its SSR paint is the REAL
                    rel="next" pill, so no-JS visitors keep paging (§8.7/§8.11). */}
                  <FeedStream
                    startPage={2}
                    params={{}}
                    initialHasMore={feed.hasNextPage}
                    adOrdinalStart={adOrdinalStart}
                    headingAs="h3"
                    withAds
                  />
                  {/* Belt and braces (§8.11): classic pagination for noscript
                    visitors; inert when JS is enabled. */}
                  {feed.hasNextPage && (
                    <noscript>
                      <Pagination page={1} hasNextPage hrefFor={(n) => `/?page=${n}`} />
                    </noscript>
                  )}
                </>
              ) : (
                <Pagination
                  page={page}
                  hasNextPage={feed.hasNextPage}
                  hrefFor={(n) => `/?page=${n}`}
                />
              )}
            </>
          )}
        </div>

        {/* v2.2 desktop rail — sticky 300px ad column, lg+ only; hidden ⇒
            never pushed (visibility guard in both push paths). */}
        <SideRailAd decision={decisionFor(adPlan, 'rail')} />
      </div>
    </div>
  )
}
