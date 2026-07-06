import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { SkipLink } from '@/components/layout/SkipLink'
import { fontSans, fontSerif } from '@/lib/fonts'
import './(frontend)/globals.css'

/**
 * Global 404 (experimental globalNotFound flag) — served for URLs that match
 * no route at all. The root layout lives inside the (frontend) route group,
 * so without this file Next would return its default, English, layout-less
 * 404. This is a full standalone document: branded Romanian copy inside the
 * complete site chrome.
 */

export const metadata: Metadata = {
  title: 'Pagina nu a fost găsită | NewsRomania',
  robots: { index: false, follow: false },
}

export default function GlobalNotFound() {
  return (
    <html lang="ro" className={`${fontSans.variable} ${fontSerif.variable}`}>
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
        <SkipLink />
        <Header />
        <main id="continut" className="flex-1">
          <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-10 md:px-6">
            <div className="mx-auto max-w-[680px] rounded-[2px] bg-surface px-6 py-12 text-center">
              <p className="font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-red-text">
                Eroare 404
              </p>
              <h1 className="mt-3 font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-4xl md:leading-[44px]">
                Pagina nu a fost găsită
              </h1>
              <p className="mt-3 font-sans text-[15px] leading-[22px] text-ink-secondary">
                Adresa accesată nu există sau a fost mutată. Poți reveni la prima pagină sau poți
                căuta știrea dorită.
              </p>
              <p className="mt-6">
                <Link
                  href="/"
                  className="inline-flex h-11 items-center rounded-[2px] bg-link px-5 font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover active:opacity-85"
                >
                  ← Înapoi la prima pagină
                </Link>
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </body>
    </html>
  )
}
