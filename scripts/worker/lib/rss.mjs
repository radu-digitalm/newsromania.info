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
    const xml = await res.text()
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

/** rss-parser with media:content surfaced (kept as array). */
export function createFeedParser() {
  return new Parser({
    customFields: {
      item: [
        ['media:content', 'mediaContent', { keepArray: true }],
        ['content:encoded', 'contentEncoded'],
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
 * Image URL allowed for display — ONLY from <enclosure> or <media:content>
 * (legal gate PROJECT_BRIEF 0.2). Anything else (og:image, scraped HTML…)
 * is forbidden and never even looked at.
 *
 * @returns {string | null}
 */
export function extractImage(item) {
  const enclosure = item.enclosure
  if (enclosure && looksLikeImage(enclosure.url, enclosure.type)) {
    return enclosure.url
  }
  const mediaContents = Array.isArray(item.mediaContent) ? item.mediaContent : []
  for (const media of mediaContents) {
    const attrs = media && typeof media === 'object' ? (media.$ ?? media) : {}
    if (looksLikeImage(attrs.url, attrs.type, attrs.medium)) {
      return attrs.url
    }
  }
  return null
}

/** Strip HTML tags + collapse whitespace (for LLM input, never stored). */
export function stripHtml(html) {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Source text passed TRANSIENTLY to the LLM for summarization. It is NEVER
 * stored (aggregated-items keep only the transformative ≤55-word excerpt).
 * Capped at 4000 chars to keep token usage predictable.
 */
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
