/**
 * RSS fetch + item-shape helpers for the ingest worker (architecture.md §7).
 *
 * - fetchFeedXml(): conditional GET (If-None-Match / If-Modified-Since) with
 *   a 15s abort timeout and the project user agent. Returns the raw XML plus
 *   the new validators, or { notModified: true } on 304.
 * - createFeedParser(): rss-parser instance that also surfaces media:content
 *   (the ONLY image sources we may use are enclosure + media:content —
 *   legal gate PROJECT_BRIEF 0.2).
 * - extractImage(), itemGuid(), itemPublishedAt(), itemSourceText(): pure
 *   per-item helpers.
 */

import Parser from 'rss-parser'

export const USER_AGENT = 'newsromania-bot/1.0 (+https://newsromania.info)'
export const FETCH_TIMEOUT_MS = 15_000
/** Publisher article fetch (og:image discovery) — shorter, polite timeout. */
export const ARTICLE_FETCH_TIMEOUT_MS = 12_000
/** Politeness floor between publisher-article fetches (≤ 1 request / second). */
export const ARTICLE_FETCH_MIN_INTERVAL_MS = 1_000

/**
 * Decode raw feed bytes honoring the DECLARED charset. fetch's `res.text()`
 * always decodes as UTF-8 (WHATWG spec), which corrupts feeds served in a
 * legacy charset — e.g. bursa.ro serves `encoding="iso-8859-2"`, so its
 * diacritic bytes become U+FFFD („�") under UTF-8. Charset priority: the XML
 * declaration `encoding="…"` (authoritative for XML), then the HTTP
 * Content-Type charset, then UTF-8. Unknown/unsupported labels fall back to
 * UTF-8 — never throws. Pure + unit-tested (tests/rss-helpers.test.ts).
 *
 * @param {ArrayBuffer | Uint8Array} buffer raw response bytes
 * @param {string} [contentType] HTTP Content-Type header value
 * @returns {string}
 */
export function decodeFeedBytes(buffer, contentType = '') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  // The XML declaration is pure ASCII; read a safe head (latin1 never throws)
  // to find encoding="…". 512 bytes is far more than any declaration needs.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 512))
  const xmlEnc = head.match(/<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i)?.[1]
  const ctEnc = /charset\s*=\s*["']?([^"'\s;]+)/i.exec(contentType)?.[1]
  const label = (xmlEnc || ctEnc || 'utf-8').trim().toLowerCase()
  if (label === 'utf-8' || label === 'utf8') return new TextDecoder('utf-8').decode(bytes)
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes)
  } catch {
    // Unsupported label → best-effort UTF-8 so a quirky feed never fails the run.
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/**
 * @param {string} url
 * @param {{ etag?: string | null, lastModified?: string | null }} [validators]
 * @returns {Promise<{ notModified: true } |
 *   { notModified: false, xml: string, etag: string | null, lastModified: string | null }>}
 */
export async function fetchFeedXml(url, validators = {}) {
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
  }
  if (validators.etag) headers['if-none-match'] = validators.etag
  if (validators.lastModified) headers['if-modified-since'] = validators.lastModified

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal })
    if (res.status === 304) return { notModified: true }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    // Decode by declared charset (NOT res.text(), which forces UTF-8 and
    // mojibakes legacy-charset feeds like bursa.ro's iso-8859-2).
    const buffer = await res.arrayBuffer()
    const xml = decodeFeedBytes(buffer, res.headers.get('content-type') ?? '')
    return {
      notModified: false,
      xml,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Timeout după ${FETCH_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Module-level clock so the 1-req/sec floor holds ACROSS calls within a run.
let lastArticleFetchAt = 0

/**
 * Politely fetch ONE publisher article's HTML for og:image discovery
 * (docs/architecture.md §"Image policy"). Rate-limited to ≤ 1 req/sec,
 * {@link ARTICLE_FETCH_TIMEOUT_MS} timeout, project UA, capped read size.
 * Returns the HTML text, or null on any non-OK/non-HTML/error response — a
 * missing image is never fatal (the card just renders imageless).
 *
 * NOT a crawler: exactly one GET of the item's own link, nothing followed
 * beyond it. Only used when RSS gave no enclosure/media:content image.
 *
 * @param {string} url the article link
 * @param {{ now?: () => number, sleep?: (ms: number) => Promise<void> }} [deps]
 *   injectable clock/sleep for tests
 * @returns {Promise<string | null>}
 */
export async function fetchArticleHtml(url, deps = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null
  const now = deps.now ?? (() => Date.now())
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))

  // Politeness floor: at most one publisher-article fetch per second.
  const wait = ARTICLE_FETCH_MIN_INTERVAL_MS - (now() - lastArticleFetchAt)
  if (wait > 0) await sleep(wait)
  lastArticleFetchAt = now()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return null
    return await res.text()
  } catch {
    // Any failure (timeout, DNS, TLS…) ⇒ no image, never take the run down.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** rss-parser with media:content surfaced (kept as array). */
export function createFeedParser() {
  return new Parser({
    customFields: {
      item: [
        ['media:content', 'mediaContent', { keepArray: true }],
        ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
        ['content:encoded', 'contentEncoded'],
        ['description', 'descriptionRaw'],
      ],
    },
  })
}

/** Dedup key: guid falls back to link (architecture.md §7). */
export function itemGuid(item) {
  const guid = typeof item.guid === 'string' ? item.guid.trim() : ''
  if (guid.length > 0) return guid
  const link = typeof item.link === 'string' ? item.link.trim() : ''
  return link.length > 0 ? link : null
}

/** Publication date as a Date; falls back to `fallback` (default: now). */
export function itemPublishedAt(item, fallback = new Date()) {
  for (const raw of [item.isoDate, item.pubDate]) {
    if (typeof raw !== 'string' || raw.trim().length === 0) continue
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return date
  }
  return fallback
}

function looksLikeImage(url, type, medium) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
  if (typeof medium === 'string' && medium.toLowerCase() === 'image') return true
  if (typeof type === 'string' && type.length > 0) return /^image\//i.test(type)
  return /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(url)
}

