/**
 * Amazon catalog overlay — the Redis layer that `newsromania-amazon-catalog`
 * (daily) writes and the render path reads. SERVER-ONLY (Redis).
 *
 * Why it exists (owner, iulie 2026): the static house catalog in
 * house-amazon-products.ts was harvested ONCE and nothing ever refreshed it, so
 * products silently rot — delisted ASINs 404, and any displayed price drifts out
 * of Amazon's 24h rule. The daily worker maintains two overlays per marketplace:
 *
 *   1. DEAD SET   — ASINs that returned a hard 404 on two separate days. Filtered
 *      out of the fallback pool so we never render a dead affiliate link.
 *      This is the part that works TODAY (no API access needed).
 *
 *   2. SNAPSHOT   — a fresh, PA-API-sourced product pool per marketplace, WITH
 *      pricing/promotions. Written only once the Associates account clears its
 *      sales gate (searchItems currently answers AssociateNotEligible). Takes
 *      precedence over the static catalog when present.
 *
 * Pricing safety: a snapshot older than SNAPSHOT_PRICING_MAX_AGE_MS has its
 * `pricing` stripped on read, so even a stuck worker can never surface a price
 * past Amazon's 24h window. The snapshot key outlives that (SNAPSHOT_TTL_SEC)
 * because the PRODUCTS stay useful as a fallback long after their PRICES don't.
 */
import { getRedis, rkey } from '@/lib/redis'

import type { AmazonProduct } from './amazon-product'
import { stripPricing } from './amazon-product'

/** Products stay a usable fallback for 2 days; their prices do not (see below). */
export const SNAPSHOT_TTL_SEC = 48 * 60 * 60
/** Amazon's hard rule: displayed pricing must be ≤24h old. */
export const SNAPSHOT_PRICING_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Consecutive daily 404s before an ASIN is considered gone (guards false positives). */
export const DEAD_STRIKE_THRESHOLD = 2
/** Strike counters decay, so a one-off 404 doesn't accumulate across weeks. */
export const STRIKE_TTL_SEC = 3 * 24 * 60 * 60
/** In-process memo: the render path resolves several ad slots per request. */
export const MEMO_TTL_MS = 60_000

export const snapshotKey = (marketplace: string) => rkey('amazon-catalog', marketplace)
export const deadKey = (marketplace: string) => rkey('amazon-dead', marketplace)
export const strikeKey = (marketplace: string, asin: string) =>
  rkey('amazon-strike', marketplace, asin)

export interface CatalogSnapshot {
  /** epoch ms of the PA-API fetch that produced `products`. */
  fetchedAt: number
  products: AmazonProduct[]
}

interface Memo<T> {
  at: number
  value: T
}
const snapshotMemo = new Map<string, Memo<AmazonProduct[] | null>>()
const deadMemo = new Map<string, Memo<Set<string>>>()

function memoGet<T>(store: Map<string, Memo<T>>, key: string): T | undefined {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.value
  return undefined
}

function memoSet<T>(store: Map<string, Memo<T>>, key: string, value: T): T {
  store.set(key, { at: Date.now(), value })
  return value
}

/** Test hook — drop the per-process memo. */
export function resetCatalogMemo(): void {
  snapshotMemo.clear()
  deadMemo.clear()
}

/**
 * The daily PA-API snapshot for a marketplace, or null when none exists (the
 * caller then falls back to the static house catalog). Pricing is stripped once
 * the snapshot passes 24h. Redis failures resolve to null — ads never throw.
 */
export async function readSnapshot(marketplace: string): Promise<AmazonProduct[] | null> {
  const memo = memoGet(snapshotMemo, marketplace)
  if (memo !== undefined) return memo

  let products: AmazonProduct[] | null = null
  try {
    const raw = await getRedis().get(snapshotKey(marketplace))
    if (raw) {
      const parsed = JSON.parse(raw) as CatalogSnapshot
      if (Array.isArray(parsed?.products) && parsed.products.length > 0) {
        const age = Date.now() - (Number(parsed.fetchedAt) || 0)
        products =
          age > SNAPSHOT_PRICING_MAX_AGE_MS ? stripPricing(parsed.products) : parsed.products
      }
    }
  } catch {
    products = null // unparseable / Redis down → static catalog
  }
  return memoSet(snapshotMemo, marketplace, products)
}

/** ASINs the daily link-check confirmed dead. Empty set on any failure. */
export async function readDeadAsins(marketplace: string): Promise<Set<string>> {
  const memo = memoGet(deadMemo, marketplace)
  if (memo !== undefined) return memo

  let dead = new Set<string>()
  try {
    dead = new Set(await getRedis().smembers(deadKey(marketplace)))
  } catch {
    dead = new Set() // Redis down → show everything rather than nothing
  }
  return memoSet(deadMemo, marketplace, dead)
}

/** Worker-side: publish a fresh PA-API pool for a marketplace. */
export async function writeSnapshot(
  marketplace: string,
  products: AmazonProduct[],
  fetchedAt: number = Date.now(),
): Promise<void> {
  if (products.length === 0) return
  const snapshot: CatalogSnapshot = { fetchedAt, products }
  await getRedis().set(snapshotKey(marketplace), JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL_SEC)
}
