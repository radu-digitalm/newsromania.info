/**
 * refresh-aggregated-images — bring aggregated-item images in line with the
 * owner IMAGE POLICY (iulie 2026): aggregated stories may show ONLY a HOTLINK
 * to the source publisher's own image; we NEVER download/store a copy. Any
 * post for which no publisher image can be found shows NO image at all — never
 * a branded category placeholder (placeholders as an image fallback are gone).
 *
 *   npx payload run scripts/maintenance/refresh-aggregated-images.mjs
 *   npx payload run scripts/maintenance/refresh-aggregated-images.mjs -- --dry-run
 *
 * NOTE: `payload run` forwards script args only AFTER a `--` separator (same as
 * scripts/worker/social.mjs) — hence the `--` before `--dry-run` above.
 *
 * ── Pass 1 — refresh imageUrl on non-archived aggregated items ──────────────
 * A candidate is a non-archived aggregated item whose imageUrl is NOT already a
 * clean external publisher hotlink, i.e. it is empty, OR contains '/api/media/'
 * (a downloaded copy in our media library — forbidden by the new policy), OR
 * contains 'newsromania.info/wp-content' (an owner-hosted copy). Clean external
 * hotlinks are skipped, so a re-run is a no-op (idempotent).
 *
 * For each candidate we politely fetch its sourceUrl (the publisher article:
 * 1 request/second, UA 'newsromania-bot/1.0', 12s timeout) and read the
 * publisher's own social-share image from the returned HTML:
 *   1. og:image  (property="og:image" / "og:image:secure_url" / "og:image:url")
 *   2. twitter:image  (name/property "twitter:image" / "twitter:image:src")
 *   3. first large <img> hosted on the publisher's OWN domain (host family of
 *      sourceUrl), junk/icons/trackers skipped.
 * If found → imageUrl = that absolute publisher URL, imageAllowed = true. This
 * is a HOTLINK: we store the URL only and never download the bytes.
 * If not found / fetch fails → imageUrl = '' and imageAllowed = false. The item
 * becomes imageless, which the policy explicitly allows (text-only card).
 *
 * ── Pass 2 — orphan media purge ─────────────────────────────────────────────
 * After Pass 1, the downloaded copies in the `media` collection are no longer
 * referenced. We delete every media doc that is referenced by NO aggregated
 * item (by url == imageUrl, across ALL items incl. archived) AND by NO article
 * (by id == featuredImage). Referential safety is re-verified per doc right
 * before each delete. Owner-uploaded photos for original articles are protected
 * automatically because they are referenced via articles.featuredImage.
 *
 * Both passes are read-only under --dry-run (report what WOULD change, mutate
 * nothing). Logs {recoveredHotlink, clearedImageless, mediaPurged}.
 *
 * BACKUP FIRST (this mutates + deletes): scripts/db-backup.sh
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'

const USER_AGENT = 'newsromania-bot/1.0 (+https://newsromania.info)'
const FETCH_TIMEOUT_MS = 12_000
const RATE_LIMIT_MS = 1_000
const FIND_LIMIT = 2000

const log = (msg) => console.log(`[refresh-images] ${msg}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errMsg = (err) => (err instanceof Error ? err.message : String(err))

function parseArgs(argv) {
  const dryRun =
    argv.includes('--dry-run') || /^(1|true)$/i.test(process.env.REFRESH_IMAGES_DRY_RUN ?? '')
  return { dryRun }
}

async function fetchWithTimeout(url, accept) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: { 'user-agent': USER_AGENT, ...(accept ? { accept } : {}) },
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * True when imageUrl is ALREADY a clean external publisher hotlink — i.e. a
 * non-empty absolute URL that is NOT one of our downloaded/owner-hosted copies.
 * Such items are skipped by Pass 1 (idempotency).
 */
function isCleanExternalHotlink(imageUrl) {
  if (typeof imageUrl !== 'string') return false
  const url = imageUrl.trim()
  if (url.length === 0) return false
  if (url.includes('/api/media/')) return false // downloaded copy in our library
  if (/newsromania\.info\/wp-content/i.test(url)) return false // owner-hosted copy
  return /^https?:\/\//i.test(url)
}

/**
 * Registrable-domain-ish base ("host family"): last two labels, so
 * www.g4media.ro, cdn.g4media.ro and g4media.ro all map to g4media.ro. Precise
 * enough for the RO/COM publisher hosts in the census (no co.uk sources).
 */
function hostFamily(hostname) {
  const labels = hostname.toLowerCase().split('.').filter(Boolean)
  return labels.length <= 2 ? labels.join('.') : labels.slice(-2).join('.')
}

/** Decode the handful of HTML entities that show up inside meta URLs. */
function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#0?38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
}

/**
 * Absolutize a candidate image URL against the page URL, normalize protocol-
 * relative (//host/…) forms, and collapse accidental double slashes. Returns an
 * absolute http(s) URL or null.
 */
