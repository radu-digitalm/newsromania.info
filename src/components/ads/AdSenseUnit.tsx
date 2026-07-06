'use client'

import { useEffect } from 'react'

import { siteConfig } from '@/config/site'
import type { AdSenseDecision } from '@/lib/ads/engine'

/**
 * The AdSense <ins> for one slot, rendered from a server-decided
 * AdSenseDecision (src/lib/ads/engine.ts).
 *
 * - data-ad-client: always the public publisher id (site-config seeded value).
 * - data-ad-slot: ONLY when the engine resolved a unitId. Without one (site
 *   review pending) the <ins> stays inert — no adsbygoogle.push(), no fake
 *   ads — and the reserved wrapper (AdSlot) keeps the layout stable.
 * - data-full-width-responsive + data-ad-format per the decision.
 *
 * NPA / consent contract (coordinated with the consent agent): the
 * non-personalized flag is set ONCE globally by ConsentModeScript
 * (src/components/consent/ConsentModeScript.tsx) as an inline script that
 * runs before the AdSense site tag —
 *   (window.adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1
 * whenever consent !== 'accepted'. This component NEVER sets it per-slot;
 * decision.npa is carried only so the rendered slot is auditable
 * (data-npa attribute) and tests can assert the gating.
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

export function AdSenseUnit({
  decision,
  className,
}: {
  decision: AdSenseDecision
  className?: string
}) {
  const { unitId, format, npa } = decision

  useEffect(() => {
    // Only real units request a fill; inert slots must never call push().
    if (!unitId) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense not loaded (blocked, offline) — the reserved box stays empty.
    }
  }, [unitId])

  return (
    <ins
      className={`adsbygoogle mx-auto block w-full ${className ?? ''}`}
      data-ad-client={siteConfig.adsensePublisherId}
      {...(unitId ? { 'data-ad-slot': unitId } : {})}
      data-ad-format={format}
      data-full-width-responsive="true"
      data-npa={npa ? '1' : '0'}
    />
  )
}
