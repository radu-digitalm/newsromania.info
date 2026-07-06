import type { Metadata } from 'next'
import Script from 'next/script'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { SkipLink } from '@/components/layout/SkipLink'
import { siteConfig } from '@/config/site'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`${fontSans.variable} ${fontSerif.variable}`}>
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
        <SkipLink />
        <Header />
        <main id="continut" className="flex-1">
          {children}
        </main>
        <Footer />
        {/*
          Google AdSense site-level tag (PROJECT_BRIEF 6.4): required code for the
          pending newsromania.info site review; ad slots render blank until the
          review passes — this is expected, never fill them with fake ads.
          Build step 7 will consent-gate this via Google Consent Mode.
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
