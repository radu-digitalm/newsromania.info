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
}
