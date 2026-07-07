import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Branded 404 — Romanian copy inside the full site chrome, so notFound()
 * calls (and unmatched URLs, via the [...rest] catch-all) never land on the
 * default English page. v2 skin: white elevated card, pill CTA.
 */

export const metadata: Metadata = {
  title: 'Pagina nu a fost găsită',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-10 md:px-6 xl:px-8">
      <div className="mx-auto max-w-[680px] rounded-[16px] border border-border bg-surface px-6 py-12 text-center shadow-[0_1px_2px_rgba(16,22,31,0.06),0_1px_3px_rgba(16,22,31,0.04)]">
        <p className="font-sans text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-red-text">
          Eroare 404
        </p>
        <h1 className="mt-3 font-serif text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] text-ink md:text-[38px] md:leading-[44px]">
          Pagina nu a fost găsită
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-[22px] text-ink-secondary">
          Adresa accesată nu există sau a fost mutată. Poți reveni la prima pagină sau poți căuta
          știrea dorită.
        </p>
        <p className="mt-6">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full bg-link px-5 font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover active:opacity-85"
          >
            ← Înapoi la prima pagină
          </Link>
        </p>
      </div>
    </div>
  )
}
