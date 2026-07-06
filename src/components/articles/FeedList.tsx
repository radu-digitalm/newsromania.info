import { Fragment } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import { decisionFor, feedAdPositions, type AdPlan } from '@/lib/ads/engine'
import type { FeedItem } from '@/types/content'

import { ArticleCard } from './ArticleCard'

/**
 * FeedList — chronological broadsheet feed (design direction §3.4): hairline
 * dividers between rows, no cards, no shadows. When given an AdPlan (computed
 * server-side per request by the ad engine — architecture.md §4), it injects
 * labelled in-feed AdSlots at region-frequency positions: after rows n, 2n,
 * 3n (everyNth from site-config adFrequency, e.g. UK 3 / RO 5 / default 4),
 * capped at 3 per page, never after the final row (PROJECT_BRIEF §6.2).
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
    <div>
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
