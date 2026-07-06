/**
 * SEO helpers — canonical + structured-data policy per PROJECT_BRIEF Section 16.
 *
 * The two content types get strictly different treatment:
 * - ORIGINAL articles: full NewsArticle JSON-LD with the real author byline;
 *   self-canonical (this site IS their source).
 * - AGGREGATED items: NO structured data; their on-site landing page
 *   (excerpt + attribution + link out, design §3.5) canonicalizes to the
 *   original publisher, and NewsRomania must never claim authorship of
 *   others' work.
 *
 * Full policy: docs/seo-foundation.md
 */
import { siteConfig } from '@/config/site'
import type { FeedItem } from '@/types/content'

/**
 * Joins a path onto the canonical site origin (siteConfig.url).
 * Handles a missing leading slash on the path and a trailing slash on the
 * base. Already-absolute http(s) URLs pass through unchanged so image refs
 * that are external don't get double-prefixed.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const base = siteConfig.url.replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Serialize a JSON-LD object for safe embedding in a
 * <script type="application/ld+json"> via dangerouslySetInnerHTML.
 * JSON.stringify does not escape `<`, so a title containing `</script>`
 * would otherwise break out of the script element (XSS once titles come
 * from Payload/RSS). U+2028/U+2029 are escaped for JS-context safety too.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Google News headline guideline: keep JSON-LD `headline` at 110 chars max. */
const HEADLINE_MAX = 110

function truncateHeadline(title: string): string {
  if (title.length <= HEADLINE_MAX) return title
  return `${title.slice(0, HEADLINE_MAX - 1).trimEnd()}…`
}

/**
 * NewsArticle JSON-LD for ORIGINAL articles; `null` for aggregated items.
 *
 * Render on the article detail page (/stiri/[slug]) inside a
 * <script type="application/ld+json"> tag, JSON.stringify-ed.
 */
export function articleJsonLd(item: FeedItem): Record<string, unknown> | null {
  // Aggregated items must NEVER claim authorship (PROJECT_BRIEF Section 16).
  // Their landing page canonicalizes to the publisher, and emitting
  // Article/NewsArticle markup for them would dishonestly assert editorial
  // ownership of someone else's work. Attribution lives in the UI
  // (source pill + outbound link), not in structured data.
  if (item.type !== 'original') return null

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: truncateHeadline(item.title),
    description: item.excerpt,
    datePublished: item.publishedAt,
    // Mock data has no separate edit timestamp; Payload supplies a real
    // updatedAt at build step 3 — until then dateModified mirrors publish.
    dateModified: item.publishedAt,
    inLanguage: 'ro',
    articleSection: item.category.name,
    author: {
      // Honest authorship typing (PROJECT_BRIEF Section 16): the collective
      // „Redacția NewsRomania” byline is an editorial team, not a person.
      '@type': item.author.slug === 'redactia-newsromania' ? 'Organization' : 'Person',
      name: item.author.name,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/icons/icon-512.png'),
      },
    },
    mainEntityOfPage: absoluteUrl(`/stiri/${item.slug}`),
  }

  if (item.image) {
    jsonLd.image = [absoluteUrl(item.image.url)]
  }

  return jsonLd
}

/**
 * WebSite JSON-LD for the home page. NOT wired anywhere yet — exported for
 * later use (render once on `/`; see docs/seo-foundation.md). /cautare now
 * accepts ?q=, so a SearchAction can be added when this gets wired, once
 * search moves beyond the mock feed.
 */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: absoluteUrl('/'),
    description: siteConfig.description,
    inLanguage: 'ro',
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/icons/icon-512.png'),
      },
    },
  }
}
