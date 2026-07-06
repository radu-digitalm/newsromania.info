import type { AdDecision } from '@/lib/ads/engine'

import { AdSenseUnit } from './AdSenseUnit'
import { AmazonProductAd } from './AmazonProductAd'

/**
 * AdSlot — labelled, reserved, honest (design direction §4.5), now rendering
 * a server-side AdDecision from the ad engine (src/lib/ads/engine.ts).
 *
 * Visual contract (unchanged): fixed-height wrapper reserved BEFORE any ad
 * script runs (zero CLS), visible „Publicitate" label, and — while AdSense
 * review is pending / no unitId exists for the placement — an inert
 * <ins class="adsbygoogle"> as a flat empty field. NO fake ad content, no
 * skeletons, no „în curând".
 *
 * Decision dispatch:
 * - network 'amazon' → <AmazonProductAd> (placeholder until Group D).
 * - network 'adsense' (or no decision passed — legacy call sites) →
 *   <AdSenseUnit>: data-ad-slot only when the engine resolved a unitId;
 *   NPA is handled ONCE globally by ConsentModeScript (see AdSenseUnit.tsx
 *   for the exact coordination contract with the consent agent).
 *
 * Placement ethics (hard rule): an AdSlot never sits between a title and its
 * byline/attribution row, and never mimics article anatomy.
 */

type AdSlotVariant = 'feed' | 'article' | 'rail' | 'leaderboard'

// Fixed wrapper heights (§4.5) so the space is reserved before any ad script
// runs (zero CLS): 300×250 units = 24px label + 250px slot + 24px padding =
// 298px; the 728×90 leaderboard = 24 + 90 + 24 = 138px, desktop only.
const SLOT: Record<AdSlotVariant, { height: number; wrapper: string; ins: string }> = {
  feed: { height: 298, wrapper: '', ins: 'h-[250px] max-w-[300px]' },
  article: { height: 298, wrapper: '', ins: 'h-[250px] max-w-[300px]' },
  rail: { height: 298, wrapper: '', ins: 'h-[250px] max-w-[300px]' },
  // Leaderboard renders once between hero band and main feed; display: none
  // below 768px — mobile gets no leaderboard (§4.5).
  leaderboard: { height: 138, wrapper: 'hidden md:block', ins: 'h-[90px] max-w-[728px]' },
}

/** Inert fallback when a page renders a slot without an engine decision. */
const INERT_DECISION = { format: 'auto', npa: true, unitId: undefined }

export function AdSlot({ variant, decision }: { variant: AdSlotVariant; decision?: AdDecision }) {
  // Amazon placements keep their own reserved treatment (same height class).
  if (decision?.network === 'amazon' && decision.amazon) {
    return <AmazonProductAd decision={decision.amazon} />
  }

  const slot = SLOT[variant]
  return (
    <aside
      aria-label="Publicitate"
      style={{ height: slot.height }}
      className={`my-5 overflow-hidden rounded-[2px] border border-border bg-surface-2 ${slot.wrapper}`}
    >
      <p className="flex h-6 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        Publicitate
      </p>
      <AdSenseUnit decision={decision?.adsense ?? INERT_DECISION} className={slot.ins} />
    </aside>
  )
}
