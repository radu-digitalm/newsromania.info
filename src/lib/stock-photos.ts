import { createHash } from 'node:crypto'

import { getRedis, rkey } from '@/lib/redis'

/**
 * Royalty-free stock-photo lookup for AI-written ORIGINAL articles
 * (docs/stock-photos.md, image policy). ONLY our own AI stories reach for a
 * stock photo — aggregated items always hotlink the publisher's own image and
 * NEVER touch this module.
 *
 * Provider order is fixed: Pexels first (PEXELS_API_KEY), Pixabay as fallback
 * (PIXABAY_API_KEY). Both are free, owner-provided keys. The returned `url` is
 * a HOTLINK to the provider's CDN by default — we do not download or re-host
 * it (that stays consistent with the aggregated-hotlink rule and keeps the
 * media library "only our stories have our photos").
 *
 * Contract of searchStockPhoto():
 *   - returns the best landscape/large result as
 *     { url, attribution, source, width, height }
 *   - returns null GRACEFULLY when no keys are configured or nothing matches —
 *     it NEVER throws (a missing photo means the post renders imageless, never
 *     a branded placeholder).
 *
 * Every lookup is Redis read-through cached for 24h under
 *   newsromania:stock:<source>:<sha1(query|orientation)>
 * Cache/Redis failures degrade to a live fetch — caching must never break
 * image resolution.
 *
 * ATTRIBUTION & TRADEMARK: API photos REQUIRE visible attribution (rendered by
 * the article image caption) and MUST NOT be used to imply endorsement or to
 * show trademarks/logos in a commercial context. Callers pick neutral,
 * concept-level queries — never a brand or logo name.
 */

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export type StockPhotoSource = 'pexels' | 'pixabay'

export type StockPhotoOrientation = 'landscape' | 'portrait' | 'square'

export interface StockPhoto {
  /** HOTLINK to the provider CDN (never downloaded/re-hosted, per policy). */
  url: string
  /**
   * Human-readable credit line, e.g. "Foto: Jane Doe / Pexels". Rendered as
   * the article image caption — attribution is REQUIRED by both providers.
   */
  attribution: string
  source: StockPhotoSource
  width: number
  height: number
}

export interface SearchStockPhotoInput {
  /**
   * Search phrase — a neutral, concept-level term (never a brand/logo name).
   * Empty/whitespace-only queries resolve to null without any network call.
   */
  query: string
  /** Preferred aspect. Defaults to 'landscape' (lead images are wide). */
  orientation?: StockPhotoOrientation
}

/** 24h — matches the amazon/geo cache convention (architecture.md §4). */
export const STOCK_CACHE_TTL_SEC = 24 * 60 * 60

// ---------------------------------------------------------------------------
// Cache plumbing
// ---------------------------------------------------------------------------

function cacheHash(query: string, orientation: StockPhotoOrientation): string {
  return createHash('sha1').update(`${query}::${orientation}`).digest('hex')
}

async function readCache(source: StockPhotoSource, hash: string): Promise<StockPhoto | null> {
  try {
    const raw = await getRedis().get(rkey('stock', source, hash))
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    return isStockPhoto(parsed) ? parsed : null
  } catch {
    // Redis miss/outage → treat as no cache; the live fetch still runs.
    return null
  }
}

async function writeCache(
  source: StockPhotoSource,
  hash: string,
  photo: StockPhoto,
): Promise<void> {
  try {
    await getRedis().set(
      rkey('stock', source, hash),
      JSON.stringify(photo),
      'EX',
      STOCK_CACHE_TTL_SEC,
    )
  } catch {
    // cache write failures are non-fatal
  }
}

function isStockPhoto(value: unknown): value is StockPhoto {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.url === 'string' &&
    typeof v.attribution === 'string' &&
    (v.source === 'pexels' || v.source === 'pixabay') &&
    typeof v.width === 'number' &&
    typeof v.height === 'number'
  )
}

// ---------------------------------------------------------------------------
// Provider: Pexels (primary)
// ---------------------------------------------------------------------------

const PEXELS_ENDPOINT = 'https://api.pexels.com/v1/search'

interface PexelsPhoto {
  width: number
  height: number
  photographer?: string
  src?: { large2x?: string; large?: string; original?: string }
}

interface PexelsResponse {
  photos?: PexelsPhoto[]
}

