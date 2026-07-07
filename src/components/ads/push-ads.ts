/**
 * pushNewAdSlots — AdSense fill requests for dynamically inserted ad slots
 * (design direction v2.1 §8.10, Google's documented infinite-feed pattern:
 * ONE adsbygoogle.push({}) per inserted <ins>).
 *
 * FeedStream calls this after every batch commit. The selector targets only
 * REAL, not-yet-pushed units:
 *
 *   - `[data-ad-slot]` — unitless slots (site review pending) are skipped ⇒
 *     zero push() calls; their reserved „Publicitate” boxes stay flat empty
 *     fields at full height, exactly as on page 1.
 *   - `:not([data-nr-ad-pushed="1"])` — the EXISTING per-slot marker is the
 *     single idempotency lock shared with AdSenseUnit's inline script
 *     (pushScriptFor): whichever mechanism runs first check-and-sets it, so
 *     an <ins> can never request two fills — re-renders and retries included.
 *
 * Visibility guard (v2.2 §rail): a HIDDEN <ins> must NEVER be pushed to
 * adsbygoogle — AdSense forbids fill requests for display:none inventory.
 * The v2.2 desktop rail (SideRailAd) is `hidden lg:block`, so below lg the
 * element sits in the DOM with display:none. isAdSlotVisible() implements the
 * offsetParent/width>0 check; invisible slots are skipped WITHOUT being
 * marked, keeping a future call free to fill them. That future call exists for
 * the rail: RailAdReveal (src/components/ads/RailAdReveal.tsx) re-invokes this
 * helper over the rail's own subtree whenever the viewport crosses lg, so a
 * rail hidden at load fills once it becomes visible (rotation / resize). The
 * shared data-nr-ad-pushed marker keeps every such retry idempotent.
 *
 * NPA is page-scoped and global: ConsentModeScript sets
 * requestNonPersonalizedAds=1 before the AdSense site tag whenever consent ≠
 * accepted, and that flag governs every subsequent push(), batch pushes too.
 *
 * The DOM/window surfaces are structural interfaces so the helper is
 * unit-testable in a node environment (tests/push-ads.test.ts).
 */

export const NEW_AD_SLOT_SELECTOR = 'ins.adsbygoogle[data-ad-slot]:not([data-nr-ad-pushed="1"])'

export const AD_PUSHED_ATTR = 'data-nr-ad-pushed'

/** Structural subset of an <ins> element (layout fields optional for node-env fakes). */
export interface PushableIns {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  /** HTMLElement.offsetParent — null for display:none (and position:fixed) elements. */
  offsetParent?: unknown
  /** HTMLElement.offsetWidth — 0 for display:none elements. */
  offsetWidth?: number
}

/** Structural subset of Element/Document — anything with querySelectorAll. */
export interface AdSlotRoot {
  querySelectorAll(selectors: string): ArrayLike<PushableIns>
}

interface AdsbyGoogleWindow {
  adsbygoogle?: Array<Record<string, never>>
}

/**
 * Visibility guard before any push (v2.2): visible ⇔ the element has a layout
 * box — offsetParent non-null OR offsetWidth > 0 (the width check keeps
 * position:fixed elements, whose offsetParent is null, pushable). An element
 * hidden via `display:none` (Tailwind `hidden`, e.g. the rail below lg) fails
 * both and must not request a fill. Structural fakes without layout fields
 * (node-env tests) count as visible — the guard only ever REMOVES pushes.
 */
export function isAdSlotVisible(ins: PushableIns): boolean {
  if (ins.offsetParent === undefined && ins.offsetWidth === undefined) return true
  return ins.offsetParent != null || (ins.offsetWidth ?? 0) > 0
}

/**
 * Request a fill for every new (marked-free, unit-carrying, VISIBLE) <ins>
 * under `root`. Marks FIRST, pushes second (check-and-set), one push per
 * slot, failures swallowed; hidden slots are skipped unmarked. Returns the
 * number of slots pushed. No-ops on a null root (unmounted container).
 */
export function pushNewAdSlots(
  root: AdSlotRoot | null | undefined,
  w: AdsbyGoogleWindow = globalThis as AdsbyGoogleWindow,
): number {
  if (!root) return 0
  const slots = root.querySelectorAll(NEW_AD_SLOT_SELECTOR)
  let pushed = 0
  for (let i = 0; i < slots.length; i++) {
    const ins = slots[i]
    // Hidden inventory (display:none — e.g. the lg-only rail on mobile) must
    // never request a fill; left unmarked so it can be pushed once visible.
    if (!isAdSlotVisible(ins)) continue
    // Belt and braces on top of the selector: never double-fire, even if the
    // inline script marked this slot between query and iteration.
    if (ins.getAttribute(AD_PUSHED_ATTR) === '1') continue
    ins.setAttribute(AD_PUSHED_ATTR, '1')
    try {
      ;(w.adsbygoogle = w.adsbygoogle ?? []).push({})
      pushed += 1
    } catch {
      // Script blocked / offline — the reserved box simply stays empty.
    }
  }
  return pushed
}
