import { createHash } from 'node:crypto'

import { getRedis, rkey } from '@/lib/redis'

import type { AmazonDecision } from './engine-core'
import { houseProductsForMarketplace } from './house-amazon-products'
import { productMatchesCategory } from './house-category'
import { AMAZON_HOUSE_ADS } from './preview'

/**
 * Amazon Creators API product search (architecture.md §4, PROJECT_BRIEF §6.4).
 *
 * Wraps the vendored official SDK (`vendor/creatorsapi-nodejs-sdk`, `file:`
 * dep) around ONE rule: the API is NEVER called per page view. Every lookup
 * goes through a Redis read-through cache:
 *
 *   newsromania:amazon:<marketplace>:<sha1(keywords|count|tag)>        TTL 24h
 *   newsromania:amazon-stale:<marketplace>:<sha1(...)>                 TTL 7d
 *
 * The stale copy implements stale-while-error (§6.4: "The API throttles"):
 * a throttle/auth/network failure serves the last good result for up to 7
 * days; with no stale copy the result is [] and the slot renders
 * reserved-empty — an ad must never take a page down.
 *
 * Credentials come ONLY from env (AMAZON_CREATORS_CREDENTIAL_ID/SECRET/
 * VERSION=3.2 — EU region, LWA auth; the SDK picks the LWA token endpoint
 * from the version string). They are never logged.
 *
 * Marketplace ('www.amazon.de', …) and partnerTag arrive from the ad engine's
 * AmazonDecision — the tag MUST match the marketplace (engine enforces via
 * site-config amazonPartnerTags). A tag/marketplace mismatch is rejected by
 * Amazon with an error → same graceful [] path.
 */

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

// AmazonProduct/AmazonProductImage live in the client-bundle-safe
// amazon-product.ts (the wire shape the /api/feed batch serializes and the
// client card renders); re-exported here so amazon.ts's API is unchanged.
export type { AmazonProduct, AmazonProductImage } from './amazon-product'
import type { AmazonProduct } from './amazon-product'

export interface SearchProductsInput {
  /** Engine keywords, strongest first — the FIRST phrase is the search query. */
  keywords: string[]
  /** e.g. 'www.amazon.de' — passed as the SDK's x-marketplace value. */
  marketplace: string
  /** Associates tracking id valid for that marketplace. */
  partnerTag: string
  /** Products to return (1–3 render; API asks for exactly this). */
  count?: number
}

export const AMAZON_CACHE_TTL_SEC = 24 * 60 * 60 // fresh: 24h
export const AMAZON_STALE_TTL_SEC = 7 * 24 * 60 * 60 // stale-while-error: 7d
export const DEFAULT_PRODUCT_COUNT = 3

/** Resources requested from searchItems — exactly what the ad renders. */
export const SEARCH_RESOURCES = [
  'images.primary.medium',
  'itemInfo.title',
  'offersV2.listings.price',
] as const

// ---------------------------------------------------------------------------
// Affiliate URL — verify/attach the partner tag
// ---------------------------------------------------------------------------

/**
 * The Creators API's detailPageURL normally already carries `tag=<partnerTag>`
 * — verify, and if absent (or unparseable) attach it ourselves so no affiliate
 * click is ever untagged. An existing tag is preserved (Amazon set it for this
 * credential; overriding could mis-attribute).
 */
export function withPartnerTag(url: string, partnerTag: string): string {
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.get('tag')) {
      parsed.searchParams.set('tag', partnerTag)
    }
    return parsed.toString()
  } catch {
    // Not an absolute URL — never emit an untagged affiliate link.
    return ''
  }
}

// ---------------------------------------------------------------------------
// SDK response mapping (plain-JSON shapes of the SDK models)
// ---------------------------------------------------------------------------

interface SdkImageSize {
  url?: string
  width?: number
  height?: number
}

interface SdkItem {
  asin?: string
  detailPageURL?: string
  images?: { primary?: { medium?: SdkImageSize } }
  itemInfo?: { title?: { displayValue?: string } }
  offersV2?: { listings?: Array<{ price?: { money?: { displayAmount?: string } } }> }
}

interface SdkSearchResponse {
  searchResult?: { items?: SdkItem[] }
}

export function mapItems(
  response: SdkSearchResponse,
  partnerTag: string,
  count: number,
): AmazonProduct[] {
  const items = response?.searchResult?.items ?? []
  const products: AmazonProduct[] = []
  for (const item of items) {
    if (products.length >= count) break
    const title = item?.itemInfo?.title?.displayValue
    const url = item?.detailPageURL ? withPartnerTag(item.detailPageURL, partnerTag) : ''
    if (!item?.asin || !title || !url) continue // never render an untagged/untitled product
    const medium = item.images?.primary?.medium
    const image =
      medium?.url && medium.width && medium.height
        ? { url: medium.url, width: medium.width, height: medium.height }
        : undefined
    const price = item.offersV2?.listings?.[0]?.price?.money?.displayAmount
    products.push({ asin: item.asin, title, url, image, price })
  }
  return products
}

