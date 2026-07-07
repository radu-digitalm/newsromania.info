/**
 * AdPreviewBox — the labelled demo placeholder shown inside a reserved slot
 * when NEXT_PUBLIC_AD_PREVIEW='1' (see src/lib/ads/preview.ts). Fills the
 * slot's already-reserved inner area (zero CLS), clearly reads as a preview,
 * and is non-interactive — never mistaken for a real ad. `size` names the real
 * unit dimensions so the owner can see the placement footprint.
 */
export function AdPreviewBox({ size }: { size: string }) {
  return (
    <div
      className="mx-2 mb-2 flex flex-1 items-center justify-center rounded-[8px] border border-dashed border-border-functional text-center"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent, transparent 9px, rgba(68,99,173,0.07) 9px, rgba(68,99,173,0.07) 18px)',
      }}
    >
      <span className="px-3 font-sans text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Spațiu publicitar
        <span className="mt-0.5 block text-[11px] font-normal normal-case tracking-normal text-ink-muted">
          {size} · previzualizare
        </span>
      </span>
    </div>
  )
}
