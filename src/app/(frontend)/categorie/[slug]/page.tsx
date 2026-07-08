import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SideRailAd } from '@/components/ads/SideRailAd'
import { FeedList } from '@/components/articles/FeedList'
import { FeedStream } from '@/components/articles/FeedStream'
import { Pagination } from '@/components/articles/NextPageLink'
import { siteConfig } from '@/config/site'
import { decisionFor, feedAdPositions } from '@/lib/ads/engine'
import { getRequestAdPlan, resolveFeedAmazonProducts } from '@/lib/ads/plan-for-request'
import { amazonOrdinalsForBatch } from '@/lib/feed-serialize'
import { getFeed } from '@/lib/content'
import { absoluteUrl } from '@/lib/seo'

/**
 * Category page — v2.1 „Flux Social” (design direction §8.3): the v2 §3.4
 * header block unchanged ABOVE the stream, then the centered single-column
 * PostCard stream (max-w-2xl on the dimmed canvas) with in-feed ad-posts at
 * per-request, region-frequency engine positions — the category slug drives
 * contextual keywords exactly as before. v2.2: at lg+ a 300px sticky rail ad
 * column (SideRailAd) sits beside the stream, centered together as a pair;
 * below lg nothing changes. No leaderboard, no „Cele mai
 * citite” (unchanged). Page 1 mounts FeedStream (+ noscript pagination);
 * ?page≥2 renders the classic SSR page with §4.5 Pagination pills (§8.11).
 * No duplicate chips row — the sticky chip nav already marks the active
 * category.
 */

interface CategoryPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string; geo?: string }>
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
  const { page: pageParam, geo } = await searchParams
  const parsed = Number.parseInt(pageParam ?? '1', 10)
  const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed
  const isFirstPage = page === 1

  const category = siteConfig.categories.find((c) => c.slug === slug)
  if (!category) notFound()

  const [{ items, hasNextPage }, adPlan] = await Promise.all([
    getFeed({ page, categorySlug: category.slug }),
    // Per-request ad decisions — this category drives contextual keywords.
    // ?geo=<CC> is the owner's preview override (honored only under AD_PREVIEW).
    getRequestAdPlan(category.slug, { countryOverride: geo }),
  ])

  // Unit-rotation ordinal handoff to the client batches (§8.6).
  const adOrdinalStart = feedAdPositions(adPlan.everyNth, items.length).size
  // Owner v2.4: page-1 Amazon products for the amazon-ordinal feed slots.
  const amazonProducts = await resolveFeedAmazonProducts(adPlan, {
    itemCount: items.length,
    adOrdinalStart: 0,
  })
  // Rail rotation variant (owner fix round): land the sticky rail on a product
  // distinct from the page's first in-feed Amazon slot (see home page).
  const page1FeedVariants = amazonOrdinalsForBatch(adPlan.everyNth, items.length, 0).map((o) =>
    Math.floor(o / 3),
  )
  const railVariant = page1FeedVariants.length > 0 ? Math.max(...page1FeedVariants) + 1 : 0
  const hrefFor = (n: number) => `/categorie/${category.slug}?page=${n}`

  return (
    <div className="min-h-full bg-canvas-dim">
      {/* v2.2 pair container: identical to the lone max-w-2xl column below lg;
          at lg+ it widens to fit feed (672px) + 300px rail, centered together. */}
      <div className="mx-auto flex w-full max-w-2xl justify-center lg:max-w-[972px]">
        <div className="w-full min-w-0 max-w-2xl px-0 pb-16 pt-4 sm:px-4 md:px-6 md:pt-6">
          {/* Header block (§3.4) unchanged above the stream; 16px inline padding
            <640px because the column is edge-to-edge there (§8.2). */}
          <header className="px-4 sm:px-0">
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
                {/* Single-column post stream with ad-posts at region-frequency
                  positions from the server ad plan (§8.6). */}
                <FeedList
                  items={items}
                  adPlan={adPlan}
                  amazonProducts={amazonProducts}
                  headingAs="h2"
                />
              </div>
              {isFirstPage ? (
                <>
                  <FeedStream
                    startPage={2}
                    params={{ category: category.slug }}
                    initialHasMore={hasNextPage}
                    adOrdinalStart={adOrdinalStart}
                    headingAs="h2"
                    withAds
                  />
                  {/* Belt and braces (§8.11): classic pagination for noscript. */}
                  {hasNextPage && (
                    <noscript>
                      <Pagination page={1} hasNextPage hrefFor={hrefFor} />
                    </noscript>
                  )}
                </>
              ) : (
                <Pagination page={page} hasNextPage={hasNextPage} hrefFor={hrefFor} />
              )}
            </>
          ) : (
            <div className="mx-4 mt-10 rounded-[16px] border border-border bg-surface px-6 py-12 text-center sm:mx-0">
              <p className="font-serif text-xl font-bold leading-7 text-ink">
                Încă nu avem articole în această categorie.
              </p>
              <p className="mt-2 font-sans text-[15px] leading-[22px] text-ink-secondary">
                Publicăm știri noi în fiecare zi — revino în curând sau explorează celelalte
                categorii.
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

        {/* v2.2 desktop rail — sticky 300px ad column, lg+ only; hidden ⇒
            never pushed (visibility guard in both push paths). `variant` lands
            it on a product distinct from the first in-feed Amazon slot. */}
        <SideRailAd decision={decisionFor(adPlan, 'rail')} variant={railVariant} />
      </div>
    </div>
  )
}
