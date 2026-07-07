import type { Metadata } from 'next'

import { ArticleCard } from '@/components/articles/ArticleCard'
import { search } from '@/lib/content'

/**
 * /cautare — the masthead search entry point (design direction v2 §3.4): a
 * PAGE with a plain GET form, zero JavaScript. Results are server-rendered
 * from the ?q= parameter via the diacritic-insensitive search in
 * src/lib/content.ts, as list-tier rows with hairline dividers. Noindex:
 * internal search results must not enter the index.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Caută',
  description: 'Caută în articolele și știrile publicate pe NewsRomania.',
  robots: { index: false, follow: true },
}

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const results = query ? await search(query) : []

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-8 md:px-6 xl:px-8">
      <span aria-hidden="true" className="inline-block h-5 w-1 rounded-[2px] bg-brand-red" />
      <h1 className="mt-3 font-serif text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] text-ink md:text-[38px] md:leading-[44px]">
        Caută
      </h1>

      <form action="/cautare" method="get" className="mt-6 flex max-w-[560px] gap-2">
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

      {query ? (
        results.length > 0 ? (
          <section className="mt-8" aria-label="Rezultatele căutării">
            <p className="font-sans text-[15px] leading-[22px] text-ink-secondary">
              {results.length === 1 ? 'Un rezultat pentru ' : `${results.length} rezultate pentru `}
              <strong className="font-semibold text-ink">„{query}”</strong>
            </p>
            {/* List-tier rows with hairline dividers (§3.4/§4.1d). */}
            <ul className="mt-4 max-w-[760px]">
              {results.map((item) => (
                <li
                  key={item.id}
                  className="border-b border-border py-4 first:pt-0 last:border-b-0"
                >
                  <ArticleCard item={item} variant="list" as="h2" />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-8 font-sans text-[15px] leading-[22px] text-ink-secondary">
            Niciun rezultat pentru <strong className="font-semibold text-ink">„{query}”</strong>.
            Încearcă un alt termen sau explorează categoriile din meniu.
          </p>
        )
      ) : (
        <p className="mt-8 font-sans text-[15px] leading-[22px] text-ink-secondary">
          Introdu un termen pentru a căuta în articolele și știrile publicate pe NewsRomania.
        </p>
      )}
    </div>
  )
}
