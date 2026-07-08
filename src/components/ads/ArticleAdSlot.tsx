import { networkForOrdinal, type AdDecision } from '@/lib/ads/engine-core'

import { AdSlot } from './AdSlot'
import { AmazonProductAd } from './AmazonProductAd'

/**
 * ArticleAdSlot — SERVER-ONLY dispatch wrapper for an article ad box.
 *
 * Split from AdSlot in v2.1 (§8.9): the social stream renders AdSlot inside
 * the FeedStream client component, and AmazonProductAd is an async server
 * component on top of lib/ads/amazon.ts (node:crypto + Redis) — it must stay
 * OUT of the client bundle. Article pages (server components) render this
 * wrapper.
 *
 * Owner v2.4 — 2 AdSense : 1 Amazon EVERYWHERE: the network is decided by the
 * slot's 0-based `ordinal` across the article surface via networkForOrdinal()
 * (every 3rd → amazon), NOT by the placement. The article page numbers its ad
 * boxes 0 (article-end), then the „Mai multe știri” boxes continue from 1 — so
 * the pattern reads adsense, adsense, amazon. An amazon-ordinal box renders the
 * real product ONLY when the engine resolved an AmazonDecision (partnerTag
 * matches the marketplace); otherwise it degrades to the AdSense box (never an
 * empty Amazon box).
 */
export function ArticleAdSlot({
  decision,
  ordinal = 0,
  index = 0,
}: {
  decision?: AdDecision
  /** 0-based ordinal across the article surface — decides adsense vs amazon. */
  ordinal?: number
  /** AdSense unit-rotation position (only used on the AdSense branch). */
  index?: number
}) {
  if (networkForOrdinal(ordinal) === 'amazon' && decision?.amazon) {
    return <AmazonProductAd decision={decision.amazon} />
  }
  return <AdSlot variant="article" decision={decision} index={index} />
}
