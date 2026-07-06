'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { siteConfig } from '@/config/site'

/**
 * Category nav links with the current-section state (design §3.2): the active
 * category gets `aria-current="page"` + the inset 3px #ED2024 bottom bar.
 * Client boundary only for `usePathname()` — the markup is fully
 * server-rendered and the nav works with JavaScript disabled.
 */
export function CategoryNavList() {
  const pathname = usePathname()

  return (
    <ul className="-mx-3 flex overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] max-md:[mask-image:linear-gradient(90deg,#000_calc(100%-24px),transparent)] [&::-webkit-scrollbar]:hidden">
      {siteConfig.categories.map((category) => {
        const href = `/categorie/${category.slug}`
        const active = pathname === href
        return (
          <li key={category.slug} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`block whitespace-nowrap px-3 py-3.5 font-sans text-sm font-semibold leading-5 text-ink transition-colors hover:text-link active:opacity-85${
                active ? ' shadow-[inset_0_-3px_0_var(--color-brand-red)]' : ''
              }`}
            >
              {category.name}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