/**
 * RSS-supplied image URL for an aggregated item — from <enclosure>,
 * <media:content> or <media:thumbnail>. This is the FIRST image source
 * (docs/architecture.md §"Image policy"); when it returns null the worker
 * falls back to the publisher article's og:image (see lib/og-image.mjs). All
 * of these are hotlinked, never downloaded.
 *
 * @returns {string | null}
 */
export function extractImage(item) {
  const enclosure = item.enclosure
  if (enclosure && looksLikeImage(enclosure.url, enclosure.type)) {
    return enclosure.url
  }
  // media:content carries @type/@medium — judged on its own attributes so a
  // <media:content medium="video"> is never mistaken for an image.
  const mediaContents = Array.isArray(item.mediaContent) ? item.mediaContent : []
  for (const media of mediaContents) {
    const attrs = media && typeof media === 'object' ? (media.$ ?? media) : {}
    if (looksLikeImage(attrs.url, attrs.type, attrs.medium)) {
      return attrs.url
    }
  }
  // media:thumbnail is an image by definition (spec) and rarely carries @type —
  // default its medium to 'image' so a bare url still qualifies.
  const mediaThumbs = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail : []
  for (const media of mediaThumbs) {
    const attrs = media && typeof media === 'object' ? (media.$ ?? media) : {}
    if (looksLikeImage(attrs.url, attrs.type, attrs.medium ?? 'image')) {
      return attrs.url
    }
  }
  return null
}

// Common named HTML entities publishers emit in feed text beyond the structural
// five. Case-sensitive per the HTML spec (©=&copy;, Ä=&Auml;). Covers
// punctuation, legal/currency marks, and the accented Latin that shows up in
// Romanian/EN copy — e.g. G4Media appends „&copy; G4Media.ro" to every item.
const NAMED_ENTITIES = {
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  minus: '−',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  bull: '•',
  middot: '·',
  deg: '°',
  dagger: '†',
  sect: '§',
  para: '¶',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  times: '×',
  divide: '÷',
  plusmn: '±',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  prime: '′',
  Prime: '″',
  shy: '',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  zwnj: '',
  zwj: '',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  atilde: 'ã',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  ouml: 'ö',
  otilde: 'õ',
  oslash: 'ø',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  szlig: 'ß',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  Ccedil: 'Ç',
  Eacute: 'É',
  Agrave: 'À',
}

/** Strip HTML tags + collapse whitespace + decode HTML entities. */
export function stripHtml(html) {
  if (typeof html !== 'string') return ''
  return (
    html
      .replace(/<[^>]*>/g, ' ')
      // Structural entities first (decode before the numeric pass so e.g. a
      // literal &amp;#8230; still resolves as a stray, not a real ref).
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      // Any other common named entity (©, …, — – « » „ " ", €, accents, …).
      // Unknown names are left intact so nothing legitimate is mangled.
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
      // Numeric character references — Romanian publishers routinely emit curly
      // quotes (&#8222;/&#8221;), en-dash (&#8211;), ellipsis (&#8230;) and
      // nbsp (&#160;). Decode both decimal and hex forms.
      .replace(/&#(\d+);/g, (m, dec) => codePointOr(m, Number.parseInt(dec, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (m, hex) => codePointOr(m, Number.parseInt(hex, 16)))
      // &amp; LAST so „&amp;copy;" stays a literal, not a re-decoded entity.
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Safe String.fromCodePoint — falls back to the raw match on invalid code points. */
function codePointOr(raw, cp) {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return raw
  try {
    return String.fromCodePoint(cp)
  } catch {
    return raw
  }
}

/**
 * Source text passed TRANSIENTLY to the LLM for summarization. It is NEVER
 * stored (aggregated-items keep only the transformative ≤70-word excerpt).
 * Capped at 4000 chars to keep token usage predictable.
 */
/**
 * Best RAW text field to build the stored ≤70-word RSS excerpt from
 * (lib/excerpt.mjs strips HTML + clamps it). Prefers the publisher's own
 * short summary (description / summary / contentSnippet) and only then the
 * fuller content:encoded — the excerpt is length-capped either way, so a long
 * body is fine as a last resort. Returns '' when the item carries no text.
 */
export function itemDescription(item) {
  return (
    (typeof item.descriptionRaw === 'string' && item.descriptionRaw) ||
    (typeof item.summary === 'string' && item.summary) ||
    (typeof item.contentSnippet === 'string' && item.contentSnippet) ||
    (typeof item.content === 'string' && item.content) ||
    (typeof item.contentEncoded === 'string' && item.contentEncoded) ||
    ''
  )
}

export function itemSourceText(item, maxChars = 4000) {
  const raw =
    (typeof item.contentEncoded === 'string' && item.contentEncoded) ||
    (typeof item.content === 'string' && item.content) ||
    (typeof item.contentSnippet === 'string' && item.contentSnippet) ||
    (typeof item.summary === 'string' && item.summary) ||
    ''
  const text = stripHtml(raw)
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}
