import Link from 'next/link'

import { AdSlot } from '@/components/ads/AdSlot'
import { ArticleCard, ArticleTitleLink } from '@/components/articles/ArticleCard'
import { FeedList } from '@/components/articles/FeedList'
import { NextPageLink } from '@/components/articles/NextPageLink'
import { formatFeedDate } from '@/components/articles/format-date'
import { getFeaturedArticle, getFeed } from '@/lib/content'
import type { FeedItem } from '@/types/content'

/**
 * Home — „Broadsheet Tricolor" (design direction §3.3): hero band (featured
 * original + „Cele mai noi" rail), leaderboard AdSlot, section rule, then the
 * 8+4 content/rail split — chronological feed with fixed in-feed ad slots on
 * the left, rail AdSlot + sticky „Cele mai citite" list on the right — and
 * server-side pagination.
 *
 * Content comes from Payload via src/lib/content.ts (Redis-cached 60s);
 * ad decisions become per-request later, so the route renders dynamically.
 */

export const dynamic = 'force-dynamic'

/** Full-width ink rule with the 48×3px red segment flush left (§3.3.2). */
function SectionRule({ title }: { title: string }) {
  return (
    <div className="mt-10">
      <div className="relative h-px bg-ink">
        <span aria-hidden="true" className="absolute left-0 top-0 h-[3px] w-12 bg-brand-red" />
      </div>
      <h2 className="mt-3 font-serif text-[21px] font-bold leading-[27px] text-ink md:text-[26px] md:leading-[33px]">
        {title}
      </h2>
    </div>
  )
}

/** „Cele mai noi" rail — compact, image-free, hairline-divided (§3.3.1). */
function LatestRail({ items }: { items: FeedItem[] }) {
  return (
    <section aria-labelledby="cele-mai-noi">
      <h2
        id="cele-mai-noi"
        className="border-b-2 border-ink pb-2 font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-ink"
      >
        Cele mai noi
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-border py-3 last:border-b-0">
            <h3 className="font-serif text-base font-semibold leading-[21px] text-ink md:text-[17px] md:leading-[23px]">
              <ArticleTitleLink
                item={item}
                className="decoration-link decoration-2 underline-offset-[3px] transition-colors hover:underline"
              />
            </h3>
            <p className="mt-1 font-sans text-[13px] leading-[18px] text-ink-muted">
              <time dateTime={item.publishedAt}>{formatFeedDate(item.publishedAt)}</time>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** „Cele mai citite" numbered rail list (§3.3.4): 5 × h4 token, serif red ordinals. */
function MostReadRail({ items }: { items: FeedItem[] }) {
  return (
    <section aria-labelledby="cele-mai-citite">
      <h2
        id="cele-mai-citite"
        className="border-b-2 border-ink pb-2 font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-ink"
      >
        Cele mai citite
      </h2>
      <ol>
        {items.map((item, index) => (
          <li key={item.id} className="flex gap-3 border-b border-border py-3 last:border-b-0">
            <span
              aria-hidden="true"
              className="w-5 shrink-0 font-serif text-xl font-bold leading-[23px] text-red-text"
            >
              {index + 1}
            </span>
            <h3 className="font-serif text-base font-semibold leading-[21px] text-ink md:text-[17px] md:leading-[23px]">
              <ArticleTitleLink
                item={item}
                className="decoration-link decoration-2 underline-offset-[3px] transition-colors hover:underline"
              />
            </h3>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Friendly pre-seed empty state — the feed can legitimately be empty. */
function EmptyFeed() {
  return (
    <div className="mt-10 rounded-[2px] border border-border bg-surface px-6 py-12 text-center">
      <p className="font-serif text-xl font-semibold leading-7 text-ink">
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

  const [featured, feed, firstPage] = await Promise.all([
    getFeaturedArticle(),
    getFeed({ page }),
    // Rails always reflect the newest items, regardless of ?page= (as before).
    getFeed({ page: 1 }),
  ])

  // The hero never repeats in the lists below it.
  const excludeFeatured = (items: FeedItem[]) =>
    featured ? items.filter((item) => item.id !== featured.id) : items

  const newest = excludeFeatured(firstPage.items)
  const railItems = newest.slice(0, 5)
  // Stand-in for read counts (analytics arrive at a later step): a
  // deterministic pick that doesn't duplicate the „Cele mai noi" rail.
  const mostRead = newest.slice(5, 10)

  const pageItems = excludeFeatured(feed.items)
  const hasNextPage = feed.hasNextPage

  if (!featured && pageItems.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
        <h1 className="sr-only">NewsRomania — știri din România, la zi</h1>
        <EmptyFeed />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
      <h1 className="sr-only">NewsRomania — știri din România, la zi</h1>

      {/* Hero band — 7/5 split on tablets, 8/4 on desktop (§3.1, §3.3.1). */}
      {featured && (
        <div className="grid gap-10 md:grid-cols-12 md:gap-6">
          <div className="md:col-span-7 lg:col-span-8">
            <ArticleCard item={featured} variant="featured" as="h2" />
          </div>
          <div className="md:col-span-5 lg:col-span-4">
            <LatestRail items={railItems} />
          </div>
        </div>
      )}

      {/* Leaderboard — desktop only, once, between hero band and main feed (§3.3.6). */}
      <AdSlot variant="leaderboard" />

      <SectionRule title="Ultimele știri" />

      {/* Main feed + rail — 8+4 split ≥1024px, 7/5 on tablets (§3.3.3–4). */}
      <div className="grid gap-10 md:grid-cols-12 md:gap-6">
        <div className="md:col-span-7 lg:col-span-8">
          {/* In-feed AdSlots at the fixed positions: after rows 4 and 12 (§3.3.3). */}
          <FeedList items={pageItems} withAds headingAs="h3" />
          {hasNextPage && <NextPageLink href={`/?page=${page + 1}`} />}
        </div>
        <aside className="md:col-span-5 lg:col-span-4">
          <AdSlot variant="rail" />
          {/* Only the list block is sticky — never the ad (§3.3.4). */}
          <div className="lg:sticky lg:top-16">
            <MostReadRail items={mostRead} />
          </div>
        </aside>
      </div>
    </div>
  )
}
