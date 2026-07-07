/**
 * Backfill aggregated-items.imageUrl — owner-approved backfill (design
 * direction v2 §5.1, owner point 5 „where are the photos”).
 *
 *   npx payload run scripts/maintenance/backfill-aggregated-images.mjs
 *
 * Scope: non-archived aggregated items with an EMPTY imageUrl whose guid is a
 * newsromania.info permalink — i.e. stories that came from the owner's own
 * WordPress site during the one-time seed. For each, the WP post is re-read
 * via the public REST API (by slug, `_embed`, 1 request/second) and:
 *
 *   1. If the post has featured media hosted on newsromania.info (the
 *      owner's OWN upload): download it (3 MB cap) and create a Payload
 *      `media` doc via the Local API (alt = item title), then set
 *      imageUrl = the media doc's own URL + imageAllowed = true.
 *   2. Else, if the post body embeds an <img> hosted by the ORIGINAL
 *      publisher (same host family as the item's sourceUrl): hotlink that
 *      URL directly (owner-mandated — „display the photos directly from the
 *      link”; it is exactly what the owner's WP already shows publicly).
 *      First real image only; data: URIs, trackers and tiny icons skipped.
 *   3. Else leave empty — the branded §5.3 placeholder covers it.
 *
 * LEGAL: this is the documented owner-approved backfill (PROJECT_BRIEF
 * 0.1/0.2). It touches ONLY the owner's own WordPress REST API — it never
 * scrapes third-party publisher article HTML, and the INGEST pipeline stays
 * enclosure/media:content-only.
 *
 * Idempotent: items with imageUrl already set are never candidates, so a
 * re-run finds nothing to do and creates no new media docs.
 */
import path from 'node:path'

import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'

const WP_API = 'https://newsromania.info/wp-json/wp/v2/posts'
const USER_AGENT = 'newsromania-bot/1.0 (+https://newsromania.info)'
const FETCH_TIMEOUT_MS = 15_000
const RATE_LIMIT_MS = 1_000
const MAX_DOWNLOAD_BYTES = 3 * 1024 * 1024 // 3 MB cap for featured downloads
const GUID_PREFIXES = ['https://newsromania.info/', 'https://www.newsromania.info/']
const OWNER_HOSTS = new Set(['newsromania.info', 'www.newsromania.info'])

