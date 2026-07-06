import { Fragment } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import type { FeedItem } from '@/types/content'

import { ArticleCard } from './ArticleCard'

/**
 * FeedList — chronological broadsheet feed (design direction §3.4): hairline
 * dividers between rows, no cards, no shadows. Optionally injects a labelled
 * AdSlot after every 4th row — default frequency, configurable later per
 * region (PROJECT_BRIEF 6.2). An ad is never placed after the final row.
 */

const AD_FREQUENCY = 4

interface FeedListProps {
  items: FeedItem[]
  /** Inject an in-feed AdSlot after every 4th item. */
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
          {withAds && (index + 1) % AD_FREQUENCY === 0 && index < items.length - 1 && (
            <AdSlot variant="feed" />
          )}
        </Fragment>
      ))}
    </div>
  )
}
