'use client'

import { useEffect, useRef, type ReactNode } from 'react'

import { pushNewAdSlots, type AdSlotRoot } from './push-ads'

/**
 * Closes the v2.2 rail's hidden-at-load gap. The desktop-only SideRailAd is
 * `hidden lg:block`: a pageview that STARTS below lg leaves the rail <ins>
 * unpushed — correctly, because hidden inventory must never request a fill
 * (AdSense policy; both push paths carry the offsetParent/width>0 guard). But
 * if the viewport later crosses the lg breakpoint (rotation, window resize,
 * desktop split-view), the now-visible rail would otherwise stay an empty
 * reserved shell for the rest of the pageview.
 *
 * This client wrapper watches `(min-width: 1024px)` (Tailwind's `lg`) and runs
 * the tested, visibility-guarded, idempotent pushNewAdSlots over its own
 * subtree whenever the query matches. On a desktop that loads ≥lg the inline
 * pushScriptFor (AdSenseUnit) has already filled the slot; the shared
 * data-nr-ad-pushed marker makes this call a no-op then — never a double fill.
 * Scoped to a ref (never document) so it only ever touches the rail's own <ins>.
 */
export function RailAdReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const attempt = () => {
      if (mql.matches && ref.current) pushNewAdSlots(ref.current as AdSlotRoot)
    }
    attempt() // covers hydration when already ≥lg (idempotent via the marker)
    mql.addEventListener('change', attempt)
    return () => mql.removeEventListener('change', attempt)
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
