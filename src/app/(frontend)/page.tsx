import { ArticleCard, ArticleTitleLink } from '@/components/articles/ArticleCard'
import { FeedList } from '@/components/articles/FeedList'
import { formatFeedDate } from '@/components/articles/format-date'
import { getFeaturedArticle, mockFeed } from '@/lib/mock-data'
import type { FeedItem } from '@/types/content'

/**
 * Home — „Broadsheet Tricolor" (design direction §3.3): hero band (featured
 * original + „Cele mai noi" rail), section rule, then the chronological feed
 * with in-feed ad slots.
 */

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

export default function HomePage() {
  const featured = getFeaturedArticle()
  const rest = mockFeed.filter((item) => item.id !== featured.id)
  const railItems = rest.slice(0, 5)

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
      <h1 className="sr-only">NewsRomania — știri din România, la zi</h1>

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-8">
          <ArticleCard item={featured} variant="featured" as="h2" />
        </div>
        <div className="lg:col-span-4">
          <LatestRail items={railItems} />
        </div>
      </div>

      <SectionRule title="Ultimele știri" />
      {/* AdSlot injected after every 4th row — default frequency, configurable later per region (PROJECT_BRIEF 6.2). */}
      <FeedList items={rest} withAds headingAs="h3" />
    </div>
  )
}