function absolutize(raw, pageUrl) {
  if (typeof raw !== 'string') return null
  let value = decodeEntities(raw.trim())
  if (value.length === 0) return null
  if (value.startsWith('//')) value = `https:${value}`
  try {
    const resolved = new URL(value, pageUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.toString()
  } catch {
    return null
  }
}

/**
 * URL heuristics for junk images: data: URIs, tracking pixels, tiny named
 * icons/sprites (both dimensions <100 in a WP-style -WxH suffix), logos.
 */
function looksLikeJunkImage(url) {
  if (/^data:/i.test(url)) return true
  let pathname
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    pathname = url.toLowerCase()
  }
  if (
    /(pixel|tracker|tracking|spacer|blank|1x1|icon|sprite|emoji|avatar|logo|badge)/.test(pathname)
  )
    return true
  const dims = pathname.match(/-(\d{1,4})x(\d{1,4})\.(?:jpe?g|png|webp|gif|avif)$/)
  if (dims && Number(dims[1]) < 100 && Number(dims[2]) < 100) return true
  return false
}

/**
 * Pull the value of the first <meta> tag whose name/property attribute equals
 * one of `names` (case-insensitive). Handles both attribute orders
 * (content-then-property and property-then-content).
 */
function metaContent(html, names) {
  const wanted = new Set(names.map((n) => n.toLowerCase()))
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const raw = tag[0]
    const key = raw.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)
    if (!key || !wanted.has(key[1].trim().toLowerCase())) continue
    const content = raw.match(/\bcontent\s*=\s*["']([^"']*)["']/i)
    if (content && content[1].trim().length > 0) return content[1].trim()
  }
  return null
}

/**
 * First <img src> in the page HTML hosted on the publisher's OWN domain (the
 * host family of pageUrl). Normalized absolute URL or null.
 */
function firstOwnDomainImage(html, pageUrl) {
  let pageFamily
  try {
    pageFamily = hostFamily(new URL(pageUrl).hostname)
  } catch {
    return null
  }
  for (const match of html.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) {
    const abs = absolutize(match[1], pageUrl)
    if (!abs || looksLikeJunkImage(abs)) continue
    try {
      if (hostFamily(new URL(abs).hostname) === pageFamily) return abs
    } catch {
      // unparseable src — keep scanning
    }
  }
  return null
}

/**
 * Fetch the publisher article and return its best hotlink image URL, or null.
 * og:image → twitter:image → first own-domain <img>. Never downloads bytes; it
 * reads the HTML once and returns a URL to hotlink.
 */
async function findPublisherImage(sourceUrl) {
  const res = await fetchWithTimeout(sourceUrl, 'text/html,application/xhtml+xml')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const contentType = res.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml/i.test(contentType) && contentType.length > 0) {
    throw new Error(`content-type neașteptat: ${contentType}`)
  }
  const html = await res.text()

  const og = metaContent(html, ['og:image', 'og:image:secure_url', 'og:image:url'])
  const twitter = metaContent(html, ['twitter:image', 'twitter:image:src'])

  for (const candidate of [og, twitter]) {
    const abs = absolutize(candidate, sourceUrl)
    if (abs && !looksLikeJunkImage(abs)) return abs
  }
  return firstOwnDomainImage(html, sourceUrl)
}

const { dryRun } = parseArgs(process.argv.slice(2))
const payload = await getPayload({ config: configPromise })

const counts = { recoveredHotlink: 0, clearedImageless: 0, mediaPurged: 0 }
let exitCode = 0