// ---------------------------------------------------------------------------
// SDK client (lazy singleton — credentials from env, never logged)
// ---------------------------------------------------------------------------

interface CreatorsApi {
  searchItems(
    marketplace: string,
    opts: { searchItemsRequestContent: Record<string, unknown> },
  ): Promise<SdkSearchResponse>
}

let apiSingleton: CreatorsApi | null = null

async function getCreatorsApi(): Promise<CreatorsApi> {
  if (apiSingleton) return apiSingleton
  const credentialId = process.env.AMAZON_CREATORS_CREDENTIAL_ID
  const credentialSecret = process.env.AMAZON_CREATORS_CREDENTIAL_SECRET
  const version = process.env.AMAZON_CREATORS_CREDENTIAL_VERSION
  if (!credentialId || !credentialSecret || !version) {
    throw new Error('Amazon Creators API credentials are not configured')
  }
  // Dynamic import: the CJS SDK (superagent & co.) is loaded only when a
  // product ad actually resolves — tests mock this module path.
  const sdk = await import('@amzn/creatorsapi-nodejs-sdk')
  const client = new sdk.ApiClient()
  client.credentialId = credentialId
  client.credentialSecret = credentialSecret
  // '3.2' = EU region, LWA auth — the SDK derives the LWA token endpoint
  // and Bearer header format from this string (vendor README).
  client.version = version
  apiSingleton = new sdk.DefaultApi(client) as CreatorsApi
  return apiSingleton
}

/** Test hook: drop the memoized SDK client (e.g. after changing env). */
export function resetAmazonClient(): void {
  apiSingleton = null
}

// ---------------------------------------------------------------------------
// searchProducts — cached, throttle-aware
// ---------------------------------------------------------------------------

function cacheHash(keywords: string[], count: number, partnerTag: string): string {
  return createHash('sha1')
    .update(`${keywords.join('|')}::${count}::${partnerTag}`)
    .digest('hex')
}

function parseProducts(raw: string | null): AmazonProduct[] | null {
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AmazonProduct[]) : null
  } catch {
    return null
  }
}

/**
 * Product lookup for an AmazonDecision. Order of resort:
 *  1. fresh Redis cache (24h) — the normal per-view path, zero API calls;
 *  2. live searchItems call → cache fresh + stale copies;
 *  3. on ANY error (throttle 429, tag/marketplace rejection, auth, network):
 *     last stale copy (≤7d) else [].
 * Never throws. [] ⇒ the slot renders its reserved-empty state.
 */
export async function searchProducts({
  keywords,
  marketplace,
  partnerTag,
  count = DEFAULT_PRODUCT_COUNT,
}: SearchProductsInput): Promise<AmazonProduct[]> {
  const query = keywords.map((keyword) => keyword.trim()).filter(Boolean)[0]
  if (!query || !marketplace || !partnerTag) return []

  const hash = cacheHash(keywords, count, partnerTag)
  const freshKey = rkey('amazon', marketplace, hash)
  const staleKey = rkey('amazon-stale', marketplace, hash)
  const redis = getRedis()

  // 1. Fresh cache — Redis failures fall through to the API path.
  try {
    const hit = parseProducts(await redis.get(freshKey))
    if (hit !== null) return hit
  } catch {
    // ignore — treat as cache miss
  }

  // 2. Live call (rate-limited API — only ever on cache expiry).
  try {
    const api = await getCreatorsApi()
    const response = await api.searchItems(marketplace, {
      searchItemsRequestContent: {
        partnerTag,
        keywords: query,
        itemCount: count,
        resources: [...SEARCH_RESOURCES],
      },
    })
    const products = mapItems(response, partnerTag, count)
    try {
      const json = JSON.stringify(products)
      await redis.set(freshKey, json, 'EX', AMAZON_CACHE_TTL_SEC)
      await redis.set(staleKey, json, 'EX', AMAZON_STALE_TTL_SEC)
    } catch {
      // cache write failures are non-fatal
    }
    return products
  } catch (error) {
    // 3. Stale-while-error: throttle (429) / rejection / network → last good.
    const status = (error as { status?: number })?.status
    console.warn(
      `[amazon] searchItems failed (${marketplace}${status ? `, HTTP ${status}` : ''}) — serving stale/empty`,
    )
    try {
      const stale = parseProducts(await redis.get(staleKey))
      if (stale !== null) return stale
    } catch {
      // fall through to []
    }
    return []
  }
}

// ---------------------------------------------------------------------------
// Render-path guard — ads never block a page
// ---------------------------------------------------------------------------

