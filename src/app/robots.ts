import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

/**
 * robots.txt — everything public is crawlable; the editorial backend, the
 * Payload API, and the Umami analytics dashboard are not.
 *
 * Disallowed:
 * - /admin — the Payload editorial backend. It already serves
 *   `noindex,nofollow`, but robots.txt should also keep crawlers from
 *   fetching it at all (no crawl budget wasted, no backend surface probed).
 * - /api  — Payload + app API routes (feed/consent/cdp/health/admin). These
 *   are data endpoints, not pages, and carry no noindex of their own.
 * - /stats — the Umami analytics dashboard, proxied under this path by nginx.
 *   Not our content and not meant for search indexing.
 *
 * The sitemap lists only indexable owned pages (home, categories, original
 * /stiri articles); aggregated items and noindex legal pages are excluded
 * there, so nothing that is Allow'd here is missing from the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/stats'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