const log = (msg) => console.log(`[backfill-images] ${msg}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

/** Last non-empty path segment of the guid permalink = the WP post slug. */
function wpSlugFromGuid(guid) {
  try {
    const segments = new URL(guid).pathname.split('/').filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : null
  } catch {
    return null
  }
}

/**
 * Registrable-domain-ish base („host family”): last two labels, so
 * www.g4media.ro, cdn.g4media.ro and g4media.ro all map to g4media.ro.
 * Precise enough for RO/COM publisher hosts (no co.uk sources in the seed).
 */
function hostFamily(hostname) {
  const labels = hostname.toLowerCase().split('.').filter(Boolean)
  return labels.length <= 2 ? labels.join('.') : labels.slice(-2).join('.')
}

/**
 * URL heuristics for junk images: data: URIs, tracking pixels, tiny named
 * icons/sprites (both dimensions <100 in a WP-style -WxH suffix), logos.
 */
function looksLikeJunkImage(url) {
  if (/^data:/i.test(url)) return true
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  })()
  if (
    /(pixel|tracker|tracking|spacer|blank|1x1|icon|sprite|emoji|avatar|logo|badge)/.test(pathname)
  )
    return true
  const dims = pathname.match(/-(\d{1,4})x(\d{1,4})\.(?:jpe?g|png|webp|gif|avif)$/)
  if (dims && Number(dims[1]) < 100 && Number(dims[2]) < 100) return true
  return false
}

/**
 * First <img src> in the WP post HTML hosted by the item's ORIGINAL
 * publisher (sourceUrl host family). Returns a normalized absolute URL or
 * null. This reads the OWNER'S OWN post markup — never publisher HTML.
 */
function firstPublisherImage(contentHtml, sourceUrl) {
  let sourceFamily
  try {
    sourceFamily = hostFamily(new URL(sourceUrl).hostname)
  } catch {
    return null
  }
  for (const match of contentHtml.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) {
    // Normalize WP artifacts like https://www.g4media.ro//wp-content/... and
    // protocol-relative //host/... forms.
    const raw = match[1].trim().replace(/^\/\//, 'https://')
    if (!/^https?:\/\//i.test(raw)) continue
    const normalized = raw.replace(/([^:])\/{2,}/g, '$1/')
    if (looksLikeJunkImage(normalized)) continue
    try {
      if (hostFamily(new URL(normalized).hostname) === sourceFamily) return normalized
    } catch {
      // unparseable src — ignore and keep scanning
    }
  }
  return null
}

/** Download the owner's featured file (3 MB cap) → { buffer, name, mimetype }. */
async function downloadFeatured(sourceUrl, fallbackName) {
  const res = await fetchWithTimeout(sourceUrl, 'image/*')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`peste plafonul de 3 MB (${declared} B)`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_DOWNLOAD_BYTES)
    throw new Error(`peste plafonul de 3 MB (${buffer.length} B)`)
  const name = path.basename(new URL(sourceUrl).pathname) || fallbackName
  return { buffer, name, mimetype: res.headers.get('content-type') ?? 'image/jpeg' }
}

const payload = await getPayload({ config: configPromise })

try {
  // Candidates: non-archived, EMPTY imageUrl, seeded from the owner's WP.
  // The whole collection is small (<100 docs) — fetch once, filter in JS so
  // null/'' imageUrl and the guid prefix match stay exact.
  const all = await payload.find({
    collection: 'aggregated-items',
    where: { archived: { not_equals: true } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const candidates = all.docs.filter(
    (doc) =>
      (typeof doc.imageUrl !== 'string' || doc.imageUrl.trim().length === 0) &&
      typeof doc.guid === 'string' &&
      GUID_PREFIXES.some((prefix) => doc.guid.startsWith(prefix)),
  )
  log(`candidate: ${candidates.length}/${all.docs.length} elemente agregate fără imagine`)

  const counts = { featuredDownloaded: 0, hotlinked: 0, skipped: 0 }

  for (const doc of candidates) {
    const wpSlug = wpSlugFromGuid(doc.guid)
    if (!wpSlug) {
      counts.skipped += 1
      log(`  #${doc.id} sărit: guid fără slug (${doc.guid})`)
      continue
    }

    // 1 request/second against the owner's WP — polite pacing, every item.
    await sleep(RATE_LIMIT_MS)

    let post = null
    try {
      const res = await fetchWithTimeout(
        `${WP_API}?slug=${encodeURIComponent(wpSlug)}&_embed=1`,
        'application/json',
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const posts = await res.json()
      post = Array.isArray(posts) ? (posts[0] ?? null) : null
    } catch (err) {
      counts.skipped += 1
      log(`  #${doc.id} sărit: REST eșuat pentru „${wpSlug}” (${err.message})`)
      continue
    }
    if (!post) {
      counts.skipped += 1
      log(`  #${doc.id} sărit: postarea WP „${wpSlug}” nu mai există`)
      continue
    }

    let imageUrl = null
    let route = null

    // Route 1 — owner's own featured upload → download + Payload media doc.
    const featured = post._embedded?.['wp:featuredmedia']?.[0]
    const featuredSrc = typeof featured?.source_url === 'string' ? featured.source_url : null
    const featuredHost = (() => {
      try {
        return featuredSrc ? new URL(featuredSrc).hostname.toLowerCase() : null
      } catch {
        return null
      }
    })()
    if (featuredSrc && featuredHost && OWNER_HOSTS.has(featuredHost)) {
      try {
        const file = await downloadFeatured(featuredSrc, `${doc.slug}.jpg`)
        const media = await payload.create({
          collection: 'media',
          data: { alt: doc.title },
          file: {
            data: file.buffer,
            name: file.name,
            size: file.buffer.length,
            mimetype: file.mimetype,
          },
          depth: 0,
          overrideAccess: true,
        })
        imageUrl = media.url
        route = 'featured'
      } catch (err) {
        log(`  #${doc.id} featured nedescărcat (${err.message}) — încerc hotlink`)
      }
    }

    // Route 2 — first publisher-hosted <img> in the owner's post → hotlink.
    if (!imageUrl) {
      const html = typeof post.content?.rendered === 'string' ? post.content.rendered : ''
      const hotlink = firstPublisherImage(html, doc.sourceUrl)
      if (hotlink) {
        imageUrl = hotlink
        route = 'hotlink'
      }
    }

    if (!imageUrl) {
      counts.skipped += 1
      log(`  #${doc.id} sărit: nicio imagine utilizabilă („${wpSlug}”)`)
      continue
    }

    await payload.update({
      collection: 'aggregated-items',
      id: doc.id,
      // slug passed through EXPLICITLY: the slugify hook would otherwise
      // regenerate it from the title and could break live permalinks.
      data: { imageUrl, imageAllowed: true, slug: doc.slug },
      depth: 0,
      overrideAccess: true,
    })
    if (route === 'featured') {
      counts.featuredDownloaded += 1
      log(`  #${doc.id} featured descărcat → ${imageUrl}`)
    } else {
      counts.hotlinked += 1
      log(`  #${doc.id} hotlink → ${imageUrl}`)
    }
  }

  log(
    `gata: { featuredDownloaded: ${counts.featuredDownloaded}, hotlinked: ${counts.hotlinked}, skipped: ${counts.skipped} }`,
  )
} finally {
  await payload.destroy()
}
process.exit(0)
