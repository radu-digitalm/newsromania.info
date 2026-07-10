/**
 * Amazon product wire types — the CLIENT-BUNDLE-SAFE data contract (owner
 * v2.4). Split out of amazon.ts (which is server-only: node:crypto + Redis +
 * the vendored SDK) so the client feed graph can import the SHAPE without
 * dragging any server code into the bundle: /api/feed serializes exactly this
 * into each batch, and the client AmazonProductCard renders from it.
 *
 * amazon.ts re-exports these, so its server-facing API is unchanged.
 */

export interface AmazonProductImage {
  url: string
  width: number
  height: number
}

/**
 * Price / savings / promotion — the fields Amazon regulates.
 *
 * ⚠️ COMPLIANCE (owner, iulie 2026). The Associates Operating Agreement and the
 * PA-API licence allow displaying price, savings, discount and deal information
 * ONLY when it was obtained from the Product Advertising API AND is refreshed at
 * least every 24 hours. Otherwise it must not be shown at all.
 *
 * That rule is enforced STRUCTURALLY here rather than by a flag someone can
 * forget: pricing is its own optional object, populated in exactly one place
 * (mapItems(), straight off a live PA-API response), and removed by
 * stripPricing() everywhere the ≤24h guarantee cannot hold:
 *   - the static house catalog (harvested once, never refreshed) → never has it;
 *   - the ≤7-day stale-while-error cache → stripped on serve;
 *   - the daily catalog snapshot → stripped once it ages past 24h.
 * A product without `pricing` gives AmazonProductCard nothing to render, so a
 * stale price cannot reach the page even if a future caller forgets the rule.
 */
export interface AmazonPricing {
  /** Buy-box display price, e.g. "449,00 €" (offersV2.listings[0].price.money). */
  price: string
  /** Discount vs `was`: display amount + optional percentage, e.g. "12,00 €" / 21. */
  savings?: { display: string; percentage?: number }
  /** Reference ("was") price + its marketplace label, e.g. "59,99 €" / "Preț recomandat". */
  was?: { display: string; label?: string }
  /** Deal badge, verbatim from offersV2.listings[0].dealDetails.badge. */
  dealBadge?: string
}

export interface AmazonProduct {
  asin: string
  title: string
  /** Detail-page URL carrying the Associates partnerTag (`tag=` param). */
  url: string
  image?: AmazonProductImage
  /**
   * Present ONLY on PA-API data fetched within the last 24h — see AmazonPricing.
   * Absent ⇒ the card renders title + image + CTA and no pricing whatsoever.
   */
  pricing?: AmazonPricing
  /**
   * House-catalog product department, verbatim from the marketplace (e.g.
   * "High-Tech", "Kamera & Foto", "Health & Personal Care"). Used ONLY by the
   * house-fallback selector to bias which product a slot shows toward the
   * visitor's CDP top-interest / the page category (owner: products chosen "based
   * on cookies + content"). Absent on live Creators-API products (the API already
   * returns a contextual product) and irrelevant to rendering.
   */
  category?: string
  /** House-catalog flag: a marketplace best-seller (owner: bias toward bestsellers). */
  bestseller?: boolean
}

/**
 * Drop `pricing` from every product — the single enforcement point for the 24h
 * rule above. Pure: returns new objects, never mutates the input.
 */
export function stripPricing<T extends AmazonProduct>(products: readonly T[]): T[] {
  return products.map((product) => {
    if (!product.pricing) return product
    const copy = { ...product }
    delete copy.pricing
    return copy
  })
}
