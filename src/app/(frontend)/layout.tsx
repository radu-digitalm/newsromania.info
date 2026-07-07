import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Script from 'next/script'
import { CdpBeacon } from '@/components/cdp/CdpBeacon'
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
  //
  // CMP RECONCILIATION (2026-07): the advertising consent banner + Google
  // Consent Mode v2 bootstrap are now delivered by Google's CERTIFIED CMP,
  // published through the AdSense tag below (AdSense › Privacy & messaging).
  // Our own <ConsentBanner /> and manual <ConsentModeScript /> were retired to
  // avoid a double banner and conflicting Consent-Mode defaults — Google's CMP
  // is the SINGLE consent experience and owns the ad_storage/analytics_storage
  // defaults itself. readConsent() below therefore only gates the DORMANT
  // first-party CDP beacon: with our banner gone the nr_consent cookie is never
  // written, so `consent` is always 'unknown' and the beacon never mounts
  // (privacy-safe). Re-activating first-party analytics later must gate on
  // Google's TCF / Consent-Mode signal, NOT on this removed cookie
  // (see CdpBeacon.tsx + docs/architecture.md).
  const cookieStore = await cookies()
  const consent = await readConsent(cookieStore)
  const hasVid = Boolean(cookieStore.get(VISITOR_COOKIE_NAME)?.value)
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
          CDP beacon (PROJECT_BRIEF §7) — mounted ONLY for visitors with an
          explicit, current-version Accept AND a minted nr_vid cookie
          (CdpBeacon mounting contract). With the custom banner retired in
          favour of Google's CMP, nr_consent is never written, so this stays
          DORMANT (always 'unknown' ⇒ never mounts); /api/cdp/events also
          re-validates server-side. See CdpBeacon.tsx for re-activation notes.
        */}
        {consent === 'accepted' && hasVid ? <CdpBeacon /> : null}
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
