import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CategoryChip } from '@/components/articles/CategoryChip'
import { FeedList } from '@/components/articles/FeedList'
import { NextPageLink } from '@/components/articles/NextPageLink'
import { siteConfig } from '@/config/site'
import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { getFeed } from '@/lib/content'
import { absoluteUrl } from '@/lib/seo'

/**
 * Category page — chips row for switching categories, then the category feed
 * with per-request, region-frequency in-feed ad positions (ad engine,
 * architecture.md §4 — the category slug feeds contextual keywords) and the
 * same server-side pagination as the home feed.
 */

interface CategoryPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

// Fully dynamic: the feed comes from Payload per request (Redis-cached 60s)
// and ad decisions become per-request (architecture.md §2). The taxonomy is
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
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
      <h1 className="font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-4xl md:leading-[44px]">
        {category.name}
      </h1>

      {/* Chips row — horizontal scroll on mobile with the same 24px right-edge
          fade as the nav (§4.3/§3.2), wraps on desktop. */}
      <nav aria-label="Categorii" className="mt-5">
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] max-md:[mask-image:linear-gradient(90deg,#000_calc(100%-24px),transparent)] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
          {siteConfig.categories.map((c) => (
            <li key={c.slug} className="shrink-0">
              <CategoryChip category={c} active={c.slug === category.slug} />
            </li>
          ))}
        </ul>
      </nav>

      {items.length > 0 ? (
        <div className="mt-4">
          {/* In-feed AdSlots at region-frequency positions from the ad plan (§6.2/§4.5). */}
          <FeedList items={items} adPlan={adPlan} headingAs="h2" />
          {hasNextPage && <NextPageLink href={`/categorie/${category.slug}?page=${page + 1}`} />}
        </div>
      ) : (
        <div className="mt-10 rounded-[2px] border border-border bg-surface px-6 py-12 text-center">
          <p className="font-serif text-xl font-semibold leading-7 text-ink">
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
