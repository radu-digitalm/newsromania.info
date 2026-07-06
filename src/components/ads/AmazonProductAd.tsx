import type { AmazonDecision } from '@/lib/ads/engine'
import { searchProductsWithTimeout, type AmazonProduct } from '@/lib/ads/amazon'

/**
 * AmazonProductAd — server component rendering 1–3 real Amazon products for
 * an engine AmazonDecision ({ keywords, marketplace, partnerTag } —
 * architecture.md §4).
 *
 * Products resolve server-side via searchProducts() (Redis-cached 24h,
 * stale-while-error — never a per-view API call) behind an 800ms render
 * budget (searchProductsWithTimeout): past the budget, or with no products
 * (throttle + no stale copy, tag/marketplace rejection, empty result), the
 * slot falls back to the same reserved-empty „Publicitate" treatment as
 * AdSlot (design direction §4.5) — no fake products, no skeletons, no CLS.
 *
 * Compliance (PROJECT_BRIEF §6.4 + Associates policy):
 * - visible „Publicitate" label — always, products or not;
 * - every product link: rel="sponsored noopener nofollow", target="_blank",
 *   URL carrying the marketplace-matching partnerTag (amazon.ts verifies);
 * - the Associates disclosure line renders once, under the products;
 * - plain <img> (external Amazon CDN) with width/height + loading="lazy".
 */

const SLOT_MIN_HEIGHT = 298 // matches AdSlot's reserved 300×250 treatment

function AdLabel() {
  return (
    <p className="flex h-6 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
      Publicitate
    </p>
  )
}

/** Reserved-empty fallback — identical footprint to the products render. */
function EmptySlot() {
  return (
    <aside
      aria-label="Publicitate"
      style={{ height: SLOT_MIN_HEIGHT }}
      className="my-5 overflow-hidden rounded-[2px] border border-border bg-surface-2"
    >
      <AdLabel />
      <div className="mx-auto h-[250px] max-w-[300px]" />
    </aside>
  )
}

function ProductRow({ product }: { product: AmazonProduct }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <a
        href={product.url}
        target="_blank"
        rel="sponsored noopener nofollow"
        className="group flex items-center gap-3 px-3 py-2.5"
      >
        {product.image ? (
          // Plain <img>: external Amazon CDN domain (m.media-amazon.com) —
          // intrinsic width/height reserve the box; deliberately NOT
          // next/image (no remotePatterns entry / proxying for ad creative).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image.url}
            alt=""
            width={product.image.width}
            height={product.image.height}
            loading="lazy"
            decoding="async"
            className="h-14 w-14 shrink-0 rounded-[2px] bg-white object-contain"
          />
        ) : (
          <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-[2px] bg-surface-2" />
        )}
        <span className="min-w-0">
          <span className="line-clamp-2 font-sans text-[13px] font-semibold leading-[18px] text-ink transition-colors group-hover:text-link">
            {product.title}
            <span className="sr-only"> (link extern către Amazon)</span>
          </span>
          {product.price && (
            <span className="mt-0.5 block font-sans text-[13px] leading-[18px] text-ink-secondary">
              {product.price}
            </span>
          )}
        </span>
      </a>
    </li>
  )
}

export async function AmazonProductAd({ decision }: { decision: AmazonDecision }) {
  const products = await searchProductsWithTimeout({
    keywords: decision.keywords,
    marketplace: decision.marketplace,
    partnerTag: decision.partnerTag,
    count: 3,
  })

  // Graceful null-products render: same reserved-empty box as AdSlot.
  if (products.length === 0) return <EmptySlot />

  return (
    <aside
      aria-label="Publicitate"
      style={{ minHeight: SLOT_MIN_HEIGHT }}
      className="my-5 overflow-hidden rounded-[2px] border border-border bg-surface-2"
    >
      <AdLabel />
      <ul className="mx-auto max-w-[300px]">
        {products.slice(0, 3).map((product) => (
          <ProductRow key={product.asin} product={product} />
        ))}
      </ul>
      {/* Amazon Associates disclosure — required by the Operating Agreement,
          rendered exactly once per product ad. */}
      <p className="border-t border-border px-3 py-2 text-center font-sans text-[11px] leading-4 text-ink-muted">
        În calitate de Asociat Amazon, câștigăm din achizițiile eligibile.
      </p>
    </aside>
  )
}
