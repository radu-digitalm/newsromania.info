import { AdSlot } from '@/components/ads/AdSlot'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { decisionFor, type AdPlan } from '@/lib/ads/engine-core'
import { getMoreNews } from '@/lib/content'
import type { FeedItem } from '@/types/content'

/**
 * MoreNews — the article pages' „Mai multe știri” section (owner requirement
 * 4, superseding the v2 §3.5 ⑧ three-card block): SIX standard cards — same
 * category first (newest first), backfilled with the latest items from other
 * categories (read layer getMoreNews, Redis-cached 60s) — with EXACTLY ONE
 * card randomly replaced by an in-feed ad block.
 *
 * Ad mechanics:
 * - The ad renders the page's existing 'feed' placement decision
 *   (decisionFor(adPlan, 'feed')) through the standard <AdSlot variant="feed">
 *   shell: „Publicitate” label + reserved height (zero CLS), honest by
 *   construction — while site-config has no feed unit (or the plan carries no
 *   feed decision at all) the box stays reserved-empty, NEVER fake content.
 * - The replaced position comes from pickAdIndex(count, rng) — rng is
 *   injectable for tests and defaults to Math.random. The section is rendered
 *   per request on the force-dynamic article pages, so the position varies
 *   per view. The ITEMS come from the 60s cache; the ad choice is computed
 *   after the cache read and is never cached.
 *
 * Structure: h2 „Mai multe știri” (section heading grammar of v2 §3.2),
 * cards as h3 under it, internal links + images + relative dates all via
 * ArticleCard (the fixed card contract).
 */

/** How many tiles (cards + the one ad) the section renders. */
export const MORE_NEWS_COUNT = 6

/**
 * Pure picker for the replaced tile: floor(rng() * count) clamped into
 * [0, count-1], so ANY rng() output — including out-of-range or NaN garbage —
 * still lands on a valid tile and the section carries exactly one ad.
 *
 * Returns -1 (no replacement) when count < 2: a „Mai multe știri” section
 * must always contain at least one real news card — replacing a lone card
 * would leave an ad-only „news” section, which the honest-ads contract
 * (design direction v2 §4.4) forbids.
 */
export function pickAdIndex(count: number, rng: () => number = Math.random): number {
  if (!Number.isFinite(count) || count < 2) return -1
  const tiles = Math.floor(count)
  const raw = Math.floor(rng() * tiles)
  if (!Number.isFinite(raw)) return 0
  return Math.min(Math.max(raw, 0), tiles - 1)
}

export async function MoreNews({
  article,
  adPlan,
  rng = Math.random,
}: {
  /** The article being read — excluded from the pool, drives the category. */
  article: FeedItem
  /** The page's per-request plan — the section reuses its 'feed' decision. */
  adPlan: AdPlan
  /** Injectable randomness (tests); production keeps Math.random. */
  rng?: () => number
}) {
  const items = await getMoreNews({
    excludeSlug: article.slug,
    categorySlug: article.category.slug,
    limit: MORE_NEWS_COUNT,
  })
  if (items.length === 0) return null

  const adIndex = pickAdIndex(items.length, rng)
  const feedDecision = decisionFor(adPlan, 'feed')

  return (
    <section aria-labelledby="mai-multe-stiri" className="mx-auto mt-10 w-full max-w-[1280px]">
      <h2
        id="mai-multe-stiri"
        className="flex items-center gap-2.5 font-serif text-[22px] font-bold leading-7 tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]"
      >
        <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-[2px] bg-brand-red" />
        Mai multe știri
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {items.map((item, index) =>
          index === adIndex ? (
            // The one ad tile — replaces (never joins) the card at this
            // position; grid cells stretch, so the reserved shell fills the
            // row height next to its card siblings.
            <AdSlot key="more-news-ad" variant="feed" decision={feedDecision} />
          ) : (
            <ArticleCard key={item.id} item={item} as="h3" />
          ),
        )}
      </div>
    </section>
  )
}
