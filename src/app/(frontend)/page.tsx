import Link from 'next/link'

import { AdSlot } from '@/components/ads/AdSlot'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { FeedList } from '@/components/articles/FeedList'
import { Pagination } from '@/components/articles/NextPageLink'
import { decisionFor } from '@/lib/ads/engine'
import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { getFeaturedArticle, getFeed } from '@/lib/content'
import type { FeedItem } from '@/types/content'

/**
 * Home — „Prim-Plan Tricolor” (design direction v2 §3.3): hero band
 * (featured overlay card + two secondary overlay cards), responsive top
 * banner AdSlot, „Ultimele știri” section head, then ONE full-width card
 * grid with in-feed ad cards — no rail, no 8+4 split (owner requirement 1) —
 * followed by the full-width „Cele mai citite” band and server-side
 * pagination.
 *
 * Content comes from Payload via src/lib/content.ts (Redis-cached 60s);
 * ad decisions are per-request, so the route renders dynamically.
 */

export const dynamic = 'force-dynamic'

/** Section head (§3.3.3): inline 4×20px rounded red bar + h2. */
function SectionHead({ id, title }: { id: string; title: string }) {
  return (
    <h2
      id={id}
      className="flex items-center gap-2.5 font-serif text-[22px] font-bold leading-7 tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]"
    >
      <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-[2px] bg-brand-red" />
      {title}
    </h2>
  )
}

/** „Cele mai citite” band (§3.3.5): full-width surface panel, 5 list-tier items. */
function MostReadBand({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null
  return (
    <section
      aria-labelledby="cele-mai-citite"
      className="mt-10 rounded-[16px] border border-border bg-surface p-5 md:p-6"
    >
      <SectionHead id="cele-mai-citite" title="Cele mai citite" />
      <ul className="mt-5 flex snap-x gap-4 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-5 lg:gap-6 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <li key={item.id} className="min-w-[240px] shrink-0 snap-start lg:min-w-0">
            <ArticleCard item={item} variant="list" as="h3" rank={index + 1} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Friendly pre-seed empty state — the feed can legitimately be empty. */
function EmptyFeed() {
  return (
    <div className="mt-10 rounded-[16px] border border-border bg-surface px-6 py-12 text-center">
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

  const [featured, feed, firstPage, adPlan] = await Promise.all([
    getFeaturedArticle(),
    getFeed({ page }),
    // The hero band + „Cele mai citite” always reflect the newest items,
    // regardless of ?page=.
    getFeed({ page: 1 }),
    // Per-request ad decisions (architecture.md §4): geo + consent + profile.
    // No category on the homepage — keywords stay profile/consent-driven only.
    getRequestAdPlan(),
  ])

  // Hero slots (§3.3.1): slot 1 prefers the latest original article; slots
  // 2–3 prefer the freshest items with a REAL photo (owner point 5 — the
  // image-led hero must not open on branded placeholders), falling back to
  // freshest-only when nothing on page 1 has one. Nothing in the hero
  // repeats below it.
  const hasRealPhoto = (item: FeedItem) =>
    Boolean(item.image && !item.image.url.startsWith('/placeholders/'))
  const newest = featured
    ? firstPage.items.filter((item) => item.id !== featured.id)
    : firstPage.items
  const heroLead = featured ?? newest[0] ?? null
  const heroPool = newest.filter((item) => item.id !== heroLead?.id)
  const secondaries = [
    ...heroPool.filter(hasRealPhoto),
    ...heroPool.filter((item) => !hasRealPhoto(item)),
  ].slice(0, 2)
  const heroIds = new Set([heroLead?.id, ...secondaries.map((item) => item.id)])

  const pageItems = feed.items.filter((item) => !heroIds.has(item.id))
  const nonHero = newest.filter((item) => !heroIds.has(item.id))
  // Stand-in for read counts (analytics arrive at a later step): a
  // deterministic pick that doesn't duplicate the top of the main grid.
  const mostRead = nonHero.slice(5, 10)

  if (!heroLead && pageItems.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 md:px-6 xl:px-8">
        <h1 className="sr-only">NewsRomania — știri din România, la zi</h1>
        <EmptyFeed />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 md:px-6 xl:px-8">
      <h1 className="sr-only">NewsRomania — știri din România, la zi</h1>

      {/* Hero band (§3.3.1): featured 2fr×2 rows + two stacked secondaries. */}
      {heroLead && (
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[repeat(2,minmax(0,1fr))]">
          <div className="md:col-span-2 lg:col-span-1 lg:row-span-2">
            <ArticleCard item={heroLead} variant="featured" as="h2" />
          </div>
          {secondaries.map((item) => (
            <div key={item.id} className="min-h-0">
              <ArticleCard item={item} variant="secondary" as="h2" />
            </div>
          ))}
        </div>
      )}

      {/* Responsive top banner — once, between hero band and main grid (§3.3.2). */}
      <AdSlot variant="leaderboard" decision={decisionFor(adPlan, 'leaderboard')} />

      <div className="mb-4 mt-8">
        <SectionHead id="ultimele-stiri" title="Ultimele știri" />
      </div>

      {/* Main card grid — full width, in-feed ad cards at region-frequency
          positions (everyNth from the ad plan), decided server-side (§3.3.4). */}
      <FeedList items={pageItems} adPlan={adPlan} headingAs="h3" />

      <MostReadBand items={mostRead} />

      <Pagination page={page} hasNextPage={feed.hasNextPage} hrefFor={(n) => `/?page=${n}`} />
    </div>
  )
}
