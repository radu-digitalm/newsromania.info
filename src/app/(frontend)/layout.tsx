import type { Metadata } from 'next'
import Script from 'next/script'
import { UmamiScript } from '@/components/analytics/UmamiScript'
import { CdpConsentGate } from '@/components/cdp/CdpConsentGate'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { SkipLink } from '@/components/layout/SkipLink'
import { siteConfig } from '@/config/site'
import { getGdprSettings } from '@/lib/consent-server'
import { fontSans, fontSerif } from '@/lib/fonts'
import './globals.css'

const defaultTitle = 'NewsRomania – Știri din România, la zi'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: defaultTitle,
    template: '%s | NewsRomania',
  },
  description: siteConfig.description,
  alternates: {
    canonical: './',
  },
  // No og/twitter title or description here: hard-coding them in the layout
  // would suppress Next's fallback to each page's resolved title/description.
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    siteName: siteConfig.name,
    url: './',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'NewsRomania' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-default.png'],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // GDPR (PROJECT_BRIEF §7/§8) — TWO independent analytics layers:
  //
  //   * Umami (self-hosted, cookieless, no personal data) is CONSENT-FREE and
  //     mounted unconditionally — it needs no banner.
  //   * The first-party CDP (persistent nr_vid) IS consent-gated. Since the CMP
  //     reconciliation (2026-07) advertising/analytics consent is owned by
  //     Google's certified CMP (delivered by the AdSense tag below), NOT by our
  //     retired banner — so the nr_consent cookie is never written server-side.
  //     <CdpConsentGate> re-activates the CDP by reading the CMP's TCF /
  //     Consent-Mode signal CLIENT-SIDE and only then writing the first-party
  //     nr_consent + nr_vid cookies + mounting the beacon (see
  //     components/cdp/CdpConsentGate.tsx + consent-signal.ts). Before that
  //     grant NOTHING is written — server cookies stay ZERO. The gate is passed
  //     the current consentVersion so the cookie it writes matches what the
  //     server-side /api/cdp/events guard validates against.
  const { consentVersion } = await getGdprSettings()
  return (
    <html lang="ro" className={`${fontSans.variable} ${fontSerif.variable}`}>
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
        <SkipLink />
        <Header />
        {/* scroll-mt: the pinned 56px chip nav (+hairline) must not cover
            the content top when the skip link jumps here. */}
        <main id="continut" className="flex-1 scroll-mt-[60px]">
          {children}
        </main>
        <Footer />
        {/*
          First-party CDP (PROJECT_BRIEF §7/§8) — the gate renders nothing and
          writes no cookies until Google's CMP reports consent client-side; only
          then does it mint nr_vid + write the nr_consent proof and mount the
          beacon. /api/cdp/events re-validates BOTH server-side on every batch.
        */}
        <CdpConsentGate consentVersion={consentVersion} />
        {/*
          Self-hosted Umami (PROJECT_BRIEF §7) — cookieless, GDPR-friendly,
          served same-origin via /stats/* (next.config rewrite → internal umami
          service). Consent-free; renders nothing until the owner sets
          NEXT_PUBLIC_UMAMI_WEBSITE_ID (docs/operations.md §11).
        */}
        <UmamiScript />
        {/*
          Google AdSense site-level tag (PROJECT_BRIEF 6.4). Beyond serving
          ads, this tag now DELIVERS Google's certified CMP (the 3-choice
          Consent / Do not consent / Manage options message) and sets Consent
          Mode v2 defaults itself — it is the site's single consent banner.
          Do NOT add a second consent script here. Ad slots still render blank
          until the site review passes — this is expected, never fill them.
        */}
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${siteConfig.adsensePublisherId}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}
