import Image from 'next/image'
import Link from 'next/link'
import { siteConfig } from '@/config/site'
import { TricolorBar } from './TricolorBar'
import logoSymbol from '../../../assets/logo-symbol.png'

const columnHeadingClass =
  'font-sans text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-white'

// Footer sits on ink, so focus rings flip to yellow (design v2 §6);
// hover: white text + 2px yellow underline (§3.6).
const footerLinkClass =
  'block py-2.5 font-sans text-[15px] leading-6 text-footer-link transition-colors hover:text-white hover:underline hover:decoration-brand-yellow hover:decoration-2 hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow active:opacity-85'

/** Site footer (design direction v2 §3.6) — the page's single `contentinfo` landmark. */
export function Footer() {
  return (
    <footer className="bg-ink">
      <TricolorBar />
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-12 md:px-6 xl:px-8">
        {/* Brand row */}
        <div className="flex items-center gap-4">
          <Image src={logoSymbol} alt="" className="h-10 w-auto" />
          <div>
            <p className="font-serif text-xl font-bold leading-6 text-[var(--color-ink-inverse,#FFFFFF)]">
              NewsRomania
            </p>
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
              {/* GDPR: withdraw/change the cookie choice at any time (brief §8). */}
              <li>
                <Link href="/setari-cookies" className={footerLinkClass}>
                  Setări cookies
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={columnHeadingClass}>Surse</h2>
            {/* Legal basis (docs/legal-basis-aggregation.md): „în condițiile...”
                cites the basis without claiming blanket legality — do not
                strengthen. 94¹ = Unicode superscript one (official citation form). */}
            <p className="mt-5 font-sans text-[15px] leading-6 text-footer-link">
              Preluăm din articolele agregate doar extrase foarte scurte sau scurte citate, cu
              atribuire și legătură către publicația-sursă, în condițiile art. 35 alin. (1) lit. b)
              și art. 94¹ alin. (2) din Legea nr. 8/1996 și ale art. 15 din Directiva (UE) 2019/790.
            </p>
          </div>
        </div>

        {/* Legal bar */}
        <div className="mt-12 border-t border-white/[0.14] pt-6">
          <p className="font-sans text-[13px] leading-[18px] text-footer-meta">
            © 2026 NewsRomania · Conținutul preluat aparține surselor citate.
          </p>
        </div>
      </div>
    </footer>
  )
}
