import type { AmazonDecision } from '@/lib/ads/engine-core'
import { searchProductsWithTimeout, type AmazonProduct } from '@/lib/ads/amazon'
import { houseProductsForMarketplace } from '@/lib/ads/house-amazon-products'
import { AD_PREVIEW } from '@/lib/ads/preview'

/**
 * AmazonProductAd — server component rendering exactly ONE real Amazon product
 * for an engine AmazonDecision ({ keywords, marketplace, partnerTag } —
 * architecture.md §4). Owner requirement R2: one product per box (not a 1–3
 * list); the WHOLE card is the affiliate link and fills the reserved box.
 *
 * The product resolves server-side via searchProducts() (Redis-cached 24h,
 * stale-while-error — never a per-view API call) behind an 800ms render budget
 * (searchProductsWithTimeout). With no live product (throttle + no stale copy,
 * tag/marketplace rejection, empty result) the box falls back to the
 * marketplace-correct house product under preview (R4/R6: always filled), and
 * only when even that is empty to the reserved „Publicitate" treatment.
 *
 * Compliance (PROJECT_BRIEF §6.4 + Associates policy):
 * - visible „Publicitate" label — always, product or not;
 * - the product link: rel="sponsored noopener nofollow", target="_blank",
 *   URL carrying the marketplace-matching partnerTag (amazon.ts verifies;
 *   the house sets carry the correct per-market tag already);
 * - the Associates disclosure line renders once, under the product;
 * - plain <img> (external Amazon CDN) with width/height + loading="lazy".
 *
 * R6 (owner in France saw UK products): the preview fallback set is picked by
 * decision.marketplace (houseProductsForMarketplace), so /stiri/<slug>?geo=fr
 * shows amazon.fr products with newsromaniafr-21, ?geo=de → amazon.de, and
 * loopback (no geo) → the default amazon.de set.
 */

const SLOT_MIN_HEIGHT = 298 // matches AdSlot's reserved 300×250 treatment

function AdLabel() {
  return (
    <p className="flex h-6 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      Publicitate
    </p>
  )
}

/** Reserved-empty fallback — identical footprint to the product render. */
function EmptySlot() {
  return (
    <aside
      aria-label="Publicitate"
      style={{ height: SLOT_MIN_HEIGHT }}
      className="my-7 overflow-hidden rounded-[14px] border border-border bg-surface-2"
    >
      <AdLabel />
      <div className="mx-auto h-[250px] max-w-[300px]" />
    </aside>
  )
}

/** The single product card — the entire card is the sponsored affiliate link. */
function ProductCard({ product }: { product: AmazonProduct }) {
  return (
    <a
      href={product.url}
      target="_blank"
      rel="sponsored noopener nofollow"
      className="group flex min-h-0 flex-1 flex-col items-center gap-3 px-4 pb-3 pt-1 text-center"
    >
      {product.image ? (
        // Plain <img>: external Amazon CDN domain — intrinsic width/height
        // reserve the box; deliberately NOT next/image (no remotePatterns
        // entry / proxying for ad creative).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image.url}
          alt=""
          width={product.image.width}
          height={product.image.height}
          loading="lazy"
          decoding="async"
          className="max-h-[150px] w-auto max-w-full shrink object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-[120px] w-[120px] shrink-0 rounded-[2px] bg-surface-2"
        />
      )}
      <span className="flex min-w-0 flex-col items-center">
        <span className="line-clamp-2 font-sans text-[14px] font-semibold leading-[19px] text-ink transition-colors group-hover:text-link">
          {product.title}
          <span className="sr-only"> (link extern către Amazon)</span>
        </span>
        {product.price && (
          <span className="mt-1 block font-sans text-[15px] font-semibold leading-5 text-ink">
            {product.price}
          </span>
        )}
      </span>
    </a>
  )
}

export async function AmazonProductAd({ decision }: { decision: AmazonDecision }) {
  const products = await searchProductsWithTimeout({
    keywords: decision.keywords,
    marketplace: decision.marketplace,
    partnerTag: decision.partnerTag,
    count: 1,
  })

  // Preview/test only: while the live API is gated on sales-eligibility it
  // returns nothing — show the marketplace-correct SiteStripe house product so
  // the owner sees the placement filled (R4 always-fill, R6 geo-correct). Off
  // at launch (NEXT_PUBLIC_AD_PREVIEW=0).
  const product =
    products[0] ?? (AD_PREVIEW ? houseProductsForMarketplace(decision.marketplace)[0] : undefined)

  // Graceful null-product render: same reserved-empty box as AdSlot.
  if (!product) return <EmptySlot />

  return (
    <aside
      aria-label="Publicitate"
      style={{ minHeight: SLOT_MIN_HEIGHT }}
      className="my-7 flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface-2"
    >
      <AdLabel />
      <ProductCard product={product} />
      {/* Amazon Associates disclosure — required by the Operating Agreement,
          rendered exactly once per product ad. */}
      <p className="border-t border-border px-3 py-2 text-center font-sans text-[11px] leading-4 text-ink-muted">
        În calitate de Asociat Amazon, câștigăm din achizițiile eligibile.
      </p>
    </aside>
  )
}
