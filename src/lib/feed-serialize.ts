import { siteConfig } from '@/config/site'
import { decisionFor, feedAdPositions, type AdDecision, type AdPlan } from '@/lib/ads/engine-core'
import type { FeedPage } from '@/lib/content'
import type { FeedCardItem, FeedItem } from '@/types/content'

/**
 * Feed-stream contract helpers (design direction v2.1 §8.7–§8.9) — the PURE
 * layer shared by the /api/feed route (server) and FeedStream (client):
 * param validation, the batch response DTO, and the batch interleaving math.
 *
 * Everything here is side-effect free and unit-testable without a request:
 * the only imports are siteConfig and the ads engine's pure helpers. FeedItem
 * is already a JSON-safe plain-data contract (content.ts mappers strip every
 * Payload internal); the wire DTO is FeedCardItem — the ONE extra mapping is
 * dropping the original articles' full `body` (never rendered by the stream,
 * so it would only inflate batches and feed bulk scrapers).
 */

/** Feed window size — mirrors content.ts PAGE_SIZE (fixed contract). */
export const FEED_PAGE_SIZE = 10

/** Upper bound on ?page= — mirrors content.ts MAX_PAGE (fixed contract). */
export const FEED_MAX_PAGE = 100

/** Longest accepted ?q= term (§8.8). */
export const MAX_QUERY_LENGTH = 100

/** Auto-loaded batches before the manual „Încarcă mai multe știri” button (§8.7). */
export const AUTO_LOAD_MAX_BATCHES = 4

// ---------------------------------------------------------------------------
// GET /api/feed params (§8.8)
// ---------------------------------------------------------------------------

/** Structural subset of URLSearchParams — keeps this module DOM-type-free. */
export interface SearchParamsReader {
  get(name: string): string | null
}

export interface FeedParams {
  /** Home / category / search stream selector; category and q are mutually exclusive. */
  category?: string
  q?: string
}

export type ParsedFeedParams = ({ ok: true; page: number } & FeedParams) | { ok: false }

const INVALID: ParsedFeedParams = { ok: false }

/**
 * Validate /api/feed query params (§8.8): page = int 1–100 (required);
 * category must exist in siteConfig.categories; q trimmed, 1–100 chars;
 * category and q together → invalid.
 */
export function parseFeedParams(searchParams: SearchParamsReader): ParsedFeedParams {
  const rawPage = searchParams.get('page')
  if (rawPage === null || !/^\d+$/.test(rawPage.trim())) return INVALID
  const page = Number.parseInt(rawPage, 10)
  if (!Number.isInteger(page) || page < 1 || page > FEED_MAX_PAGE) return INVALID

  const rawCategory = searchParams.get('category')
  const rawQ = searchParams.get('q')
  if (rawCategory !== null && rawQ !== null) return INVALID

  if (rawCategory !== null) {
    const category = rawCategory.trim()
    if (!siteConfig.categories.some((c) => c.slug === category)) return INVALID
    return { ok: true, page, category }
  }

  if (rawQ !== null) {
    const q = rawQ.trim()
    if (q.length < 1 || q.length > MAX_QUERY_LENGTH) return INVALID
    return { ok: true, page, q }
  }

  return { ok: true, page }
}

// ---------------------------------------------------------------------------
// Batch response DTO (§8.8)
// ---------------------------------------------------------------------------

export interface FeedBatchAds {
  everyNth: number
  /** The feed placement's decision only (incl. adsenseUnits for rotation). */
  decisions: AdDecision[]
}

export interface FeedBatchResponse {
  /** Card fields only — the original articles' full `body` never travels. */
  items: FeedCardItem[]
  /** null for q= batches — search is ad-free at every depth (§8.3). */
  ads: FeedBatchAds | null
  hasMore: boolean
  nextPage: number | null
}

