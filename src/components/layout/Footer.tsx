import Image from 'next/image'
import Link from 'next/link'
import { siteConfig } from '@/config/site'
import { TricolorBar } from './TricolorBar'
import logoSymbol from '../../../assets/logo-symbol.png'

const columnHeadingClass =
  'font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-white'

// Footer sits on ink, so focus rings flip to yellow (design §6).
const footerLinkClass =
  'block py-2.5 font-sans text-[15px] leading-6 text-footer-link transition-colors hover:text-white hover:underline hover:decoration-brand-yellow hover:decoration-2 hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow active:opacity-85'

/** Site footer (design §3.6) — the page's single `contentinfo` landmark. */
export function Footer() {
  return (
    <footer className="bg-ink">
      <TricolorBar />
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-12 md:px-6">
        {/* Brand row */}
        <div className="flex items-center gap-4">
          <Image src={logoSymbol} alt="" className="h-10 w-auto" />
          <div>
            <p className="font-serif text-xl font-bold leading-6 text-white">NewsRomania</p>
            <p className="mt-1 font-sans text-[15px] leading-[22px] text-footer-link">
              Știri din România, la zi.
            </p>
          </div>
        </div>

        {/* Link columns */}
        <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-3">
          <div>
            <h2 className={columnHeadingClass}>Categorii</h2>
            <ul className="mt-3">
              {siteConfig.categories.map((category) => (
                <li key={category.slug}>
                  <Link href={`/categorie/${category.slug}`} className={footerLinkClass}>
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className={columnHeadingClass}>Informații</h2>
            <ul className="mt-3">
              {siteConfig.infoPages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/${page.slug}`} className={footerLinkClass}>
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className={columnHeadingClass}>Surse</h2>
            <p className="mt-5 font-sans text-[15px] leading-6 text-footer-link">
              Materialele agregate sunt prezentate ca extrase scurte, cu atribuire și legătură către
              publicația-sursă.
            </p>
          </div>
        </div>

        {/* Legal bar */}
        <div className="mt-12 border-t border-white/15 pt-6">
          <p className="font-sans text-[13px] leading-[18px] text-footer-meta">
            © 2026 NewsRomania · Conținutul preluat aparține surselor citate.
          </p>
          <p className="mt-2 font-sans text-[13px] leading-[18px] text-footer-meta">
            Materialele agregate aparțin publicațiilor-sursă și sunt citate cu atribuire.
          </p>
        </div>
      </div>
    </footer>
  )
}
