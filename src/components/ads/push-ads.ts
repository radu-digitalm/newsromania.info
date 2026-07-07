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
 * NPA is page-scoped and global: ConsentModeScript sets
 * requestNonPersonalizedAds=1 before the AdSense site tag whenever consent ≠
 * accepted, and that flag governs every subsequent push(), batch pushes too.
 *
 * The DOM/window surfaces are structural interfaces so the helper is
 * unit-testable in a node environment (tests/push-ads.test.ts).
 */

export const NEW_AD_SLOT_SELECTOR = 'ins.adsbygoogle[data-ad-slot]:not([data-nr-ad-pushed="1"])'

export const AD_PUSHED_ATTR = 'data-nr-ad-pushed'

/** Structural subset of an <ins> element. */
export interface PushableIns {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
}

/** Structural subset of Element/Document — anything with querySelectorAll. */
export interface AdSlotRoot {
  querySelectorAll(selectors: string): ArrayLike<PushableIns>
}

interface AdsbyGoogleWindow {
  adsbygoogle?: Array<Record<string, never>>
}

/**
 * Request a fill for every new (marked-free, unit-carrying) <ins> under
 * `root`. Marks FIRST, pushes second (check-and-set), one push per slot,
 * failures swallowed. Returns the number of slots pushed. No-ops on a null
 * root (unmounted container).
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
