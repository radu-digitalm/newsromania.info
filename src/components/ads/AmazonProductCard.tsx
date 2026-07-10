import type { AmazonPricing, AmazonProduct } from '@/lib/ads/amazon-product'

/**
 * AmazonProductCard — the CLIENT-BUNDLE-SAFE presentational Amazon product box
 * (owner v2.4). Pure: it takes an ALREADY-RESOLVED serialized product and
 * renders the labelled „Publicitate" box + card/banner + Associate disclosure.
 * NO server imports (no amazon.ts / node:crypto / Redis / product resolution),
 * so it compiles into the infinite-scroll client bundle unchanged.
 *
 * Two renderers use it, guaranteeing byte-identical markup on SSR page 1 and
 * across client scroll batches:
 *  - the server AmazonProductAd resolves the product (live → house fallback)
 *    then renders this;
 *  - the client PostBatch renders this directly from the product the /api/feed
 *    batch serialized (the amazon-ordinal feed ad-posts).
 *
 * Compliance is baked into the markup (PROJECT_BRIEF §6.4 + Associates policy):
 * visible „Publicitate" label; rel="sponsored noopener nofollow", target
 * _blank; the URL already carries the marketplace-matching partnerTag (resolved
 * server-side); the disclosure line once per box; plain lazy <img>.
 *
 * PRICING: rendered if — and only if — `product.pricing` is present. That object
 * exists solely on PA-API data fetched within the last 24h (see AmazonPricing);
 * the static house catalog and the stale-while-error cache carry none, so a
 * price or promotion that Amazon would consider out of date has nothing to
 * render from. Never reintroduce a bare `price` field on AmazonProduct.
 */

export type AmazonAdLayout = 'card' | 'banner'

/** Reserved heights matching AdSlot (zero CLS): 300×250 box / 148px banner. */
export const AMAZON_CARD_MIN_HEIGHT = 298
export const AMAZON_BANNER_MIN_HEIGHT = 148

function AdLabel() {
  return (
    <p className="flex h-6 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      Publicitate
    </p>
  )
}

function AssociateDisclosure() {
  return (
    <p className="border-t border-border px-3 py-2 text-center font-sans text-[11px] leading-4 text-ink-muted">
      Amazon affiliate
    </p>
  )
}

/**
 * Price + promotion. Only ever mounted for a `pricing` object, i.e. live PA-API
 * data ≤24h old, so everything here is safe to display under the Associates
 * agreement. Shape: [deal badge] price [struck was-price] [−%].
 */
function PricingRow({ pricing, align }: { pricing: AmazonPricing; align: 'center' | 'left' }) {
  const discounted = Boolean(pricing.savings || pricing.was)
  return (
    <span
      className={`mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 ${
        align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      {pricing.dealBadge && (
        <span className="rounded-[3px] bg-brand-red px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase leading-4 tracking-[0.04em] text-ink-inverse">
          {pricing.dealBadge}
        </span>
      )}
      <span
        className={`font-sans text-[16px] font-semibold leading-5 ${
          discounted ? 'text-red-text' : 'text-ink'
        }`}
      >
        {pricing.price}
      </span>
      {pricing.was && (
        <span className="font-sans text-[13px] leading-5 text-ink-muted">
          <span className="sr-only">{pricing.was.label ?? 'Preț anterior'}: </span>
          <s>{pricing.was.display}</s>
        </span>
      )}
      {pricing.savings?.percentage !== undefined && (
        <span className="font-sans text-[13px] font-semibold leading-5 text-red-text">
          <span className="sr-only">Reducere </span>−{pricing.savings.percentage}%
        </span>
      )}
    </span>
  )
}

/** Reserved-empty fallback — identical footprint to a rendered product. */
export function AmazonEmptyBox({ layout = 'card' }: { layout?: AmazonAdLayout }) {
  const banner = layout === 'banner'
  return (
    <aside
      aria-label="Publicitate"
      style={{ height: banner ? AMAZON_BANNER_MIN_HEIGHT : AMAZON_CARD_MIN_HEIGHT }}
      className={`my-7 overflow-hidden border border-border bg-surface-2 ${
        banner ? 'rounded-[12px]' : 'rounded-[14px]'
      }`}
    >
      <AdLabel />
      <div className={banner ? 'h-[100px]' : 'mx-auto h-[250px] max-w-[300px]'} />
    </aside>
  )
}

/** Rectangle card — the entire card is the sponsored affiliate link. */
function ProductCardBody({ product }: { product: AmazonProduct }) {
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
        {product.pricing && <PricingRow pricing={product.pricing} align="center" />}
      </span>
    </a>
  )
}

/** Wide 1-product banner — image left, title/price right (leaderboard). */
function ProductBannerBody({ product }: { product: AmazonProduct }) {
  return (
    <a
      href={product.url}
      target="_blank"
      rel="sponsored noopener nofollow"
      className="group flex min-h-0 flex-1 items-center gap-4 px-4 py-2"
    >
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image.url}
          alt=""
          width={product.image.width}
          height={product.image.height}
          loading="lazy"
          decoding="async"
          className="h-[92px] w-[92px] shrink-0 object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-[92px] w-[92px] shrink-0 rounded-[2px] bg-surface-2"
        />
      )}
      <span className="flex min-w-0 flex-col text-left">
        <span className="line-clamp-2 font-sans text-[15px] font-semibold leading-5 text-ink transition-colors group-hover:text-link">
          {product.title}
          <span className="sr-only"> (link extern către Amazon)</span>
        </span>
        {product.pricing && <PricingRow pricing={product.pricing} align="left" />}
      </span>
    </a>
  )
}

/** The full labelled Amazon box for a resolved product. */
export function AmazonProductCard({
  product,
  layout = 'card',
}: {
  product: AmazonProduct
  layout?: AmazonAdLayout
}) {
  const banner = layout === 'banner'
  return (
    <aside
      aria-label="Publicitate"
      style={{ minHeight: banner ? AMAZON_BANNER_MIN_HEIGHT : AMAZON_CARD_MIN_HEIGHT }}
      className={`my-7 flex flex-col overflow-hidden border border-border bg-surface-2 ${
        banner ? 'rounded-[12px]' : 'rounded-[14px]'
      }`}
    >
      <AdLabel />
      {banner ? <ProductBannerBody product={product} /> : <ProductCardBody product={product} />}
      <AssociateDisclosure />
    </aside>
  )
}
