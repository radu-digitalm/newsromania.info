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

type AdSlotVariant = 'feed' | 'article'

// 300×250 unit: 24px label row + 250px slot + 24px bottom padding = 298px.
// Fixed per variant so the space is reserved before any ad script runs.
const SLOT_HEIGHT: Record<AdSlotVariant, number> = {
  feed: 298,
  article: 298,
}

export function AdSlot({ variant }: { variant: AdSlotVariant }) {
  return (
    <aside
      aria-label="Publicitate"
      style={{ height: SLOT_HEIGHT[variant] }}
      className="my-5 overflow-hidden rounded-[2px] border border-border bg-[#F3F2EE]"
    >
      <p className="flex h-6 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-[#57606E]">
        Publicitate
      </p>
      {/* Inert until AdSense approval: no script, no data-ad-slot. */}
      <ins
        className="adsbygoogle mx-auto block h-[250px] w-full max-w-[300px]"
        data-ad-client={siteConfig.adsensePublisherId}
      />
    </aside>
  )
}
