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

export interface AmazonProduct {
  asin: string
  title: string
  /** Detail-page URL carrying the Associates partnerTag (`tag=` param). */
  url: string
  image?: AmazonProductImage
  /** Localized display price, e.g. "449,00 €" (offersV2 buy-box listing). */
  price?: string
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
