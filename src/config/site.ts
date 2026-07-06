import type { Category } from '@/types/content'

/** Legal/info page rendered at /<slug> and linked from the footer. */
export interface LegalPage {
  slug: string
  title: string
}

export interface SiteConfig {
  name: string
  domain: string
  url: string
  description: string
  adsensePublisherId: string
  categories: Category[]
  legalPages: LegalPage[]
}

/**
 * Single source of truth for site identity, taxonomy and legal pages.
 * Import as: import { siteConfig } from '@/config/site'
 */
export const siteConfig: SiteConfig = {
  name: 'NewsRomania',
  domain: 'newsromania.info',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://newsromania.info',
  description:
    'Știri din România și din lume, la zi: actualitate, politică, economie, externe, sport, tehnologie, sănătate și cultură.',
  // Public-facing AdSense publisher id (PROJECT_BRIEF 6.4) — safe to have in code.
  adsensePublisherId: process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID ?? 'ca-pub-8098077913729716',
  categories: [
    { slug: 'actualitate', name: 'Actualitate' },
    { slug: 'politica', name: 'Politică' },
    { slug: 'economie', name: 'Economie' },
    { slug: 'externe', name: 'Externe' },
    { slug: 'sport', name: 'Sport' },
    { slug: 'tehnologie', name: 'Tehnologie' },
    { slug: 'sanatate', name: 'Sănătate' },
    { slug: 'cultura', name: 'Cultură' },
  ],
  legalPages: [
    { slug: 'politica-de-confidentialitate', title: 'Politica de confidențialitate' },
    { slug: 'termeni-si-conditii', title: 'Termeni și condiții' },
    { slug: 'politica-de-cookies', title: 'Politica de cookies' },
    { slug: 'mentiuni-legale', title: 'Mențiuni legale' },
  ],
}
