import type { AdDecision } from '@/lib/ads/engine-core'

import { AdSlot } from './AdSlot'
import { AmazonProductAd } from './AmazonProductAd'

/**
 * ArticleAdSlot — SERVER-ONLY dispatch wrapper for the article placements
 * ('article' / 'article-end'), the only ones the engine can mark as amazon
 * (engine-core AMAZON_PLACEMENTS).
 *
 * Split from AdSlot in v2.1 (§8.9): the social stream renders AdSlot inside
 * the FeedStream client component, and AmazonProductAd is an async server
 * component on top of lib/ads/amazon.ts (node:crypto + Redis) — it must stay
 * OUT of the client bundle. Feed/leaderboard slots keep using AdSlot
 * directly; article pages (server components) render this wrapper and keep
 * the exact v2 behavior: network 'amazon' → real product ads, anything else
 * → the reserved AdSense treatment.
 */
export function ArticleAdSlot({ decision }: { decision?: AdDecision }) {
  // Amazon placements keep their own reserved treatment (same footprint).
  if (decision?.network === 'amazon' && decision.amazon) {
    return <AmazonProductAd decision={decision.amazon} />
  }
  return <AdSlot variant="article" decision={decision} />
}