/** Wire mapping: strip the original full body — the cards never render it. */
function toCardItem(item: FeedItem): FeedCardItem {
  if (item.type !== 'original') return item
  const { body, ...card } = item
  void body // destructured only to exclude it from the wire shape
  return card
}

/**
 * Assemble the 200 body (§8.8). `adPlan: null` ⇒ ad-free batch (search).
 * hasMore/nextPage respect FEED_MAX_PAGE so the client can never be steered
 * into a page the route would 400.
 */
export function buildFeedBatchResponse({
  page,
  feedPage,
  adPlan,
}: {
  page: number
  feedPage: FeedPage
  adPlan: AdPlan | null
}): FeedBatchResponse {
  const hasMore = feedPage.hasNextPage && page < FEED_MAX_PAGE
  const feedDecision = adPlan ? decisionFor(adPlan, 'feed') : undefined
  return {
    items: feedPage.items.map(toCardItem),
    ads: adPlan
      ? { everyNth: adPlan.everyNth, decisions: feedDecision ? [feedDecision] : [] }
      : null,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  }
}

// ---------------------------------------------------------------------------
// Batch interleaving math (§8.6) — the ONE model used by SSR and client
// ---------------------------------------------------------------------------

export type BatchEntry =
  | { kind: 'post'; item: FeedCardItem }
  | {
      kind: 'ad'
      /** 0-based ordinal across the WHOLE stream — drives adsenseAt() rotation. */ ordinal: number
    }

/** Ad-posts a batch carries: |feedAdPositions(everyNth, itemCount)|. */
export function batchAdCount(everyNth: number, itemCount: number): number {
  return feedAdPositions(everyNth, itemCount).size
}

/**
 * Interleave a batch's posts with its ad-posts at the engine positions
 * (after items n, 2n, 3n — byte-identical placement math to SSR page 1).
 * `everyNth < 1` (e.g. ad-free search batches) yields posts only.
 */
export function batchEntries(
  items: FeedCardItem[],
  everyNth: number,
  adOrdinalStart: number,
): BatchEntry[] {
  const positions = feedAdPositions(everyNth, items.length)
  const entries: BatchEntry[] = []
  let ordinal = adOrdinalStart
  items.forEach((item, index) => {
    entries.push({ kind: 'post', item })
    if (positions.has(index + 1)) {
      entries.push({ kind: 'ad', ordinal })
      ordinal += 1
    }
  })
  return entries
}

// ---------------------------------------------------------------------------
// Client-side plumbing (URLs, cap, aria-live copy) — pure, test-covered
// ---------------------------------------------------------------------------

/** true while batches may still auto-load (pages 2–5); false ⇒ manual button. */
export function shouldAutoLoad(autoLoadedBatches: number): boolean {
  return autoLoadedBatches < AUTO_LOAD_MAX_BATCHES
}

/** /api/feed request URL for a batch. */
export function feedRequestPath(params: FeedParams, page: number): string {
  const query = new URLSearchParams({ page: String(page) })
  if (params.category) query.set('category', params.category)
  if (params.q) query.set('q', params.q)
  return `/api/feed?${query.toString()}`
}

/**
 * The sentinel anchor's href (§8.7/§8.11) — the REAL server-rendered ?page=N
 * link that works with zero JS and advertises the next page to crawlers.
 */
export function nextPageHref(params: FeedParams, page: number): string {
  if (params.category) return `/categorie/${params.category}?page=${page}`
  if (params.q) return `/cautare?q=${encodeURIComponent(params.q)}&page=${page}`
  return `/?page=${page}`
}

/** aria-live copy after a successful append (§8.7 — comma-below diacritics). */
export function loadedAnnouncement(count: number): string {
  return count === 1 ? 'S-a încărcat o știre nouă.' : `S-au încărcat ${count} știri noi.`
}

export const END_OF_FEED_MESSAGE = 'Ai ajuns la finalul fluxului.'
export const LOAD_ERROR_MESSAGE = 'Nu am putut încărca mai multe știri.'
