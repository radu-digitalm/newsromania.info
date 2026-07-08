import { Fragment, type ReactNode } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import { AmazonProductCard } from '@/components/ads/AmazonProductCard'
import type { AmazonProduct } from '@/lib/ads/amazon-product'
import {
  decisionFor,
  feedAdPositions,
  networkForOrdinal,
  type AdDecision,
  type AdPlan,
} from '@/lib/ads/engine-core'
import type { FeedCardItem, FeedItem } from '@/types/content'

import { PostCard } from './PostCard'

/**
 * v2.1 „Flux Social” stream (design direction v2.1 §8.2/§8.9) — the card grid
 * is retired from the feed routes: ONE centered single-column stream of
 * PostCards at every width (the page shell owns the max-w-2xl column and the
 * canvas-dim backdrop). Inter-card gap: 8px of visible canvas <640px (the gap
 * IS the divider — cards are edge-to-edge there), 16px ≥640px.
 *
 * PostBatch is the ONE list renderer (§8.9): used by the SSR page-1 tree
 * (server) AND by FeedStream's client batches — byte-identical interleaving.
 * Ad-posts land at engine positions from feedAdPositions(everyNth, length):
 * after items n, 2n, 3n per batch of 10 (v2.2: every 3rd post for ALL
 * regions — owner-tunable per region in site-config adFrequency, capped 3,
 * never after the batch's final item) — SERVER-decided per request, identical
 * mechanics to v2. Unit rotation keys on the ad's 0-based ordinal across the
 * WHOLE stream via `adOrdinalStart` (§8.6) — page 1 renders ordinals 0…k−1,
 * client batches continue from k.
 *
 * Owner v2.4 — 2 AdSense : 1 Amazon in the feed: each ad-post's network is
 * decided by its 0-based stream ordinal via networkForOrdinal() (every 3rd →
 * amazon). Amazon products are server-only, so the SERVER (SSR page 1 + the
 * /api/feed route) resolves them and passes the serialized cards via
 * `amazonProducts` (keyed by ordinal); an amazon-ordinal slot renders the
 * client-safe AmazonProductCard from that data, and degrades to the AdSense
 * <AdSlot> if no product resolved (never an empty Amazon box). AdSense slots
 * stay <AdSlot variant="feed"> with deterministic unit rotation by ordinal.
 *
 * Only pure engine helpers + client-safe components are imported (the
 * AmazonProductCard is presentational — no server code), so this module
 * compiles into the client bundle unchanged.
 */

export interface PostBatchProps {
  /** FeedItem is assignable — client batches pass the body-less wire shape. */
  items: FeedCardItem[]
  /** In-feed frequency from the server AdPlan; 0/undefined ⇒ no ads (search). */
  everyNth?: number
  /** The plan's single 'feed' decision (decisionFor(plan, 'feed')). */
  feedDecision?: AdDecision
  /** 0-based ordinal of this batch's FIRST ad across the whole stream (§8.6). */
  adOrdinalStart?: number
  /**
   * Serialized Amazon products for this batch's amazon-ordinal ad-posts (owner
   * v2.4), keyed by 0-based stream ordinal — resolved server-side (SSR page 1 +
   * /api/feed). A missing key ⇒ the amazon slot degrades to AdSense.
   */
  amazonProducts?: Record<number, AmazonProduct>
  headingAs?: 'h2' | 'h3'
  /** Render this item id as the 'featured' post variant (§8.5c). */
  featuredFirstId?: string
  /**
   * Home page 1 only (§8.3.5): a stream interlude (the „Cele mai citite”
   * strip-post) inserted after the Nth CONTENT post — ad-posts excluded from
   * the count; an ad triggered by the same post renders first, then the
   * interlude. Never repeated in client batches, never on ?page≥2.
   */
  interludeAfter?: number
  interlude?: ReactNode
}

export function PostBatch({
  items,
  everyNth = 0,
  feedDecision,
  adOrdinalStart = 0,
  amazonProducts,
  headingAs = 'h3',
  featuredFirstId,
  interludeAfter,
  interlude,
}: PostBatchProps) {
  // Sorted so each ad's ordinal is stable — it drives the deterministic
  // AdSense unit rotation (engine adsenseAt()) AND the 2:1 Amazon interleave
  // (networkForOrdinal), SSR and client alike.
  const positions = feedAdPositions(everyNth, items.length)
  const sorted = [...positions].sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-2 sm:gap-4">
      {items.map((item, index) => {
        const isAd = positions.has(index + 1)
        // 0-based ordinal of THIS ad across the whole stream (§8.6) — drives
        // both unit rotation and the ordinal→network choice (owner v2.4).
        const ordinal = adOrdinalStart + sorted.indexOf(index + 1)
        const amazonProduct =
          isAd && networkForOrdinal(ordinal) === 'amazon' ? amazonProducts?.[ordinal] : undefined
        return (
          <Fragment key={item.id}>
            <PostCard
              item={item}
              as={headingAs}
              variant={item.id === featuredFirstId ? 'featured' : 'post'}
            />
            {isAd &&
              // Every 3rd slot (amazon-ordinal) with a resolved product renders
              // the client-safe Amazon card; otherwise the AdSense box. A
              // missing product degrades gracefully to AdSense (no empty box).
              (amazonProduct ? (
                <AmazonProductCard product={amazonProduct} layout="card" />
              ) : (
                <AdSlot variant="feed" decision={feedDecision} index={ordinal} />
              ))}
            {interlude != null && interludeAfter === index + 1 ? interlude : null}
          </Fragment>
        )
      })}
    </div>
  )
}

export interface FeedListProps {
  items: FeedItem[]
  /** Per-request ad plan; omit to render the stream with no ads (search). */
  adPlan?: AdPlan
  /**
   * SSR page-1 Amazon products for the amazon-ordinal feed slots (owner v2.4),
   * keyed by 0-based ordinal — resolved server-side (resolveFeedAmazonProducts)
   * because Amazon is server-only. Page 1 starts at ordinal 0.
   */
  amazonProducts?: Record<number, AmazonProduct>
  /** Heading level for the post titles, matching the page outline. */
  headingAs?: 'h2' | 'h3'
  /** See PostBatchProps — home page 1 „Cele mai citite” strip-post. */
  interludeAfter?: number
  interlude?: ReactNode
}

/**
 * FeedList — kept path/exports/signature for the SSR page-1 call sites
 * (§8.9); now renders the single-column stream by delegating to PostBatch.
 */
export function FeedList({
  items,
  adPlan,
  amazonProducts,
  headingAs = 'h3',
  interludeAfter,
  interlude,
}: FeedListProps) {
  return (
    <PostBatch
      items={items}
      everyNth={adPlan?.everyNth ?? 0}
      feedDecision={adPlan ? decisionFor(adPlan, 'feed') : undefined}
      adOrdinalStart={0}
      amazonProducts={amazonProducts}
      headingAs={headingAs}
      interludeAfter={interludeAfter}
      interlude={interlude}
    />
  )
}
