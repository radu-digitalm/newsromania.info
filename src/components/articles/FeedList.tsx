import { Fragment } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import { decisionFor, feedAdPositions, type AdPlan } from '@/lib/ads/engine'
import type { FeedItem } from '@/types/content'

import { ArticleCard } from './ArticleCard'

/**
 * FeedList — the FULL-WIDTH responsive card grid (design direction v2 §3.1/§3.3.4):
 * 1 column below 640px, 2 at ≥640px, 3 at ≥1024px; no rail, no 8+4 split.
 *
 * When given an AdPlan (computed server-side per request by the ad engine —
 * architecture.md §4), it injects labelled in-feed AdSlot CARDS as ordinary
 * grid cells at region-frequency positions: after rows n, 2n, 3n (everyNth
 * from site-config adFrequency, e.g. UK 3 / RO 5 / default 4), capped at 3
 * per page, never after the final row (PROJECT_BRIEF §6.2). The frequency
 * mechanics are byte-identical to v1 — only the presentation moved from
 * divided rows to grid cells.
 */

interface FeedListProps {
  items: FeedItem[]
  /** Per-request ad plan; omit to render the feed with no ads (e.g. search). */
  adPlan?: AdPlan
  /** Heading level for the item titles, matching the page outline. */
  headingAs?: 'h2' | 'h3'
}

export function FeedList({ items, adPlan, headingAs = 'h3' }: FeedListProps) {
  // Sorted so each slot's ordinal (0-based) is stable — it drives the
  // deterministic AdSense unit rotation inside AdSlot (engine adsenseAt()).
  const positions = adPlan
    ? [...feedAdPositions(adPlan.everyNth, items.length)].sort((a, b) => a - b)
    : []
  const feedDecision = adPlan ? decisionFor(adPlan, 'feed') : undefined

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <ArticleCard item={item} as={headingAs} />
          {positions.includes(index + 1) && (
            <AdSlot variant="feed" decision={feedDecision} index={positions.indexOf(index + 1)} />
          )}
        </Fragment>
      ))}
    </div>
  )
}
