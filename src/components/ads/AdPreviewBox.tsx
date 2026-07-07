/**
 * AdPreviewBox — the labelled demo creative shown inside a reserved AdSense
 * slot when NEXT_PUBLIC_AD_PREVIEW='1' (see src/lib/ads/preview.ts).
 *
 * Owner requirement R4 (ads always fill the box — no empty/blank boxes in
 * preview): instead of a mostly-empty striped placeholder, this renders a
 * FILLED, solid brand-tinted card that reads unmistakably as an ad placeholder
 * — a centered „Anunț • previzualizare" label plus the real unit size. It fills
 * the slot's already-reserved inner area (zero CLS) and is non-interactive, so
 * it is never mistaken for a real advertiser's creative (still an honest,
 * clearly-labelled preview — not a policy violation). `size` names the real
 * unit dimensions so the owner can see the placement footprint.
 */
export function AdPreviewBox({ size }: { size: string }) {
  return (
    <div className="mx-2 mb-2 flex flex-1 flex-col items-center justify-center gap-1 rounded-[8px] border border-brand-red/25 bg-brand-red/[0.08] text-center">
      {/* red-text (#C0121F) keeps AA on the tinted surface — brand-red itself
          is banned for text below 24px (globals.css). */}
      <span className="font-sans text-[13px] font-semibold uppercase tracking-[0.12em] text-red-text">
        Anunț • previzualizare
      </span>
      <span className="font-sans text-[12px] font-medium tracking-normal text-ink-muted">
        {size}
      </span>
    </div>
  )
}
