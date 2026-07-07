import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FeedList } from '@/components/articles/FeedList'
import { Pagination } from '@/components/articles/NextPageLink'
import { siteConfig } from '@/config/site'
import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { getFeed } from '@/lib/content'
import { absoluteUrl } from '@/lib/seo'

/**
 * Category page (design direction v2 §3.4): header block (h1 + meta line),
 * then the same full-width card grid as the homepage with per-request,
 * region-frequency in-feed ad positions (ad engine, architecture.md §4 — the
 * category slug feeds contextual keywords) and server-side pagination.
 * No duplicate chips row — the sticky chip nav already marks the active
 * category.
 */

interface CategoryPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

// Fully dynamic: the feed comes from Payload per request (Redis-cached 60s)
// and ad decisions are per-request (architecture.md §2). The taxonomy is
// still a fixed set — unknown category slugs hit notFound() below.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params
  const category = siteConfig.categories.find((c) => c.slug === slug)
  if (!category) return {}

  return {
    title: category.name,
    description: `Cele mai noi știri și articole din categoria ${category.name}, pe NewsRomania.`,
    alternates: { canonical: absoluteUrl(`/categorie/${category.slug}`) },
  }
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params
  const { page: pageParam } = await searchParams
  const parsed = Number.parseInt(pageParam ?? '1', 10)
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed

  const category = siteConfig.categories.find((c) => c.slug === slug)
  if (!category) notFound()

  const [{ items, hasNextPage }, adPlan] = await Promise.all([
    getFeed({ page, categorySlug: category.slug }),
    // Per-request ad decisions — this category drives contextual keywords.
    getRequestAdPlan(category.slug),
  ])

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-8 md:px-6 xl:px-8">
      <header>
        <span aria-hidden="true" className="inline-block h-5 w-1 rounded-[2px] bg-brand-red" />
        <h1 className="mt-3 font-serif text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] text-ink md:text-[38px] md:leading-[44px]">
          {category.name}
        </h1>
        <p className="mt-2 font-sans text-[13px] font-medium leading-[18px] text-ink-muted">
          Cele mai noi știri din categoria {category.name}
          {page > 1 ? ` · pagina ${page}` : ''}
        </p>
      </header>

      {items.length > 0 ? (
        <>
          <div className="mt-6">
            {/* In-feed ad cards at region-frequency positions from the ad plan (§6.2/§4.4). */}
            <FeedList items={items} adPlan={adPlan} headingAs="h2" />
          </div>
          <Pagination
            page={page}
            hasNextPage={hasNextPage}
            hrefFor={(n) => `/categorie/${category.slug}?page=${n}`}
          />
        </>
      ) : (
        <div className="mt-10 rounded-[16px] border border-border bg-surface px-6 py-12 text-center">
          <p className="font-serif text-xl font-bold leading-7 text-ink">
            Încă nu avem articole în această categorie.
          </p>
          <p className="mt-2 font-sans text-[15px] leading-[22px] text-ink-secondary">
            Publicăm știri noi în fiecare zi — revino în curând sau explorează celelalte categorii.
          </p>
          <p className="mt-4">
            <Link
              href="/"
              className="inline-block py-3 font-sans text-[15px] font-semibold leading-5 text-link transition-colors hover:text-link-hover"
            >
              ← Înapoi la prima pagină
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
