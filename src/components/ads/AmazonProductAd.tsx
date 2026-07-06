import type { AmazonDecision } from '@/lib/ads/engine'

/**
 * AmazonProductAd — PLACEHOLDER (Group D wires the real product rendering).
 *
 * The ad engine already emits the full Amazon decision shape
 * ({ keywords, marketplace, partnerTag } — architecture.md §4); this
 * component reserves the exact slot it will occupy: same fixed 298px-high,
 * „Publicitate"-labelled treatment as AdSlot (design direction §4.5, zero
 * CLS), rendered as an EMPTY field. No fake products, no skeletons.
 *
 * Group D replaces the empty body with real products fetched server-side via
 * src/lib/ads/amazon.ts → searchProducts({ keywords, marketplace,
 * partnerTag, count }) (Redis-cached 24h, throttle-aware — never per view),
 * with affiliate links carrying decision.partnerTag. Until then the decision
 * is intentionally unused at render time.
 */
export function AmazonProductAd({ decision }: { decision: AmazonDecision }) {
  void decision // consumed by the Group D product renderer
  return (
    <aside
      aria-label="Publicitate"
      style={{ height: 298 }}
      className="my-5 overflow-hidden rounded-[2px] border border-border bg-surface-2"
    >
      <p className="flex h-6 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        Publicitate
      </p>
      {/* Reserved-empty until Group D: 250px product area below the 24px label. */}
      <div className="mx-auto h-[250px] max-w-[300px]" />
    </aside>
  )
}
