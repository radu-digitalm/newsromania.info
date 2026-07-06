import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CategoryChip } from '@/components/articles/CategoryChip'
import { FeedList } from '@/components/articles/FeedList'
import { siteConfig } from '@/config/site'
import { getItemsByCategory } from '@/lib/mock-data'
import { absoluteUrl } from '@/lib/seo'

/**
 * Category page — chips row for switching categories, then the category feed
 * with the same every-4th-row ad rule as the home feed.
 */

interface CategoryPageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return siteConfig.categories.map(({ slug }) => ({ slug }))
}

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

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  const category = siteConfig.categories.find((c) => c.slug === slug)
  if (!category) notFound()

  const items = getItemsByCategory(category.slug)

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
      <h1 className="font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-4xl md:leading-[44px]">
        {category.name}
      </h1>

      {/* Chips row — horizontal scroll on mobile, wraps on desktop (§4.3). */}
      <nav aria-label="Categorii" className="mt-5">
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
          {siteConfig.categories.map((c) => (
            <li key={c.slug} className="shrink-0">
              <CategoryChip category={c} active={c.slug === category.slug} />
            </li>
          ))}
        </ul>
      </nav>

      {items.length > 0 ? (
        <div className="mt-4">
          {/* AdSlot injected after every 4th row — default frequency, configurable later per region (PROJECT_BRIEF 6.2). */}
          <FeedList items={items} withAds headingAs="h2" />
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
