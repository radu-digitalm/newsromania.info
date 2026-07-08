import { AdSlot } from '@/components/ads/AdSlot'
import { AmazonProductAd } from '@/components/ads/AmazonProductAd'
import { ArticleCard } from '@/components/articles/ArticleCard'
import { decisionFor, networkForOrdinal, type AdPlan } from '@/lib/ads/engine-core'
import { getMoreNews } from '@/lib/content'
import type { FeedItem } from '@/types/content'

/**
 * MoreNews — the article pages' „Mai multe știri” section (owner requirement
 * 4 + R5): FOUR standard cards — same category first (newest first), backfilled
 * with the latest items from other categories (read layer getMoreNews,
 * Redis-cached 60s) — laid out in the 3-column grid as TWO rows with two ad
 * boxes STAGGERED so they never line up in the same column (owner R5).
 *
 * Fixed 2-row layout (moreNewsCells) for the full 4-card + 2-ad section:
 *   row 1 → [card, card, AD]   (ad in the last / right cell)
 *   row 2 → [AD,   card, card] (ad in the first / left cell)
 * i.e. 6 cells with ads at grid indices 2 and 3 — adjacent in source order but
 * NOT vertically aligned in the 3-column grid. A short pool (fewer than 4
 * cards) degrades gracefully: cards first, ads never outnumber/replace content
 * and the section is never ad-only.
 *
 * Ad mechanics (owner v2.4 — 2 AdSense : 1 Amazon EVERYWHERE): each of the two
 * ad cells carries a 0-based ORDINAL continuing the article surface's sequence
 * (`adOrdinalStart` + the cell's adIndex — the below-body box is ordinal 0, so
 * these are 1 and 2). networkForOrdinal decides the network: ordinal 2 (the
 * second, row-2-left box) ⇒ AMAZON — the single geo-matched product via
 * AmazonProductAd (server-only; MoreNews is a server component); the other ⇒
 * AdSense through the standard <AdSlot variant="feed"> shell. Both keep the
 * „Publicitate” label + reserved height (zero CLS), honest by construction —
 * an unfilled AdSense box stays reserved-empty, an unresolved Amazon box
 * degrades to AdSense, NEVER fake content. `index` rotates configured AdSense
 * units deterministically.
 *
 * Structure: h2 „Mai multe știri” (section heading grammar of v2 §3.2),
 * cards as h3 under it, internal links + images + relative dates all via
 * ArticleCard (the fixed card contract).
 */

/** How many news cards the section renders (R5: 4 cards → two 3-col rows). */
export const MORE_NEWS_COUNT = 4

type MoreNewsCell = { kind: 'card'; cardIndex: number } | { kind: 'ad'; adIndex: number }

/**
 * Fixed staggered 2-row layout for the section (owner R5): with the full 4
 * cards it yields [card, card, AD, AD, card, card] — ads at grid indices 2 and
 * 3, so in the 3-column grid the row-1 ad sits right and the row-2 ad sits
 * left (never the same column). A short pool (fewer than 4 cards, rare
 * pre-seed) degrades to cards-only — the section is never ad-only and never
 * shows a lone card beside a big ad box. Pure + deterministic (unit-tested).
 */
export function moreNewsCells(cardCount: number): MoreNewsCell[] {
  if (cardCount < MORE_NEWS_COUNT) {
    return Array.from({ length: Math.max(0, cardCount) }, (_, i) => ({
      kind: 'card' as const,
      cardIndex: i,
    }))
  }
  return [
    { kind: 'card', cardIndex: 0 },
    { kind: 'card', cardIndex: 1 },
    { kind: 'ad', adIndex: 0 },
    { kind: 'ad', adIndex: 1 },
    { kind: 'card', cardIndex: 2 },
    { kind: 'card', cardIndex: 3 },
  ]
}

export async function MoreNews({
  article,
  adPlan,
  adOrdinalStart = 0,
}: {
  /** The article being read — excluded from the pool, drives the category. */
  article: FeedItem
  /** The page's per-request plan — the section reuses its 'feed' decision. */
  adPlan: AdPlan
  /**
   * 0-based ordinal of this section's FIRST ad cell across the article surface
   * (owner v2.4). The article page passes 1 (the below-body box is 0), so the
   * two cells are ordinals 1 and 2 → adsense, amazon.
   */
  adOrdinalStart?: number
}) {
  const items = await getMoreNews({
    excludeSlug: article.slug,
    categorySlug: article.category.slug,
    limit: MORE_NEWS_COUNT,
  })
  if (items.length === 0) return null

  // The 'feed' decision carries both the AdSense unit pool AND (v2.4) the
  // AmazonDecision used for an amazon-ordinal cell.
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
        {cells.map((cell) => {
          if (cell.kind !== 'ad') {
            return (
              <ArticleCard key={items[cell.cardIndex].id} item={items[cell.cardIndex]} as="h3" />
            )
          }
          // Ordinal continues the article surface's sequence — decides network.
          const ordinal = adOrdinalStart + cell.adIndex
          if (networkForOrdinal(ordinal) === 'amazon' && feedDecision?.amazon) {
            return (
              <AmazonProductAd
                key={`more-news-ad-${cell.adIndex}`}
                decision={feedDecision.amazon}
              />
            )
          }
          return (
            <AdSlot
              key={`more-news-ad-${cell.adIndex}`}
              variant="feed"
              decision={feedDecision}
              index={cell.adIndex}
            />
          )
        })}
      </div>
    </section>
  )
}
