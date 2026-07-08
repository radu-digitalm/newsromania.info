/**
 * Publisher-article lead-image discovery for aggregated items
 * (docs/architecture.md §"Image policy": an aggregated image is ALWAYS a
 * hotlink to the source's own image — RSS enclosure/media:content, OR the
 * publisher article's og:image). We NEVER download or store it.
 *
 * When the RSS item carries no enclosure/media:content image, the worker
 * fetches the item's link ONCE, politely (see rss.mjs fetchArticleHtml:
 * 1 req/sec, 12s timeout, UA newsromania-bot/1.0), and extracts a SINGLE
 * meta image: og:image → twitter:image → the first ON-DOMAIN <img>. This is
 * metadata the publisher publishes expressly for sharing — no scraping beyond
 * that one image, no crawling of additional pages.
 *
 * parseOgImage() is a pure, dependency-free parser (regex over a capped HTML
 * head) — unit-tested in tests/rss-helpers.test.ts. The fetch itself lives in
 * rss.mjs (network) and is exercised only via integration.
 */

// Only look at the document head region — og/twitter tags live there and it
// bounds the regex work on very large article pages.
const HEAD_SCAN_CHARS = 200_000

/** Resolve a possibly-relative image URL against the article URL; http(s) only. */
export function resolveImageUrl(candidate, pageUrl) {
  if (typeof candidate !== 'string') return null
  const raw = candidate.trim()
  if (raw.length === 0) return null
  try {
    const resolved = new URL(raw, pageUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.toString()
  } catch {
    return null
  }
}

/** Same registrable host? (compares the URL hostnames case-insensitively). */
function sameHost(a, b) {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Extract a <meta> content value by property/name from a chunk of HTML.
 * Tolerates attribute order (content before or after property/name) and
 * single/double quotes.
 *
 * @param {string} html
 * @param {string} key e.g. 'og:image', 'twitter:image'
 * @returns {string | null}
 */
function metaContent(html, key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // <meta property="og:image" content="...">  OR  content=... property=...
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${esc}["'][^>]*?\\scontent\\s*=\\s*["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${esc}["']`,
      'i',
    ),
  ]
  for (const re of patterns) {
    const m = re.exec(html)
    if (m && typeof m[1] === 'string' && m[1].trim().length > 0) return m[1].trim()
  }
  return null
}

/** First on-domain <img src>. Skips data: URIs and off-domain hosts. */
function firstOnDomainImg(html, pageUrl) {
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const resolved = resolveImageUrl(m[1], pageUrl)
    if (resolved && sameHost(resolved, pageUrl)) return resolved
  }
  return null
}

/**
 * Parse a single publisher lead image out of article HTML.
 * Precedence: og:image → twitter:image → first on-domain <img>.
 * Returns an ABSOLUTE http(s) URL, or null.
 *
 * @param {string} html raw article HTML
 * @param {string} pageUrl the article URL (for resolving relative paths)
 * @returns {string | null}
 */
export function parseOgImage(html, pageUrl) {
  if (typeof html !== 'string' || html.length === 0) return null
  const head = html.length > HEAD_SCAN_CHARS ? html.slice(0, HEAD_SCAN_CHARS) : html

  for (const key of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image']) {
    const raw = metaContent(head, key)
    const resolved = resolveImageUrl(raw, pageUrl)
    if (resolved) return resolved
  }
  return firstOnDomainImg(html, pageUrl)
}
