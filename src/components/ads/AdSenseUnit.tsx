'use client'

import Script from 'next/script'
import { useId, type CSSProperties } from 'react'

import { siteConfig } from '@/config/site'
import type { AdSenseDecision } from '@/lib/ads/engine-core'

/**
 * The AdSense <ins> for one slot, rendered from a server-decided
 * AdSenseDecision (src/lib/ads/engine.ts — unit picked per placement from
 * site-config adNetworks.adUnitIds, rotated by position index via adsenseAt).
 *
 * - data-ad-client: always the public publisher id (site-config seeded value).
 * - data-ad-slot + a per-slot push script: ONLY when the engine resolved a
 *   unitId. Without one (site review pending — EXPECTED) the <ins> stays
 *   inert — no adsbygoogle.push(), no fake ads — and the reserved wrapper
 *   (AdSlot) keeps the layout stable.
 * - Format → attributes mapping (PROJECT_BRIEF §6.4, docs/ads-operations.md):
 *     'fluid' / 'in-feed'[:layoutKey] → responsive in-feed (data-ad-format
 *       "fluid", optional data-ad-layout-key from the dashboard snippet)
 *     'in-article'                    → fluid + data-ad-layout "in-article"
 *     'rectangle' / '300x250'         → fixed 300×250 (article-end default)
 *     'horizontal' / 'leaderboard'    → CSS-sized responsive banner: the
 *       <ins> carries no inline size and no data-ad-format; AdSlot's
 *       media-query classes size it (320×100 <768px / 728×90 ≥768px) —
 *       Google's documented CSS-sized responsive method
 *     any 'WxH' (e.g. '728x90')       → fixed W×H
 *     'auto' / unknown                → responsive auto, full-width
 * - The push script is a per-slot inline next/script keyed by useId with an
 *   idempotent guard (data-nr-ad-pushed) so a slot never requests two fills.
 *
 * NPA / consent contract: since the CMP reconciliation (2026-07), ad
 * personalization is governed ENTIRELY by Google's certified CMP + Consent
 * Mode v2 (delivered through the AdSense tag). We no longer set
 * requestNonPersonalizedAds ourselves — the retired ConsentModeScript used to,
 * from our own consent, which would now always be 'unknown' and wrongly force
 * NPA on CMP-consented users. buildAdPlan hard-sets decision.npa=false; this
 * component still renders it as data-npa only so the slot stays auditable.
 */

/** Attribute bundle derived from an AdSenseDecision.format value. */
export interface AdSenseFormatAttributes {
  style: CSSProperties
  'data-ad-format'?: string
  'data-ad-layout'?: string
  'data-ad-layout-key'?: string
  'data-full-width-responsive'?: string
}

/**
 * Pure format-key → <ins> attribute mapping. The optional ':<layoutKey>'
 * suffix carries the data-ad-layout-key from the dashboard's in-feed snippet
 * (e.g. 'fluid:-6t+ed+2i-1n-4w').
 */
export function formatAttributes(format: string): AdSenseFormatAttributes {
  const separator = format.indexOf(':')
  const kind = (separator === -1 ? format : format.slice(0, separator)).trim().toLowerCase()
  const layoutKey = separator === -1 ? undefined : format.slice(separator + 1).trim()

  // Fixed-size units (no data-ad-format): explicit width/height on the <ins>.
  const fixed = /^(\d+)x(\d+)$/.exec(kind)
  if (kind === 'rectangle' || fixed?.[0] === '300x250') {
    return { style: { display: 'inline-block', width: 300, height: 250 } }
  }
  if (kind === 'horizontal' || kind === 'leaderboard') {
    // Responsive banner (design direction v2 §4.4): no inline size, no
    // data-ad-format — the slot's media-query classes decide 320×100 vs
    // 728×90. An explicit 'WxH' format (e.g. '728x90') stays fixed below.
    return { style: { display: 'block' } }
  }
  if (fixed) {
    return { style: { display: 'inline-block', width: Number(fixed[1]), height: Number(fixed[2]) } }
  }

  if (kind === 'fluid' || kind === 'in-feed') {
    return {
      style: { display: 'block' },
      'data-ad-format': 'fluid',
      ...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {}),
    }
  }
  if (kind === 'in-article') {
    return {
      style: { display: 'block', textAlign: 'center' },
      'data-ad-format': 'fluid',
      'data-ad-layout': 'in-article',
    }
  }
  // 'auto' and anything unrecognized: responsive auto (AdSense's safe default).
  return {
    style: { display: 'block' },
    'data-ad-format': 'auto',
    'data-full-width-responsive': 'true',
  }
}

/** Everything spread onto the <ins> — pure and unit-testable without a DOM. */
export function adsenseInsProps(
  decision: AdSenseDecision,
): AdSenseFormatAttributes & Record<string, unknown> {
  const attributes = formatAttributes(decision.format)
  return {
    ...attributes,
    'data-ad-client': siteConfig.adsensePublisherId,
    // data-ad-slot ONLY with a real unit id — an inert <ins> must never
    // carry a slot id (nothing to fill until AdSense review passes).
    ...(decision.unitId ? { 'data-ad-slot': decision.unitId } : {}),
    'data-npa': decision.npa ? '1' : '0',
  }
}

/**
 * Per-slot fill request, executed by an inline next/script. Idempotent: the
 * data-nr-ad-pushed marker guarantees at most ONE adsbygoogle.push() per
 * <ins>, even if the script re-runs. Visibility-guarded (v2.2, mirrors
 * push-ads.ts isAdSlotVisible): a display:none <ins> — e.g. the desktop-only
 * rail below lg (`hidden lg:block`) — must NEVER be pushed to adsbygoogle;
 * it returns early WITHOUT marking. This inline script runs once at load, so
 * it fills the rail only when it is already visible then (desktop ≥lg); if the
 * viewport later crosses lg, RailAdReveal re-runs the guarded, idempotent
 * pushNewAdSlots over the rail subtree to fill it (see push-ads.ts header).
 * Failures (script blocked, offline) are swallowed — the box stays empty.
 */
export function pushScriptFor(insId: string): string {
  return (
    '(function(){' +
    `var el=document.getElementById(${JSON.stringify(insId)});` +
    "if(!el||el.getAttribute('data-nr-ad-pushed')==='1')return;" +
    'if(el.offsetParent==null&&!(el.offsetWidth>0))return;' +
    "el.setAttribute('data-nr-ad-pushed','1');" +
    'try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}' +
    '})();'
  )
}

export function AdSenseUnit({
  decision,
  className,
}: {
  decision: AdSenseDecision
  className?: string
}) {
  const uid = useId()
  const insId = `nr-ad-${uid}`
  const { style, ...attributes } = adsenseInsProps(decision)

  return (
    <>
      <ins
        id={insId}
        className={`adsbygoogle mx-auto block w-full ${className ?? ''}`}
        style={style}
        {...attributes}
      />
      {/* Only real units request a fill; inert slots must never call push(). */}
      {decision.unitId && (
        <Script id={`${insId}-push`} strategy="afterInteractive">
          {pushScriptFor(insId)}
        </Script>
      )}
    </>
  )
}
