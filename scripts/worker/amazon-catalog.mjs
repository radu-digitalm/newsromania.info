/**
 * newsromania-amazon-catalog — DAILY refresh of the Amazon fallback catalog,
 * for every marketplace (owner, iulie 2026).
 *
 * Why: house-amazon-products.ts was harvested ONCE and nothing ever refreshed
 * it, so products rot — delisted ASINs 404 and any displayed price drifts past
 * Amazon's 24h rule. This worker maintains the Redis overlay that
 * src/lib/ads/amazon-catalog.ts reads at render time. Two modes, auto-selected
 * per marketplace:
 *
 *  A. PA-API REFRESH (once the Associates account is sales-eligible). Searches
 *     the marketplace's own departments, publishes a fresh product pool WITH
 *     price / savings / deal badge, and stamps it `fetchedAt` so the render path
 *     can drop the pricing the moment it passes 24h. This is what makes
 *     promotions displayable at all — PA-API is the only source Amazon permits.
 *
 *  B. LINK CHECK (today: searchItems answers AssociateNotEligible). GETs each
 *     static ASIN's clean /dp/ URL and records a strike on a hard 404. Two
 *     strikes on separate days ⇒ the ASIN joins the dead set and is filtered out
 *     of the fallback pool. Anything else (403/429/5xx/network) is INCONCLUSIVE
 *     and changes nothing — a captcha page must never prune the catalog.
 *
 * Politeness / honesty: the link check uses a truthful, contactable user-agent
 * (verified: real ASIN → 200, bogus ASIN → 404), hits the UNTAGGED /dp/ URL so
 * we never generate self-clicks on our own affiliate links, and sleeps between
 * requests. It reads the status code only — it does not scrape page content, and
 * in particular it never re-harvests prices (that would be the very violation
 * this change exists to fix).
 *
 *   npx payload run scripts/worker/amazon-catalog.mjs
 *   npx payload run scripts/worker/amazon-catalog.mjs -- --dry-run
 *   npx payload run scripts/worker/amazon-catalog.mjs -- --only=www.amazon.de
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { fetchProductsLive } from '../../src/lib/ads/amazon.ts'
import {
  DEAD_STRIKE_THRESHOLD,
  STRIKE_TTL_SEC,
  deadKey,
  strikeKey,
  writeSnapshot,
} from '../../src/lib/ads/amazon-catalog.ts'
import { HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE } from '../../src/lib/ads/house-amazon-products.ts'
import { getRedis } from '../../src/lib/redis.ts'

/** Contactable + truthful. Amazon answers it 200/404 like any other client. */
const USER_AGENT = 'newsromania-linkcheck/1.0 (+https://newsromania.info)'
/** PA-API is ~1 req/s for a new account; stay under it. */
const API_DELAY_MS = 1200
/** Link check: one product page every 1.5s is well below anything abusive. */
const LINK_DELAY_MS = 1500
const HTTP_TIMEOUT_MS = 15_000
/** Products asked per department, and the floor below which we don't publish. */
const PER_CATEGORY = 3
const MIN_SNAPSHOT_PRODUCTS = 6
/** Self-limit so a hung marketplace can't outlive the systemd timeout. */
const MAX_RUNTIME_MS = 9 * 60_000

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const ONLY = (argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] || null

const startedAt = Date.now()
const log = (msg) => console.log(`[amazon-catalog] ${msg}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const outOfTime = () => Date.now() - startedAt > MAX_RUNTIME_MS

/**
 * The vendored SDK rejects with a PLAIN OBJECT, not an Error, so String(e) is
 * "[object Object]". This log line is how the owner finds out the API flipped
 * from AssociateNotEligible to eligible — it has to be readable.
 */
function errMsg(e) {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const status = e.status ?? e.statusCode
    const body = e.body ?? e.response?.body ?? e.error ?? e.message
    const detail = typeof body === 'string' ? body : body ? JSON.stringify(body) : ''
    const summary = [status ? `HTTP ${status}` : '', detail].filter(Boolean).join(' ').trim()
    return (summary || JSON.stringify(e)).slice(0, 300)
  }
  return String(e)
}

/** Per-marketplace Associates tag, straight from site-config (no ads:config cache). */
async function loadPartnerTags(payload) {
  const config = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  const tags = new Map()
  for (const row of config.adNetworks?.amazonPartnerTags ?? []) {
    if (row?.marketplace && row?.tag) tags.set(row.marketplace.trim().toLowerCase(), row.tag.trim())
  }
  return tags
}

/** The departments this marketplace's static catalog covers — the search seeds. */
function departmentsFor(marketplace) {
  const set = HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[marketplace] ?? []
  return [...new Set(set.map((p) => p.category).filter(Boolean))]
}

/**
 * Mode A. Returns a fresh product pool, or null if the API is unavailable
 * (AssociateNotEligible / throttled / auth) — the caller then link-checks.
 */
async function refreshViaApi(marketplace, partnerTag) {
  const departments = departmentsFor(marketplace)
  if (departments.length === 0) return null

  const products = []
  for (const department of departments) {
    if (outOfTime()) break
    // First failure decides the mode — don't hammer a gated API 4 more times.
    const batch = await fetchProductsLive({
      keywords: [department],
      marketplace,
      partnerTag,
      count: PER_CATEGORY,
    })
    for (const product of batch) products.push({ ...product, category: department })
    await sleep(API_DELAY_MS)
  }

  if (products.length < MIN_SNAPSHOT_PRODUCTS) {
    log(`  ${marketplace}: API returned only ${products.length} products — snapshot not published`)
    return null
  }
  // Dedup by ASIN (a product can rank in two departments).
  const unique = [...new Map(products.map((p) => [p.asin, p])).values()]
  const priced = unique.filter((p) => p.pricing).length
  const promos = unique.filter((p) => p.pricing?.savings || p.pricing?.dealBadge).length

  if (DRY_RUN) {
    log(
      `  ${marketplace}: DRY-RUN — would publish ${unique.length} (${priced} priced, ${promos} on promo)`,
    )
    return unique
  }
  await writeSnapshot(marketplace, unique)
  log(
    `  ${marketplace}: ✓ snapshot published — ${unique.length} products, ${priced} priced, ${promos} on promo`,
  )
  return unique
}

/** GET the clean /dp/ URL. 200 → alive, 404 → dead, anything else → unknown. */
async function probeAsin(marketplace, asin) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    const res = await fetch(`https://${marketplace}/dp/${asin}`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    })
    if (res.status === 404) return 'dead'
    if (res.ok) return 'alive'
    return 'unknown'
  } catch {
    return 'unknown'
  } finally {
    clearTimeout(timer)
  }
}

