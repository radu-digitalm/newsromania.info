import Image from 'next/image'
import Link from 'next/link'
import { siteConfig } from '@/config/site'
import { TricolorBar } from './TricolorBar'
import logoFull from '../../../assets/logo-full.png'

/** Romanian long-form current date, e.g. „luni, 6 iulie 2026” (server-rendered). */
function currentDateRo(): { iso: string; label: string } {
  const now = new Date()
  const timeZone = 'Europe/Bucharest'
  return {
    iso: new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
    label: new Intl.DateTimeFormat('ro-RO', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now),
  }
}

/**
 * Site header (design §3.2), zero JavaScript: tricolor bar → white masthead
 * with the full lockup + search entry point → sticky category nav.
 *
 * The whole header is `position: sticky` with a negative top offset equal to
 * the tricolor bar + masthead height, so once the page scrolls only the 48px
 * category nav stays pinned to the viewport top — pure CSS, no JS.
 * Mobile: -(3 + 64 + 2) = -69px · Desktop: -(3 + 88 + 2) = -93px.
 */
export function Header() {
  const today = currentDateRo()

  return (
    <header className="sticky top-[-69px] z-50 md:top-[-93px]">
      <TricolorBar />

      {/* Masthead — white, with the 2px ink „fold rule” as its bottom edge */}
      <div className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 md:h-[88px] md:px-6">
          <Link href="/" className="shrink-0 active:opacity-85">
            <Image src={logoFull} alt="NewsRomania" priority className="h-9 w-auto md:h-12" />
          </Link>
          <div className="flex items-center gap-4">
            <time
              dateTime={today.iso}
              className="hidden font-sans text-[13px] leading-[18px] text-ink-muted md:block"
            >
              {today.label}
            </time>
            {/* Search is a page (/cautare), not a dropdown — zero JS */}
            <Link
              href="/cautare"
              className="flex h-11 w-11 items-center justify-center text-ink-muted transition-colors hover:text-link active:opacity-85"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4.35-4.35" />
              </svg>
              <span className="sr-only">Caută</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Category nav — horizontally scrollable on mobile, right-edge fade hint */}
      <nav aria-label="Navigare principală" className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
          <ul className="-mx-3 flex overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] max-md:[mask-image:linear-gradient(90deg,#000_calc(100%-24px),transparent)] [&::-webkit-scrollbar]:hidden">
            {siteConfig.categories.map((category) => (
              <li key={category.slug} className="shrink-0">
                <Link
                  href={`/categorie/${category.slug}`}
                  className="block whitespace-nowrap px-3 py-3.5 font-sans text-sm font-semibold leading-5 text-ink transition-colors hover:text-link active:opacity-85"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  )
}
