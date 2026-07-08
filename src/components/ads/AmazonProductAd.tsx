import { resolveAmazonProduct } from '@/lib/ads/amazon'
import type { AmazonDecision } from '@/lib/ads/engine-core'

import { AmazonEmptyBox, AmazonProductCard, type AmazonAdLayout } from './AmazonProductCard'

/**
 * AmazonProductAd — the SERVER wrapper that resolves ONE real Amazon product
 * for an engine AmazonDecision ({ keywords, marketplace, partnerTag } —
 * architecture.md §4) and renders it through the client-safe AmazonProductCard,
 * so SSR page 1 and the client scroll batches produce byte-identical markup.
 *
 * The product resolves server-side via resolveAmazonProduct() — the single
 * source of truth shared with the /api/feed batch serializer:
 *   1. the live Creators API product (Redis-cached 24h, stale-while-error,
 *      800ms budget — never a per-view API call), then
 *   2. while the live API is gated on sales-eligibility (AssociateNotEligible)
 *      it returns nothing, so the box falls back to the marketplace-correct
 *      SiteStripe HOUSE bestseller — a REAL affiliate product with the correct
 *      per-market tag, rendered in PRODUCTION now (owner v2.4), gated ONLY by
 *      AMAZON_HOUSE_ADS (default on), NOT tied to AD_PREVIEW; and finally
 *   3. no product ⇒ the reserved „Publicitate" treatment (AmazonEmptyBox).
 * The live API's products replace the house set automatically once eligible.
 *
 * Owner R2 (one product per box), R6 (geo-correct: the house fallback set is
 * picked by decision.marketplace, so ?geo=fr → amazon.fr / newsromaniafr-21).
 * Compliance (label, rel=sponsored, disclosure, lazy <img>) lives in
 * AmazonProductCard. `layout`: 'card' rectangle (feed/article/rail) or 'banner'
 * wide 1-product row (leaderboard).
 */

export type { AmazonAdLayout }

export async function AmazonProductAd({
  decision,
  layout = 'card',
  variant = 0,
}: {
  decision: AmazonDecision
  layout?: AmazonAdLayout
  /**
   * House-set rotation index (owner fix round). Every single-slot Amazon surface
   * on a page passes a DISTINCT variant so no two show the same product: the
   * sticky rail, the article-end box, and each „Mai multe știri” Amazon cell get
   * a different index into the (personalized-ordered) marketplace set. Omitted ⇒
   * 0 (first product). Ignored on the live Creators-API path.
   */
  variant?: number
}) {
  // Live API product, then the always-on marketplace-correct house bestseller
  // (AMAZON_HOUSE_ADS) — one resolution path shared with the /api/feed batch.
  // `variant` spreads single-slot surfaces across the set so they never repeat.
  const product = await resolveAmazonProduct(decision, variant)
  if (!product) return <AmazonEmptyBox layout={layout} />
  return <AmazonProductCard product={product} layout={layout} />
}
