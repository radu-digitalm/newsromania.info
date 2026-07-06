import { siteConfig } from '@/config/site'

/**
 * AdSlot — labelled, reserved, honest (design direction §4.5).
 *
 * AdSense review pending — unit IDs are created after approval (steps 6/10);
 * consent-gating (GDPR) lands at step 7. Until then the slot renders exactly
 * as it will post-approval: fixed-height wrapper (zero CLS), visible
 * „Publicitate" label, and an inert <ins class="adsbygoogle"> — a flat empty
 * field. NO fake ad content, no skeletons, no „în curând".
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

export function AdSlot({ variant }: { variant: AdSlotVariant }) {
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
      {/* Inert until AdSense approval: no script, no data-ad-slot. */}
      <ins
        className={`adsbygoogle mx-auto block w-full ${slot.ins}`}
        data-ad-client={siteConfig.adsensePublisherId}
      />
    </aside>
  )
}
