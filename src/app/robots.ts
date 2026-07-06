import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

/**
 * robots.txt — everything public is crawlable in step 1.
 *
 * At build step 3 (Payload CMS) add `disallow: '/admin'` (and any Payload API
 * routes) so the editorial backend never gets crawled or indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
