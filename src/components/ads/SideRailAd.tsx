import { adsenseAt, type AdDecision } from '@/lib/ads/engine-core'
import { AD_PREVIEW } from '@/lib/ads/preview'

import { AdPreviewBox } from './AdPreviewBox'
import { AdSenseUnit } from './AdSenseUnit'
import { AmazonProductAd } from './AmazonProductAd'
import { RailAdReveal } from './RailAdReveal'

/**
 * SideRailAd — the v2.2 desktop-only sticky rail ad column (design direction
 * v2.2): a 300px ad column beside the centered max-w-2xl feed on home +
 * category pages (Facebook right-rail pattern). Renders the engine's 'rail'
 * decision (engine-core AD_PLACEMENTS — planned again since v2.2).
 *
 * v2.3 (owner R1: mix AdSense + Amazon on every page): the rail is now the
 * home/category page's AMAZON surface — the engine marks it network 'amazon'
 * (a single product via AmazonProductAd), so a page with no article-below slot
 * still shows both networks. SideRailAd is server-rendered (mounted only by the
 * server home/category pages), so it can render the server-only AmazonProductAd
 * directly — the same ArticleAdSlot dispatch pattern, kept OUT of the client
 * feed bundle. When the engine has no Amazon decision (no partnerTag for the
 * marketplace) the rail degrades to the AdSense treatment below.
 *
 * - **Desktop only:** the whole column is `hidden lg:block` — below lg the
 *   markup exists but is display:none and, critically, its <ins> is NEVER
 *   pushed to adsbygoogle: both push paths (AdSenseUnit's inline script and
 *   pushNewAdSlots) carry the offsetParent/width>0 visibility guard, so
 *   hidden inventory requests no fill. Mobile stays byte-identical: no
 *   sidebar, no push, no CLS. If the viewport later crosses lg (rotation /
 *   resize), RailAdReveal re-runs the guarded, idempotent push so the
 *   now-visible slot fills exactly once.
 * - **Sticky:** `top-[72px]` clears the 56px pinned chip nav (Header v2 §3.2)
 *   plus a 16px breathing gap; the card stays in view while the feed scrolls.
 * - **v2 §4.4 slot ethics unchanged:** fixed 24px „Publicitate” label row,
 *   ALWAYS rendered; height reserved via classes BEFORE any script (zero
 *   CLS); unitless (AdSense review pending) ⇒ a flat empty reserved field —
 *   no fake content, no shimmer.
 * - **Reserved height per config format:** default '300x600' skyscraper ⇒
 *   648px shell (24 label + 600 unit + 24 padding); a site-config row set to
 *   'rectangle'/'300x250' ⇒ 298px shell (24 + 250 + 24). Same bg
 *   `surface-2` / 1px `border` / radius 14px recipe as the article slots.
 *
 * /cautare stays ad-free (v2.1 §8.8): the search page never builds an ad
 * plan, so it can never mount this component.
 */

/** Formats that reserve the short 300×250 shell; everything else gets 300×600. */
const SHORT_FORMATS = new Set(['rectangle', '300x250'])

export function SideRailAd({
  decision,
  variant = 0,
}: {
  decision?: AdDecision
  /**
   * House-set rotation index (owner fix round): the page passes a variant that
   * lands the sticky rail on a DIFFERENT product than the page's first in-feed
   * Amazon slot, so the rail and the feed never show the same product on first
   * paint. Ignored on the live Creators-API path.
   */
  variant?: number
}) {
  // Amazon rail (R1): a single sticky product card, desktop-only. The
  // AmazonProductAd renders its own labelled „Publicitate" card + Associate
  // disclosure, so the column just provides the sticky 300px frame.
  if (decision?.network === 'amazon' && decision.amazon) {
    return (
      <div className="hidden w-[300px] shrink-0 pt-6 lg:block" data-testid="side-rail">
        <div className="sticky top-[72px]">
          <AmazonProductAd decision={decision.amazon} variant={variant} />
        </div>
      </div>
    )
  }

  const adsense = adsenseAt(decision, 0)
  // No rail decision (legacy config / engine fallback) ⇒ nothing to reserve.
  if (!adsense) return null

  const short = SHORT_FORMATS.has(adsense.format.trim().toLowerCase())

  return (
    <div className="hidden w-[300px] shrink-0 pt-6 lg:block" data-testid="side-rail">
      <aside
        aria-label="Publicitate"
        className={`sticky top-[72px] flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface-2 ${
          short ? 'h-[298px]' : 'h-[648px]'
        }`}
      >
        <p className="flex h-6 shrink-0 items-center justify-center font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Publicitate
        </p>
        {AD_PREVIEW && !adsense.unitId ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <AdPreviewBox size={short ? '300 × 250' : '300 × 600'} />
          </div>
        ) : (
          <RailAdReveal className="flex min-h-0 flex-1 flex-col justify-center">
            <AdSenseUnit
              decision={adsense}
              className={short ? 'h-[250px] max-w-[300px]' : 'h-[600px] max-w-[300px]'}
            />
          </RailAdReveal>
        )}
      </aside>
    </div>
  )
}
