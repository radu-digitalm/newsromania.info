import type { Category } from '@/types/content'

/** Info/legal page rendered at /<slug> and linked from the footer „Informații” column. */
export interface InfoPage {
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
  infoPages: InfoPage[]
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
    'Știri din România și din lume, la zi: actualitate, politică, economie, internațional, sport, tehnologie, sănătate și cultură.',
  // Public-facing AdSense publisher id (PROJECT_BRIEF 6.4) — safe to have in code.
  adsensePublisherId: process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID ?? 'ca-pub-8098077913729716',
  // Exact order per design direction §3.2: Actualitate, Politică, Economie,
  // Internațional, Sport, Sănătate, Tehnologie, Cultură.
  categories: [
    { slug: 'actualitate', name: 'Actualitate' },
    { slug: 'politica', name: 'Politică' },
    { slug: 'economie', name: 'Economie' },
    { slug: 'international', name: 'Internațional' },
    { slug: 'sport', name: 'Sport' },
    { slug: 'sanatate', name: 'Sănătate' },
    { slug: 'tehnologie', name: 'Tehnologie' },
    { slug: 'cultura', name: 'Cultură' },
  ],
  // Footer „Informații” column, order per design direction §3.6.2; „Mențiuni
  // legale” is an extra entry kept after the five specced ones.
  infoPages: [
    { slug: 'despre-noi', title: 'Despre noi' },
    { slug: 'contact', title: 'Contact' },
    { slug: 'politica-de-confidentialitate', title: 'Politica de confidențialitate' },
    { slug: 'politica-de-cookies', title: 'Politica de cookies' },
    { slug: 'termeni-si-conditii', title: 'Termeni și condiții' },
    { slug: 'mentiuni-legale', title: 'Mențiuni legale' },
  ],
}
