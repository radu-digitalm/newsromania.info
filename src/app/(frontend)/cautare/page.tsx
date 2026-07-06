import type { Metadata } from 'next'

import { FeedList } from '@/components/articles/FeedList'
import { mockFeed } from '@/lib/mock-data'

/**
 * /cautare — the masthead search entry point (design §3.2, „Quiet Tricolor”
 * graft): a PAGE with a plain GET form, zero JavaScript. Results are
 * server-rendered from the ?q= parameter. Noindex: internal search results
 * must not enter the index.
 */

export const metadata: Metadata = {
  title: 'Caută',
  description: 'Caută în articolele și știrile publicate pe NewsRomania.',
  robots: { index: false, follow: true },
}

/** Diacritic-insensitive matching, so „sanatate” finds „sănătate”. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const needle = normalize(query)
  const results = needle
    ? mockFeed.filter((item) => normalize(`${item.title} ${item.excerpt}`).includes(needle))
    : []

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
      <h1 className="font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-4xl md:leading-[44px]">
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
          className="h-11 w-full min-w-0 rounded-[2px] border border-border-functional bg-surface px-3 font-sans text-[15px] leading-5 text-ink placeholder:text-ink-muted"
        />
        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center rounded-[2px] bg-link px-5 font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover active:opacity-85"
        >
          Caută
        </button>
      </form>

      {query ? (
        results.length > 0 ? (
          <section className="mt-6" aria-label="Rezultatele căutării">
            <p className="font-sans text-[15px] leading-[22px] text-ink-secondary">
              {results.length === 1 ? 'Un rezultat pentru ' : `${results.length} rezultate pentru `}
              <strong className="font-semibold text-ink">„{query}”</strong>
            </p>
            <FeedList items={results} headingAs="h2" />
          </section>
        ) : (
          <p className="mt-6 font-sans text-[15px] leading-[22px] text-ink-secondary">
            Niciun rezultat pentru <strong className="font-semibold text-ink">„{query}”</strong>.
            Încearcă un alt termen sau explorează categoriile din meniu.
          </p>
        )
      ) : (
        <p className="mt-6 font-sans text-[15px] leading-[22px] text-ink-secondary">
          Introdu un termen pentru a căuta în articolele și știrile publicate pe NewsRomania.
        </p>
      )}
    </div>
  )
}