try {
  log(dryRun ? 'RULARE DE PROBĂ — nu se scrie și nu se șterge nimic.' : 'aplic modificările.')

  // ── Pass 1 — refresh imageUrl on non-archived aggregated items ────────────
  const all = await payload.find({
    collection: 'aggregated-items',
    where: { archived: { not_equals: true } },
    limit: FIND_LIMIT,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  const candidates = all.docs.filter((doc) => !isCleanExternalHotlink(doc.imageUrl))
  log(
    `Pass 1: ${candidates.length}/${all.docs.length} elemente agregate non-arhivate de reîmprospătat ` +
      `(restul sunt deja hotlink extern curat).`,
  )

  for (const doc of candidates) {
    const sourceUrl = typeof doc.sourceUrl === 'string' ? doc.sourceUrl.trim() : ''
    if (!/^https?:\/\//i.test(sourceUrl)) {
      // No usable publisher URL → make it imageless per policy.
      log(`  #${doc.id} fără sourceUrl utilizabil → imageless`)
      if (!dryRun) {
        await payload.update({
          collection: 'aggregated-items',
          id: doc.id,
          // slug passed through EXPLICITLY: the slugify beforeValidate hook
          // would otherwise regenerate it from the title and could break live
          // permalinks used in queued social captions.
          data: { imageUrl: '', imageAllowed: false, slug: doc.slug },
          depth: 0,
          overrideAccess: true,
        })
      }
      counts.clearedImageless += 1
      continue
    }

    // 1 request/second against the publisher — polite pacing, every item.
    await sleep(RATE_LIMIT_MS)

    let hotlink = null
    try {
      hotlink = await findPublisherImage(sourceUrl)
    } catch (err) {
      log(`  #${doc.id} fetch eșuat (${errMsg(err)}) → imageless`)
    }

    const data = hotlink
      ? { imageUrl: hotlink, imageAllowed: true, slug: doc.slug }
      : { imageUrl: '', imageAllowed: false, slug: doc.slug }

    if (!dryRun) {
      await payload.update({
        collection: 'aggregated-items',
        id: doc.id,
        data,
        depth: 0,
        overrideAccess: true,
      })
    }

    if (hotlink) {
      counts.recoveredHotlink += 1
      log(`  #${doc.id} hotlink → ${hotlink}`)
    } else {
      counts.clearedImageless += 1
      log(`  #${doc.id} imagine indisponibilă → imageless`)
    }
  }

  // ── Pass 2 — orphan media purge ───────────────────────────────────────────
  // Build the live reference sets AFTER Pass 1's writes. Under --dry-run the
  // aggregated items were NOT changed, so /api/media/ refs still exist and no
  // media doc is orphaned yet — the dry run correctly reports mediaPurged 0.
  // Articles has drafts+autosave: a media doc may be referenced ONLY by an
  // unpublished draft's featuredImage, which lives in the versions table and is
  // NOT returned by payload.find (latest published only). Scan both the current
  // docs AND every version so a draft-only reference still protects its media.
  const [mediaPage, itemsForRefs, articlesForRefs, articleVersionsForRefs] = await Promise.all([
    payload.find({
      collection: 'media',
      limit: FIND_LIMIT,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    }),
    // ALL aggregated items (incl. archived) — an archived item still hotlinking
    // a media url protects that media doc from purge.
    payload.find({
      collection: 'aggregated-items',
      limit: FIND_LIMIT,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    }),
    // depth 0 → featuredImage is the related media id (or null).
    payload.find({
      collection: 'articles',
      limit: FIND_LIMIT,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    }),
    payload.findVersions({
      collection: 'articles',
      limit: FIND_LIMIT,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    }),
  ])

  const referencedUrls = new Set(
    itemsForRefs.docs
      .map((d) => (typeof d.imageUrl === 'string' ? d.imageUrl.trim() : ''))
      .filter((u) => u.length > 0),
  )
  // featuredImage is the related media id at depth 0 (or a doc with .id if a
  // hook ever expands it); versions carry it under version.featuredImage.
  const mediaIdOf = (value) => {
    if (value === null || value === undefined) return null
    return String(typeof value === 'object' ? value.id : value)
  }
  const referencedMediaIds = new Set(
    [
      ...articlesForRefs.docs.map((a) => a.featuredImage),
      ...articleVersionsForRefs.docs.map((v) => v.version?.featuredImage),
    ]
      .map(mediaIdOf)
      .filter((id) => id !== null),
  )

  const orphans = mediaPage.docs.filter((m) => {
    const urlReferenced = typeof m.url === 'string' && referencedUrls.has(m.url.trim())
    const idReferenced = referencedMediaIds.has(String(m.id))
    return !urlReferenced && !idReferenced
  })
  log(
    `Pass 2: ${orphans.length}/${mediaPage.docs.length} documente media orfane ` +
      `(nereferite de niciun aggregated-item.imageUrl și niciun articol.featuredImage).`,
  )

  for (const media of orphans) {
    // Re-verify referential safety immediately before the delete (defensive —
    // the sets were built from a consistent snapshot above, but this guards
    // against any drift and documents the invariant at the delete site).
    const url = typeof media.url === 'string' ? media.url.trim() : ''
    const stillUrlReferenced = url.length > 0 && referencedUrls.has(url)
    const stillIdReferenced = referencedMediaIds.has(String(media.id))
    if (stillUrlReferenced || stillIdReferenced) {
      log(`  media #${media.id} încă referit — NU se șterge (siguranță referențială)`)
      continue
    }
    if (dryRun) {
      log(`  media #${media.id} ar fi șters (orfan): ${url || '(fără url)'}`)
    } else {
      await payload.delete({
        collection: 'media',
        id: media.id,
        overrideAccess: true,
      })
      log(`  media #${media.id} șters (orfan): ${url || '(fără url)'}`)
    }
    counts.mediaPurged += 1
  }

  log(
    `gata${dryRun ? ' (probă)' : ''}: { recoveredHotlink: ${counts.recoveredHotlink}, ` +
      `clearedImageless: ${counts.clearedImageless}, mediaPurged: ${counts.mediaPurged} }`,
  )
} catch (err) {
  exitCode = 1
  log(`EROARE: ${errMsg(err)}`)
} finally {
  await payload.destroy()
}

process.exit(exitCode)
