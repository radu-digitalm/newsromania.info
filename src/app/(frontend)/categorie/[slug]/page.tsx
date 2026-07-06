import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CategoryChip } from '@/components/articles/CategoryChip'
import { FeedList } from '@/components/articles/FeedList'
import { NextPageLink } from '@/components/articles/NextPageLink'
import { siteConfig } from '@/config/site'
import { getItemsByCategory } from '@/lib/mock-data'
import { absoluteUrl } from '@/lib/seo'

/**
 * Category page — chips row for switching categories, then the category feed
 * with the same fixed in-feed ad positions (rows 4 & 12) as the home feed and
 * the same server-side pagination.
 */

const PAGE_SIZE = 10

interface CategoryPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export function generateStaticParams() {
  return siteConfig.categories.map(({ slug }) => ({ slug }))
}

// The taxonomy is a fixed set: unknown category slugs 404 at the ROUTING
// level and get the fully server-rendered branded global 404.
export const dynamicParams = false

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

  const allItems = getItemsByCategory(category.slug)
  const items = allItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const hasNextPage = allItems.length > page * PAGE_SIZE

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
          {/* In-feed AdSlots at the fixed positions: after rows 4 and 12 (§3.3.3/§4.5). */}
          <FeedList items={items} withAds headingAs="h2" />
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
