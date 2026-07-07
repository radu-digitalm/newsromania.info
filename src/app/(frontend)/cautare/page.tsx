import type { Metadata } from 'next'

import { FeedList } from '@/components/articles/FeedList'
import { FeedStream } from '@/components/articles/FeedStream'
import { Pagination } from '@/components/articles/NextPageLink'
import { search } from '@/lib/content'

/**
 * /cautare — v2.1 „Flux Social” (design direction §8.3): the plain GET form
 * is unchanged (zero JavaScript required); results become the SAME PostCard
 * stream as the feed routes (replacing the v2 list-tier rows — deliberate,
 * §8.11), paged by 10, in the centered max-w-2xl column on the dimmed canvas.
 * NO ads at any depth — parity with today's ad-free search AND page-1 SSR
 * parity (batches must never carry ads the SSR page wouldn't, §8.8). Page 1
 * mounts FeedStream (withAds=false); ?page≥2 renders the classic SSR page
 * with §4.5 Pagination pills. Noindex: internal search results must not
 * enter the index.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Caută',
  description: 'Caută în articolele și știrile publicate pe NewsRomania.',
  robots: { index: false, follow: true },
}

/** Search page size (§8.8) — the same 10-item window content.searchPage() serves. */
const SEARCH_PAGE_SIZE = 10

interface SearchPageProps {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, page: pageParam } = await searchParams
  const query = (q ?? '').trim()
  const parsed = Number.parseInt(pageParam ?? '1', 10)
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed
  const isFirstPage = page === 1

  // §8.8 searchPage() slicing semantics: windows of 10 over the (uncached)
  // diacritic-insensitive search, hasNextPage when results overflow the page.
  const results = query ? await search(query) : []
  const items = results.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE)
  const hasNextPage = results.length > page * SEARCH_PAGE_SIZE
  const hrefFor = (n: number) => `/cautare?q=${encodeURIComponent(query)}&page=${n}`

  return (
    <div className="min-h-full bg-canvas-dim">
      <div className="mx-auto w-full max-w-2xl px-0 pb-16 pt-4 sm:px-4 md:px-6 md:pt-6">
        {/* Form block — unchanged grammar (§3.4); 16px inline padding <640px
            because the column is edge-to-edge there (§8.2). */}
        <div className="px-4 sm:px-0">
          <span aria-hidden="true" className="inline-block h-5 w-1 rounded-[2px] bg-brand-red" />
          <h1 className="mt-3 font-serif text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] text-ink md:text-[38px] md:leading-[44px]">
            Caută
          </h1>

          <form action="/cautare" method="get" className="mt-6 flex gap-2">
            <label htmlFor="q" className="sr-only">
              Termenul căutat
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Caută în știri…"
              className="h-12 w-full min-w-0 rounded-[12px] border border-border-functional bg-surface px-4 font-sans text-[15px] leading-5 text-ink placeholder:text-ink-muted"
            />
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center rounded-[12px] bg-link px-5 font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover active:opacity-85"
            >
              Caută
            </button>
          </form>
        </div>

        {query ? (
          items.length > 0 ? (
            <section className="mt-8" aria-label="Rezultatele căutării">
              <p className="px-4 font-sans text-[15px] leading-[22px] text-ink-secondary sm:px-0">
                {results.length === 1
                  ? 'Un rezultat pentru '
                  : `${results.length} rezultate pentru `}
                <strong className="font-semibold text-ink">„{query}”</strong>
                {page > 1 ? ` · pagina ${page}` : ''}
              </p>
              {/* Results as the same PostCard stream — NO adPlan, ever (§8.8). */}
              <div className="mt-4">
                <FeedList items={items} headingAs="h2" />
              </div>
              {isFirstPage ? (
                <>
                  <FeedStream
                    startPage={2}
                    params={{ q: query }}
                    initialHasMore={hasNextPage}
                    adOrdinalStart={0}
                    headingAs="h2"
                    withAds={false}
                  />
                  {hasNextPage && (
                    <noscript>
                      <Pagination page={1} hasNextPage hrefFor={hrefFor} />
                    </noscript>
                  )}
                </>
              ) : (
                <Pagination page={page} hasNextPage={hasNextPage} hrefFor={hrefFor} />
              )}
            </section>
          ) : (
            <p className="mt-8 px-4 font-sans text-[15px] leading-[22px] text-ink-secondary sm:px-0">
              Niciun rezultat pentru <strong className="font-semibold text-ink">„{query}”</strong>.
              Încearcă un alt termen sau explorează categoriile din meniu.
            </p>
          )
        ) : (
          <p className="mt-8 px-4 font-sans text-[15px] leading-[22px] text-ink-secondary sm:px-0">
            Introdu un termen pentru a căuta în articolele și știrile publicate pe NewsRomania.
          </p>
        )}
      </div>
    </div>
  )
}