/** Mode B. Strike-based pruning of the static catalog for one marketplace. */
async function linkCheck(marketplace) {
  const redis = getRedis()
  const products = HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[marketplace] ?? []
  const counts = { alive: 0, dead: 0, unknown: 0, pruned: 0, revived: 0 }

  for (const product of products) {
    if (outOfTime()) {
      log(`  ${marketplace}: time budget reached — ${counts.unknown} unchecked`)
      break
    }
    const verdict = await probeAsin(marketplace, product.asin)
    counts[verdict] += 1

    if (DRY_RUN) {
      if (verdict !== 'alive') log(`  ${marketplace}/${product.asin}: ${verdict} (dry-run)`)
      await sleep(LINK_DELAY_MS)
      continue
    }

    try {
      if (verdict === 'dead') {
        const strikes = await redis.incr(strikeKey(marketplace, product.asin))
        await redis.expire(strikeKey(marketplace, product.asin), STRIKE_TTL_SEC)
        if (strikes >= DEAD_STRIKE_THRESHOLD) {
          await redis.sadd(deadKey(marketplace), product.asin)
          counts.pruned += 1
          log(`  ${marketplace}/${product.asin}: 404 ×${strikes} → pruned`)
        } else {
          log(`  ${marketplace}/${product.asin}: 404 (strike ${strikes}/${DEAD_STRIKE_THRESHOLD})`)
        }
      } else if (verdict === 'alive') {
        await redis.del(strikeKey(marketplace, product.asin))
        if ((await redis.srem(deadKey(marketplace), product.asin)) === 1) {
          counts.revived += 1
          log(`  ${marketplace}/${product.asin}: back in stock → un-pruned`)
        }
      }
      // 'unknown' (403 / captcha / 5xx / timeout): deliberately no state change.
    } catch (err) {
      log(`  ${marketplace}/${product.asin}: redis update failed (${errMsg(err)})`)
    }
    await sleep(LINK_DELAY_MS)
  }

  log(
    `  ${marketplace}: link check — ${counts.alive} alive, ${counts.dead} 404, ` +
      `${counts.unknown} inconclusive, ${counts.pruned} pruned, ${counts.revived} revived`,
  )
}

async function main() {
  const payload = await getPayload({ config: configPromise })
  const tags = await loadPartnerTags(payload)

  let marketplaces = Object.keys(HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE)
  if (ONLY) marketplaces = marketplaces.filter((m) => m === ONLY)
  if (marketplaces.length === 0) {
    log(`niciun marketplace de procesat${ONLY ? ` (--only=${ONLY} nu există)` : ''}`)
    return
  }
  log(
    `${marketplaces.length} marketplace(s)${DRY_RUN ? ' — DRY RUN' : ''}: ${marketplaces.join(', ')}`,
  )

  for (const marketplace of marketplaces) {
    if (outOfTime()) {
      log('time budget exhausted — stopping')
      break
    }
    const partnerTag = tags.get(marketplace)
    if (!partnerTag) {
      log(`  ${marketplace}: fără partner tag în site-config — sar peste`)
      continue
    }

    try {
      const snapshot = await refreshViaApi(marketplace, partnerTag)
      if (snapshot) continue // API mode wins; the static catalog is unused here
      log(`  ${marketplace}: API indisponibil → link check`)
    } catch (err) {
      log(`  ${marketplace}: API indisponibil (${errMsg(err)}) → link check`)
    }
    await linkCheck(marketplace)
  }
  log(`gata în ${Math.round((Date.now() - startedAt) / 1000)}s`)
}

try {
  await main()
} catch (err) {
  console.error(`[amazon-catalog] eroare fatală: ${errMsg(err)}`)
  process.exitCode = 1
}
await new Promise((resolve) => process.stdout.write('', resolve))
process.exit(process.exitCode ?? 0)