/**
 * Pexels search. Requires the raw PEXELS_API_KEY in the Authorization header
 * (NOT a Bearer token — Pexels uses the raw key). Returns null on missing key,
 * non-2xx, empty results, or any network/parse error.
 */
async function searchPexels(
  query: string,
  orientation: StockPhotoOrientation,
): Promise<StockPhoto | null> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return null

  const url = new URL(PEXELS_ENDPOINT)
  url.searchParams.set('query', query)
  url.searchParams.set('orientation', orientation)
  url.searchParams.set('per_page', '1')
  url.searchParams.set('size', 'large')

  try {
    const res = await fetch(url, {
      // Pexels expects the RAW key, not "Bearer <key>".
      headers: { Authorization: apiKey },
    })
    if (!res.ok) return null
    const data = (await res.json()) as PexelsResponse
    const photo = data.photos?.[0]
    if (!photo) return null

    const src = photo.src?.large2x ?? photo.src?.large ?? photo.src?.original
    if (!src) return null

    return {
      url: src,
      attribution: creditLine(photo.photographer, 'Pexels'),
      source: 'pexels',
      width: photo.width,
      height: photo.height,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Provider: Pixabay (fallback)
// ---------------------------------------------------------------------------

const PIXABAY_ENDPOINT = 'https://pixabay.com/api/'

interface PixabayHit {
  imageWidth?: number
  imageHeight?: number
  webformatWidth?: number
  webformatHeight?: number
  user?: string
  largeImageURL?: string
  webformatURL?: string
}

interface PixabayResponse {
  hits?: PixabayHit[]
}

/**
 * Pixabay search (fallback). Key travels as the `key` query param. Same
 * graceful-null contract as Pexels.
 */
async function searchPixabay(
  query: string,
  orientation: StockPhotoOrientation,
): Promise<StockPhoto | null> {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) return null

  const url = new URL(PIXABAY_ENDPOINT)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', query)
  url.searchParams.set('image_type', 'photo')
  // Pixabay uses 'horizontal'/'vertical'/'all' rather than landscape/portrait.
  url.searchParams.set('orientation', pixabayOrientation(orientation))
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('per_page', '3')

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as PixabayResponse
    const hit = data.hits?.[0]
    if (!hit) return null

    const src = hit.largeImageURL ?? hit.webformatURL
    if (!src) return null

    // Prefer the full-image dimensions; fall back to the webformat pair.
    const width = hit.imageWidth ?? hit.webformatWidth ?? 0
    const height = hit.imageHeight ?? hit.webformatHeight ?? 0

    return {
      url: src,
      attribution: creditLine(hit.user, 'Pixabay'),
      source: 'pixabay',
      width,
      height,
    }
  } catch {
    return null
  }
}

function pixabayOrientation(orientation: StockPhotoOrientation): string {
  if (orientation === 'landscape') return 'horizontal'
  if (orientation === 'portrait') return 'vertical'
  return 'all'
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** "Foto: <author> / <Provider>" — falls back to just the provider credit. */
function creditLine(author: string | undefined, provider: string): string {
  const name = author?.trim()
  return name ? `Foto: ${name} / ${provider}` : `Foto: ${provider}`
}

// ---------------------------------------------------------------------------
// searchStockPhoto — cached, Pexels-then-Pixabay
// ---------------------------------------------------------------------------

/**
 * Resolve a royalty-free stock photo for an AI article. Tries Pexels first,
 * then Pixabay; each provider is cached independently for 24h. Returns null —
 * never throws — when no keys are set or nothing matches, in which case the
 * article renders with NO lead image (policy: never a branded placeholder).
 */
export async function searchStockPhoto(input: SearchStockPhotoInput): Promise<StockPhoto | null> {
  const query = input.query.trim()
  if (!query) return null

  const orientation = input.orientation ?? 'landscape'
  const hash = cacheHash(query, orientation)

  // --- Pexels (primary) ---
  const pexelsCached = await readCache('pexels', hash)
  if (pexelsCached) return pexelsCached
  const pexels = await searchPexels(query, orientation)
  if (pexels) {
    await writeCache('pexels', hash, pexels)
    return pexels
  }

  // --- Pixabay (fallback) ---
  const pixabayCached = await readCache('pixabay', hash)
  if (pixabayCached) return pixabayCached
  const pixabay = await searchPixabay(query, orientation)
  if (pixabay) {
    await writeCache('pixabay', hash, pixabay)
    return pixabay
  }

  // No key, no match, or every provider errored → imageless (graceful).
  return null
}
