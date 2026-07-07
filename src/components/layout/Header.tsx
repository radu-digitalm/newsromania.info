import Image from 'next/image'
import Link from 'next/link'
import { CategoryNavList } from './CategoryNavList'
import { TricolorBar } from './TricolorBar'
import logoFull from '../../../assets/logo-full.png'
import logoSymbol from '../../../assets/logo-symbol.png'

/** Romanian long-form current date, e.g. „marți, 7 iulie 2026” (server-rendered). */
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
 * Site header v2 (design direction v2 §3.2): tricolor bar → white masthead
 * (logo + date + search) → sticky chip nav with the brand symbol. Fully
 * functional without JavaScript — the sticky nav is pure CSS and the active
 * chip is server-rendered from the pathname.
 *
 * Sticky mechanics: the whole header is `position: sticky` with a negative
 * top offset equal to tricolor bar + masthead (incl. its 1px border), so once
 * the page scrolls only the 56px chip nav stays pinned to the viewport top.
 * Mobile: -(3 + 60 + 1) = -64px · Desktop: -(3 + 72 + 1) = -76px.
 */
export function Header() {
  const today = currentDateRo()

  return (
    <header className="sticky top-[-64px] z-50 md:top-[-76px]">
      <TricolorBar />

      {/* Masthead — white, 60px / 72px, hairline bottom edge (no broadsheet fold rule). */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex h-[60px] w-full max-w-[1280px] items-center justify-between px-4 md:h-[72px] md:px-6 xl:px-8">
          {/* h-11 keeps the anchor's hit box ≥44px on mobile, where the logo renders at 32px. */}
          <Link href="/" className="flex h-11 shrink-0 items-center active:opacity-85">
            <Image src={logoFull} alt="NewsRomania" priority className="h-8 w-auto md:h-10" />
          </Link>
          <div className="flex items-center gap-4">
            <time
              dateTime={today.iso}
              className="hidden font-sans text-[13px] font-medium leading-[18px] text-ink-muted md:block"
            >
              {today.label}
            </time>
            {/* Search is a page (/cautare), not a dropdown — zero JS. */}
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

      {/* Chip nav (§3.2.3) — 56px, frosted white (solid fallback when
          backdrop-filter is unsupported), brand symbol persists after the
          masthead scrolls away. Horizontal scroll + right fade on mobile. */}
      <nav
        aria-label="Navigare principală"
        className="border-b border-border bg-surface supports-[backdrop-filter:blur(1px)]:bg-white/[0.92] supports-[backdrop-filter:blur(1px)]:backdrop-blur-[8px]"
      >
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-2 px-4 md:px-6 xl:px-8">
          <Link
            href="/"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center active:opacity-85"
          >
            <Image src={logoSymbol} alt="NewsRomania — prima pagină" className="h-7 w-auto" />
          </Link>
          <CategoryNavList />
        </div>
      </nav>
    </header>
  )
}