export const SEARCH_TIMEOUT_MS = 800

/**
 * searchProducts with a hard render budget (default 800ms): past the budget
 * (or on any unexpected throw) the slot gets [] and renders reserved-empty —
 * the response is virtually instant on the 24h cache path anyway. The
 * abandoned lookup still completes in the background and warms the cache for
 * the next request.
 */
export async function searchProductsWithTimeout(
  input: SearchProductsInput,
  timeoutMs: number = SEARCH_TIMEOUT_MS,
): Promise<AmazonProduct[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<AmazonProduct[]>((resolve) => {
    timer = setTimeout(() => resolve([]), timeoutMs)
  })
  try {
    return await Promise.race([searchProducts(input), timeout])
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Single-product resolver — the always-on house fallback (owner fix round)
// ---------------------------------------------------------------------------

/**
 * Order the marketplace's house set for selection (owner fix round: VARIETY +
 * "based on cookies + content"). Products whose department matches the
 * decision's `preferredCategories` come FIRST, grouped in preferred order
 * (strongest interest → page category), each group in catalog order; every
 * remaining product follows. Then the caller picks orderedPool[variant % len],
 * so:
 *   - consecutive slots (variant 0,1,2,…) show DIFFERENT products until the
 *     whole set is exhausted (no repeat) — fixes the single-product complaint;
 *   - the visitor's top-interest / the page category leads the rotation —
 *     personalization "based on cookies + content".
 * With no preferences the order is the plain catalog order (pure rotation).
 * Pure + deterministic: same (set, preferences) ⇒ same order every render.
 */
export function orderedHouseSet(
  set: readonly AmazonProduct[],
  preferredCategories: readonly string[] | undefined,
): AmazonProduct[] {
  if (!preferredCategories || preferredCategories.length === 0) return [...set]
  const chosen = new Set<AmazonProduct>()
  const ordered: AmazonProduct[] = []
  for (const slug of preferredCategories) {
    for (const product of set) {
      if (chosen.has(product)) continue
      if (productMatchesCategory(product.category, slug)) {
        chosen.add(product)
        ordered.push(product)
      }
    }
  }
  for (const product of set) {
    if (!chosen.has(product)) ordered.push(product)
  }
  return ordered
}

/**
 * Resolve ONE product for an AmazonDecision — the single source of truth used
 * by every Amazon surface (the SSR AmazonProductAd component AND the /api/feed
 * batch serializer for the infinite scroll), so a feed ad-post and an
 * article-below box always pick the product the same way:
 *
 *   1. the live Creators API product (searchProductsWithTimeout — Redis-cached,
 *      800ms budget). Once the Associates account is eligible this wins.
 *   2. while the live API returns nothing (AssociateNotEligible), a geo-matched
 *      SiteStripe HOUSE bestseller for decision.marketplace — a REAL affiliate
 *      product with the marketplace-correct partner tag. VARIETY + PERSONALIZED:
 *      the marketplace set is ordered by decision.preferredCategories (CDP
 *      top-interest / page category) then rotated by `variant`, so consecutive
 *      slots differ and the visitor's interest leads. Always-on, gated ONLY by
 *      AMAZON_HOUSE_ADS (default on), independent of AD_PREVIEW.
 *   3. undefined ⇒ the caller renders its reserved-empty „Publicitate" box.
 *
 * Never throws (searchProductsWithTimeout already swallows). Server-only
 * (Redis/SDK); the client receives the resolved product as serialized JSON.
 */
export async function resolveAmazonProduct(
  decision: AmazonDecision,
  /**
   * House-set rotation index (owner fix round): each Amazon SLOT passes its own
   * index so slot k shows a DIFFERENT product from slot k−1 — the rail, article
   * box, MoreNews and every feed slot each get a distinct variant, so no two
   * visible Amazon slots repeat until the (now large) catalog is exhausted.
   * Combined with `preferredCategories` (personalized ordering) the selection is
   * deterministic given (visitor→preferences, variant) so SSR and the client
   * /api/feed batches render identically. Ignored on the LIVE path.
   */
  variant = 0,
): Promise<AmazonProduct | undefined> {
  const live = await searchProductsWithTimeout({
    keywords: decision.keywords,
    marketplace: decision.marketplace,
    partnerTag: decision.partnerTag,
    count: 1,
  })
  if (live[0]) return live[0]
  if (AMAZON_HOUSE_ADS) {
    const set = houseProductsForMarketplace(decision.marketplace)
    if (set.length === 0) return undefined
    const ordered = orderedHouseSet(set, decision.preferredCategories)
    const index = Number.isFinite(variant) && variant >= 0 ? Math.floor(variant) : 0
    return ordered[index % ordered.length]
  }
  return undefined
}
