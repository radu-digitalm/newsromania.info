import type { AmazonDecision } from '@/lib/ads/engine-core'

import { AmazonProductAd } from './AmazonProductAd'

/**
 * ArticleSideRail — the /stiri/<slug> desktop sidebar (owner fix round: "add a
 * sidebar ad on the post page, prioritise amazon").
 *
 * A sticky, desktop-only (lg+) 300px column beside the reading article that
 * shows a STACK of 2–3 Amazon product cards — the article page's Amazon
 * surface (the post page had NO sidebar ad before, only a top leaderboard + one
 * end-of-article box). Amazon-PRIORITISED per the owner: it renders
 * AmazonProductAd directly (server-only; the article page is a server
 * component), so each card resolves the live Creators-API product first and
 * falls back to the geo-matched house bestseller.
 *
 * Each card gets a DISTINCT `variant` (owner fix round) into the
 * personalized-ordered marketplace set, so the 2–3 cards show DIFFERENT
 * products, and — because their variants continue past the article-end box's
 * ordinal — differ from the below-body Amazon box and the „Mai multe știri”
 * cell too. No two Amazon slots on the article page repeat.
 *
 * - **Desktop only:** the whole column is `hidden lg:block`. Below lg the page
 *   is single-column (the article already carries the top banner + end box +
 *   „Mai multe știri”), so mobile is unchanged — the sidebar never covers text.
 * - **Sticky:** `top-[72px]` clears the pinned chip nav (Header v2 §3.2) + a
 *   16px gap; the stack stays in view while the long article scrolls.
 * - Reuses AmazonProductCard's labelled „Publicitate" box + Associate
 *   disclosure + rel="sponsored noopener nofollow" (compliance unchanged).
 */

/** How many stacked product cards the sidebar shows (owner: 2–3). */
export const ARTICLE_RAIL_PRODUCT_COUNT = 3

export function ArticleSideRail({
  decision,
  count = ARTICLE_RAIL_PRODUCT_COUNT,
  startVariant = 0,
}: {
  /** The article's Amazon decision (keywords/marketplace/tag/preferredCategories). */
  decision?: AmazonDecision
  /** Number of stacked cards (owner: 2–3). */
  count?: number
  /**
   * First house-set rotation variant for the stack; each card uses
   * startVariant + i so the cards differ from each other AND from the other
   * Amazon surfaces on the page (article-end / MoreNews). Ignored on the live
   * Creators-API path.
   */
  startVariant?: number
}) {
  // No Amazon decision (no partnerTag for the marketplace) ⇒ no sidebar. The
  // article keeps its top banner + end box; we never reserve an empty rail.
  if (!decision) return null
  const n = Math.max(1, Math.floor(count))

  return (
    <aside
      aria-label="Publicitate"
      data-testid="article-side-rail"
      className="hidden w-[300px] shrink-0 lg:block"
    >
      <div className="sticky top-[72px] flex flex-col gap-4">
        {Array.from({ length: n }, (_, i) => (
          <AmazonProductAd key={i} decision={decision} variant={startVariant + i} />
        ))}
      </div>
    </aside>
  )
}
