import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Script from 'next/script'
import { CdpBeacon } from '@/components/cdp/CdpBeacon'
import { ConsentBanner } from '@/components/consent/ConsentBanner'
import { ConsentModeScript } from '@/components/consent/ConsentModeScript'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { SkipLink } from '@/components/layout/SkipLink'
import { siteConfig } from '@/config/site'
import { readConsent, VISITOR_COOKIE_NAME } from '@/lib/consent'
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
  // GDPR (PROJECT_BRIEF §8): consent state is decided server-side from the
  // HttpOnly nr_consent cookie — no client storage is ever read before an
  // explicit choice.
  const cookieStore = await cookies()
  const consent = await readConsent(cookieStore)
  const hasVid = Boolean(cookieStore.get(VISITOR_COOKIE_NAME)?.value)
  return (
    <html lang="ro" className={`${fontSans.variable} ${fontSerif.variable}`}>
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
        {/* Consent Mode v2 defaults (all denied) — inline, parsed synchronously,
            therefore guaranteed to run BEFORE the afterInteractive AdSense tag. */}
        <ConsentModeScript consent={consent} />
        <SkipLink />
        <Header />
        <main id="continut" className="flex-1">
          {children}
        </main>
        <Footer />
        {consent === 'unknown' ? <ConsentBanner /> : null}
        {/*
          CDP beacon (PROJECT_BRIEF §7) — mounted ONLY for visitors with an
          explicit, current-version Accept AND a minted nr_vid cookie
          (CdpBeacon mounting contract). Refused/unknown visitors never
          receive any tracking code; /api/cdp/events re-validates server-side.
        */}
        {consent === 'accepted' && hasVid ? <CdpBeacon /> : null}
        {/*
          Google AdSense site-level tag (PROJECT_BRIEF 6.4): required code for the
          pending newsromania.info site review; ad slots render blank until the
          review passes — this is expected, never fill them with fake ads.
          Consent-gated via Google Consent Mode v2 (ConsentModeScript above):
          the tag itself always loads, but with all storage denied by default.
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
