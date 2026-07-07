import { adsenseAt, type AdDecision, type AdSenseDecision } from '@/lib/ads/engine'

import { AdSenseUnit } from './AdSenseUnit'
import { AmazonProductAd } from './AmazonProductAd'

/**
 * AdSlot — labelled, reserved, honest (design direction v2 §4.4), rendering a
 * server-side AdDecision from the ad engine (src/lib/ads/engine.ts).
 *
 * v2 visual contract: the shell blends into the card grid — bg `surface-2`,
 * 1px `border`, radius 14px (leaderboard: 12px) — with a fixed 24px
 * „Publicitate" label row, ALWAYS rendered. Heights are reserved per
 * breakpoint via classes BEFORE any ad script runs (zero CLS):
 *
 * - `feed`        → in-feed grid-cell card: fills its cell (`h-full`),
 *                   min 298px (24 label + 250 unit + 24 padding), 300×250
 *                   unit centered vertically. No own margins — the grid gap
 *                   spaces it.
 * - `article`     → in-article + end-of-article: 298px wrapper, 300×250
 *                   centered, 28px block margins.
 * - `leaderboard` → responsive top banner (home below hero + top of both
 *                   article types): 148px wrapper with a 320×100 unit below
 *                   768px, 138px with a 728×90 unit above. No longer
 *                   desktop-only.
 * - `rail`        → legacy v1 variant, kept ONLY for the type contract
 *                   (architecture.md §4); v2 pages never render it and the
 *                   engine never plans it.
 *
 * While AdSense review is pending / no unitId exists for the placement, the
 * <ins class="adsbygoogle"> stays inert — a flat empty field. NO fake ad
 * content, no skeletons, no shimmer, no „în curând".
 *
 * Decision dispatch:
 * - network 'amazon' → <AmazonProductAd> (article placements only — the
 *   engine never marks feed/leaderboard as amazon).
 * - network 'adsense' (or no decision passed — legacy call sites) →
 *   <AdSenseUnit>: data-ad-slot only when the engine resolved a unitId;
 *   when several units are configured for the placement, the `index` prop
 *   (this slot's 0-based position on the page) rotates them deterministically
 *   via adsenseAt(). NPA is handled ONCE globally by ConsentModeScript (see
 *   AdSenseUnit.tsx for the exact coordination contract with the consent
 *   agent).
 *
 * Placement ethics (hard rules kept): an AdSlot never sits between a title
 * and its byline/attribution row, never between the aggregated excerpt and
 * its CTA, and never mimics card anatomy (no photo, no title styles).
 */

type AdSlotVariant = 'feed' | 'article' | 'rail' | 'leaderboard'

// Class-reserved heights (v2 §4.4) so the space exists before any ad script
// runs (zero CLS): 300×250 units = 24px label + 250px slot + 24px padding =
// 298px; the leaderboard = 24 + 100 + 24 = 148px mobile / 24 + 90 + 24 =
// 138px ≥768px. The <ins> sizing classes implement Google's documented
// CSS-sized responsive method (media-query dimensions, no inline size).
const SLOT: Record<AdSlotVariant, { wrapper: string; ins: string }> = {
  feed: {
    wrapper: 'h-full min-h-[298px] rounded-[14px]',
    ins: 'h-[250px] max-w-[300px]',
  },
  article: {
    wrapper: 'my-7 h-[298px] rounded-[14px]',
    ins: 'h-[250px] max-w-[300px]',
  },
  rail: {
    // Never rendered in v2 — kept so the variant union stays contract-exact.
    wrapper: 'my-7 h-[298px] rounded-[14px]',
    ins: 'h-[250px] max-w-[300px]',
  },
  leaderboard: {
    wrapper: 'my-6 h-[148px] rounded-[12px] md:h-[138px]',
    ins: 'h-[100px] max-w-[320px] md:h-[90px] md:max-w-[728px]',
  },
}

/** Inert fallback when a page renders a slot without an engine decision. */
const INERT_DECISION: AdSenseDecision = { format: 'auto', npa: true, unitId: undefined }

export function AdSlot({
  variant,
  decision,
  index = 0,
}: {
  variant: AdSlotVariant
  decision?: AdDecision
  /**
   * 0-based position of THIS slot among same-placement slots on the page
   * (1st in-feed ad = 0, 2nd = 1, …). When site-config maps several AdSense
   * units to the placement, adsenseAt() rotates through them
   * deterministically by this index.
   */
  index?: number
}) {
  // Amazon placements keep their own reserved treatment (same footprint).
  if (decision?.network === 'amazon' && decision.amazon) {
    return <AmazonProductAd decision={decision.amazon} />
  }

  const slot = SLOT[variant]
  return (
    <aside
      aria-label="Publicitate"
      className={`flex flex-col overflow-hidden border border-border bg-surface-2 ${slot.wrapper}`}
    >
      <p className="flex h-6 shrink-0 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Publicitate
      </p>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <AdSenseUnit decision={adsenseAt(decision, index) ?? INERT_DECISION} className={slot.ins} />
      </div>
    </aside>
  )
}
