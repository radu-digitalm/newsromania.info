import { AdSlot } from '@/components/ads/AdSlot'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { decisionFor, type AdPlan } from '@/lib/ads/engine-core'
import { getMoreNews } from '@/lib/content'
import type { FeedItem } from '@/types/content'

/**
 * MoreNews — the article pages' „Mai multe știri” section (owner requirement
 * 4): SIX standard cards — same category first (newest first), backfilled with
 * the latest items from other categories (read layer getMoreNews, Redis-cached
 * 60s) — laid out in the 3-column grid with ONE ad block per desktop row
 * (owner request: „related news should have 1 ad block on each row”).
 *
 * Ad mechanics:
 * - An ad cell is inserted after every 2 cards, so each 3-column desktop row
 *   reads [card, card, ad] — exactly one ad per row (moreNewsCells()).
 * - Each ad renders the page's 'feed' placement decision
 *   (decisionFor(adPlan, 'feed')) through the standard <AdSlot variant="feed">
 *   shell: „Publicitate” label + reserved height (zero CLS), honest by
 *   construction — while site-config has no feed unit the box stays
 *   reserved-empty (or a labelled demo box under NEXT_PUBLIC_AD_PREVIEW),
 *   NEVER fake content. `index` rotates configured units deterministically.
 *
 * Structure: h2 „Mai multe știri” (section heading grammar of v2 §3.2),
 * cards as h3 under it, internal links + images + relative dates all via
 * ArticleCard (the fixed card contract).
 */

/** How many news cards the section renders (ads are inserted between them). */
export const MORE_NEWS_COUNT = 6

/** One ad after every N cards — N=2 puts one ad at the end of each 3-col row. */
export const MORE_NEWS_AD_EVERY = 2

type MoreNewsCell = { kind: 'card'; cardIndex: number } | { kind: 'ad'; adIndex: number }

/**
 * Interleave cards and ad cells: after every MORE_NEWS_AD_EVERY cards, emit an
 * ad. With 6 cards this yields card,card,ad ×3 → in a 3-column grid, one ad as
 * the last cell of each row. Pure + deterministic (unit-tested).
 */
export function moreNewsCells(cardCount: number): MoreNewsCell[] {
  const cells: MoreNewsCell[] = []
  let adIndex = 0
  for (let i = 0; i < cardCount; i++) {
    cells.push({ kind: 'card', cardIndex: i })
    if ((i + 1) % MORE_NEWS_AD_EVERY === 0) cells.push({ kind: 'ad', adIndex: adIndex++ })
  }
  return cells
}

export async function MoreNews({
  article,
  adPlan,
}: {
  /** The article being read — excluded from the pool, drives the category. */
  article: FeedItem
  /** The page's per-request plan — the section reuses its 'feed' decision. */
  adPlan: AdPlan
}) {
  const items = await getMoreNews({
    excludeSlug: article.slug,
    categorySlug: article.category.slug,
    limit: MORE_NEWS_COUNT,
  })
  if (items.length === 0) return null

  const feedDecision = decisionFor(adPlan, 'feed')
  const cells = moreNewsCells(items.length)

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
        {cells.map((cell) =>
          cell.kind === 'ad' ? (
            <AdSlot
              key={`more-news-ad-${cell.adIndex}`}
              variant="feed"
              decision={feedDecision}
              index={cell.adIndex}
            />
          ) : (
            <ArticleCard key={items[cell.cardIndex].id} item={items[cell.cardIndex]} as="h3" />
          ),
        )}
      </div>
    </section>
  )
}
