import { Fragment } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import type { FeedItem } from '@/types/content'

import { ArticleCard } from './ArticleCard'

/**
 * FeedList — chronological broadsheet feed (design direction §3.4): hairline
 * dividers between rows, no cards, no shadows. Optionally injects a labelled
 * AdSlot at the FIXED positions from §3.3.3/§4.5 — after row 4 and after
 * row 12, never more. An ad is never placed after the final row.
 */

const AD_POSITIONS = new Set([4, 12])

interface FeedListProps {
  items: FeedItem[]
  /** Inject the in-feed AdSlots at the fixed positions (rows 4 and 12). */
  withAds?: boolean
  /** Heading level for the item titles, matching the page outline. */
  headingAs?: 'h2' | 'h3'
}

export function FeedList({ items, withAds = false, headingAs = 'h3' }: FeedListProps) {
  return (
    <div>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <ArticleCard item={item} as={headingAs} />
          {withAds && AD_POSITIONS.has(index + 1) && index < items.length - 1 && (
            <AdSlot variant="feed" />
          )}
        </Fragment>
      ))}
    </div>
  )
}
