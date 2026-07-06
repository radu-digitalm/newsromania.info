import type { MetadataRoute } from 'next'
import { siteConfig } from '@/config/site'
import { getOriginalArticles } from '@/lib/mock-data'
import { absoluteUrl } from '@/lib/seo'

/**
 * sitemap.xml — home, the 8 category pages, and every ORIGINAL article.
 *
 * Deliberately excluded:
 * - AGGREGATED items: their on-site landing pages canonicalize to the
 *   original publisher, whose page is the canonical one. Listing them would
 *   invite duplicate-content penalties (PROJECT_BRIEF Section 16).
 * - Info/legal pages (despre-noi, contact, politica-de-confidentialitate,
 *   politica-de-cookies, termeni-si-conditii, mentiuni-legale): they ship as
 *   placeholder copy and carry noindex until the texts are finalized — a
 *   sitemap must never list noindex URLs. Re-add them when the noindex is
 *   lifted (step 5).
 * - /cautare: internal search results stay noindex permanently.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
    },
    ...siteConfig.categories.map((category) => ({
      url: absoluteUrl(`/categorie/${category.slug}`),
      lastModified: now,
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    })),
    ...getOriginalArticles().map((article) => ({
      url: absoluteUrl(`/stiri/${article.slug}`),
      lastModified: new Date(article.publishedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
