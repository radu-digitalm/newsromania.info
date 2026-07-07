import Link from 'next/link'

/**
 * Pagination (design direction v2 §4.5) — centered pill buttons:
 * „← Pagina anterioară” (only when page > 1) · „Pagina {n}” · „Pagina
 * următoare →”. Server-side ?page=N, no infinite scroll, no JS.
 */

const pillClass =
  'inline-flex h-11 items-center rounded-full border border-border-functional bg-surface px-5 font-sans text-[15px] font-semibold leading-5 text-ink transition-colors hover:border-link hover:text-link active:opacity-85'

export function Pagination({
  page,
  hasNextPage,
  hrefFor,
}: {
  /** Current 1-based page. */
  page: number
  hasNextPage: boolean
  /** Builds the href for a page number, e.g. (n) => `/?page=${n}`. */
  hrefFor: (page: number) => string
}) {
  if (page <= 1 && !hasNextPage) return null
  return (
    <nav aria-label="Paginare" className="my-10 flex items-center justify-center gap-3">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className={pillClass}>
          ← Pagina anterioară
        </Link>
      )}
      <span className="font-sans text-[13px] font-medium leading-[18px] text-ink-muted">
        Pagina {page}
      </span>
      {hasNextPage && (
        <Link href={hrefFor(page + 1)} className={pillClass}>
          Pagina următoare →
        </Link>
      )}
    </nav>
  )
}

/** Legacy single-button call sites — kept as a thin wrapper over the v2 pill. */
export function NextPageLink({ href }: { href: string }) {
  return (
    <p className="mt-8 text-center">
      <Link href={href} className={pillClass}>
        Pagina următoare →
      </Link>
    </p>
  )
}
