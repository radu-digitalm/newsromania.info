import Link from 'next/link'

/**
 * „Pagina următoare →” — the centered secondary bordered button (design
 * §3.3.5/§6): 44px height, 1px functional border, hover border+text
 * --color-link. Server-side pagination (?page=N), no JS, no infinite scroll.
 */
export function NextPageLink({ href }: { href: string }) {
  return (
    <p className="mt-8 text-center">
      <Link
        href={href}
        className="inline-flex h-11 items-center rounded-[2px] border border-border-functional bg-surface px-5 font-sans text-[15px] font-semibold leading-5 text-ink transition-colors hover:border-link hover:text-link active:opacity-85"
      >
        Pagina următoare →
      </Link>
    </p>
  )
}
