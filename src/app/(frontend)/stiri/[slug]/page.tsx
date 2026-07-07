import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import { ArticleAdSlot } from '@/components/ads/ArticleAdSlot'
import { ArticleCard, ExternalLinkIcon, SourcePill } from '@/components/articles/ArticleCard'
import { ArticleImage } from '@/components/articles/ArticleImage'
import { CategoryChip } from '@/components/articles/CategoryChip'
import { formatArticleDate } from '@/components/articles/format-date'
import { decisionFor, type AdPlan } from '@/lib/ads/engine'
import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { getFeed, getFeedItemBySlug } from '@/lib/content'
import { absoluteUrl, articleJsonLd, serializeJsonLd } from '@/lib/seo'
import { siteConfig } from '@/config/site'
import type { AggregatedItem, FeedItem } from '@/types/content'

/**
 * Article page — /stiri/<slug> (design direction v2 §3.5), both content types:
 *
 * - ORIGINAL: full body, byline, NewsArticle JSON-LD, self-canonical.
 * - AGGREGATED (the owner's flow — card → THIS page → external button):
 *   source-pill attribution + short fair-use excerpt ONLY (never full text),
 *   then the prominent full-width „Citește articolul integral pe {Sursă}”
 *   button (new tab, rel="noopener noreferrer nofollow") + disclaimer line.
 *   Canonical keeps pointing to the original publisher (PROJECT_BRIEF §16)
 *   and no structured data is emitted — we never claim authorship.
 *
 * Ads (owner requirement 3): BOTH types carry the responsive top banner
 * (above the <article> — never between title and attribution), one in-article
 * slot and one end-of-article slot, exactly like each other.
 */

interface ArticlePageProps {
  params: Promise<{ slug: string }>
}

// Fully dynamic: new articles must resolve without a rebuild, and ad
// decisions are per-request (architecture.md §2). Unknown slugs 404 via
// notFound() below.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const article = await getFeedItemBySlug(slug)
  if (!article) return {}

  // Aggregated items canonicalize to the original publisher — their page here
  // is only a landing surface; the publisher's page is the canonical one.
  const canonical =
    article.type === 'original' ? absoluteUrl(`/stiri/${article.slug}`) : article.sourceUrl
  const ogImages = article.image
    ? [
        {
          url: absoluteUrl(article.image.url),
          width: article.image.width,
          height: article.image.height,
          alt: article.image.alt,
        },
      ]
    : undefined

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      // locale/siteName repeated here: page-level openGraph REPLACES the
      // layout's object (no deep merge), so they'd be dropped otherwise.
      locale: 'ro_RO',
      siteName: siteConfig.name,
      title: article.title,
      description: article.excerpt,
      url: absoluteUrl(`/stiri/${article.slug}`),
      publishedTime: article.publishedAt,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.excerpt,
      images: ogImages?.map((image) => image.url),
    },
  }
}

/** Lead image (§3.5 ⑤): real photo, 16:9, radius 16px, eager + high priority. */
function LeadImage({ article }: { article: FeedItem }) {
  // „Foto: {Sursă}” only over a REAL publisher photo — never over our own
  // branded placeholder (attribution accuracy, PROJECT_BRIEF 0.1/0.2). The
  // read layer falls back to /placeholders/<slug>.png when imageUrl is
  // missing/disallowed, so the path prefix is the placeholder signal.
  const hasPublisherPhoto = Boolean(
    article.image && !article.image.url.startsWith('/placeholders/'),
  )
  return (
    <figure className="mt-6">
      <div className="aspect-video overflow-hidden rounded-[16px] shadow-[inset_0_0_0_1px_rgba(16,22,31,0.06)]">
        <ArticleImage
          src={article.image?.url ?? null}
          alt={article.image?.alt ?? article.title}
          categorySlug={article.category.slug}
          priority
          sizes="(min-width: 768px) 680px, 100vw"
        />
      </div>
      {article.type === 'aggregated' && hasPublisherPhoto && (
        <figcaption className="mt-2 font-sans text-[13px] leading-[18px] text-ink-muted">
          Foto: {article.source.name}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * The primary CTA (owner requirement 2 / v2 §3.5.2): full-width up to 560px,
 * 52px, „Citește articolul integral pe {Sursă}” + ↗, new tab,
 * rel="noopener noreferrer nofollow", with the disclaimer line beneath it.
 */
function ReadFullArticleCta({ article }: { article: AggregatedItem }) {
  return (
    <div className="mt-8">
      <a
        href={article.sourceUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex h-[52px] w-full max-w-[560px] items-center justify-center gap-2 rounded-[12px] bg-link px-5 text-center font-sans text-base font-semibold leading-[22px] text-white transition-colors hover:bg-link-hover active:opacity-85"
      >
        Citește articolul integral pe {article.source.name}
        <ExternalLinkIcon className="h-[18px] w-[18px] shrink-0" />
        <span className="sr-only">
          {' '}
          (link extern către {article.source.name} — se deschide în filă nouă)
        </span>
      </a>
      <p className="mt-3 font-sans text-[13px] leading-[18px] text-ink-muted">
        Fragmentul de mai sus este un rezumat. Articolul integral aparține {article.source.name}.
      </p>
    </div>
  )
}

/** Shared header block (§3.5 ②–④): category chip, h1, attribution/meta row. */
function ArticleHeader({ article }: { article: FeedItem }) {
  return (
    <>
      <CategoryChip category={article.category} size="small" />

      <h1 className="mt-4 font-serif text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] text-ink md:text-[38px] md:leading-[44px]">
        {article.title}
      </h1>

      {article.type === 'original' ? (
        <p className="mt-4 font-sans text-[13px] leading-[18px] text-ink-muted">
          de <span className="font-semibold text-ink">{article.author.name}</span>
          {' · '}
          <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
        </p>
      ) : (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[13px] leading-[18px] text-ink-muted">
          {/* On the attribution row the pill links to the publisher homepage (§4.3). */}
          <SourcePill name={article.source.name} href={article.source.url} />
          <span aria-hidden="true">·</span>
          <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
        </p>
      )}

      <LeadImage article={article} />
    </>
  )
}

/** „Mai multe știri” (§3.5 ⑧): 3 standard cards from the same category. */
async function MoreFromCategory({ article }: { article: FeedItem }) {
  const { items } = await getFeed({ page: 1, categorySlug: article.category.slug })
  const related = items.filter((item) => item.slug !== article.slug).slice(0, 3)
  if (related.length === 0) return null
  return (
    <section aria-labelledby="mai-multe-stiri" className="mx-auto mt-10 w-full max-w-[1280px]">
      <h2
        id="mai-multe-stiri"
        className="flex items-center gap-2.5 font-serif text-[22px] font-bold leading-7 tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]"
      >
        <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-[2px] bg-brand-red" />
        Mai multe știri din {article.category.name}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {related.map((item) => (
          <ArticleCard key={item.id} item={item} as="h3" />
        ))}
      </div>
    </section>
  )
}

/** Standfirst / aggregated fair-use excerpt block (§2.2 standfirst token). */
function Standfirst({ text }: { text: string }) {
  return (
    <p className="mt-6 font-sans text-lg font-medium leading-7 text-ink-secondary md:text-xl md:leading-8">
      {text}
    </p>
  )
}

function ArticleShell({
  adPlan,
  children,
  after,
}: {
  adPlan: AdPlan
  children: React.ReactNode
  after?: React.ReactNode
}) {
  return (
    <div className="pb-16">
      {/* Top banner (§3.5 ①) — above the <article>, so no ad ever sits
          between title and attribution (hard rule kept). */}
      <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6 xl:px-8">
        <AdSlot variant="leaderboard" decision={decisionFor(adPlan, 'leaderboard')} />
      </div>

      {/* Reading surface: full-bleed white section on the page canvas. */}
      <div className="bg-surface">
        <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6 xl:px-8">
          <article className="mx-auto max-w-[760px] py-8 md:py-10">{children}</article>
        </div>
      </div>

      {after && <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6 xl:px-8">{after}</div>}
    </div>
  )
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const article = await getFeedItemBySlug(slug)
  if (!article) notFound()

  // Per-request ad decisions (architecture.md §4) — the article's category
  // drives contextual keywords; consent/profile handled inside the helper.
  const adPlan = await getRequestAdPlan(article.category.slug)
  const articleAd = decisionFor(adPlan, 'article')
  // End-of-article slot has its OWN placement in the plan ('article-end',
  // rectangle default, its own unit pool + Amazon eligibility — ads engine v2).
  const articleEndAd = decisionFor(adPlan, 'article-end')

  if (article.type === 'aggregated') {
    return (
      <ArticleShell adPlan={adPlan} after={<MoreFromCategory article={article} />}>
        <ArticleHeader article={article} />
        {/* Fair-use excerpt — NEVER full text (PROJECT_BRIEF 0.1/0.2). */}
        <Standfirst text={article.excerpt} />
        {/* CTA directly after the excerpt; the ad comes only BELOW the CTA
            block — never between excerpt and CTA (misclick protection). */}
        <ReadFullArticleCta article={article} />
        <ArticleAdSlot decision={articleAd} />
        <ArticleAdSlot decision={articleEndAd} />
      </ArticleShell>
    )
  }

  const jsonLd = articleJsonLd(article)

  return (
    <ArticleShell adPlan={adPlan} after={<MoreFromCategory article={article} />}>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}

      <ArticleHeader article={article} />
      <Standfirst text={article.excerpt} />

      {/* Original body — 680px reading column (§3.5.1). */}
      <div className="max-w-[680px] font-sans text-[17px] leading-7 text-ink md:text-lg md:leading-[30px]">
        {article.body.map((paragraph, index) => (
          <Fragment key={index}>
            <p className="mt-5">{paragraph}</p>
            {/* One in-article slot after the 3rd paragraph — never between
                title and byline (§4.4 placement ethics). */}
            {index === 2 && article.body.length > 3 && <ArticleAdSlot decision={articleAd} />}
          </Fragment>
        ))}
      </div>

      {/* End-of-article slot (§3.5 ⑦) — the SAME dedicated 'article-end'
          placement as on aggregated pages, so both content types draw from
          one unit pool and Amazon eligibility for this slot. */}
      <ArticleAdSlot decision={articleEndAd} />
    </ArticleShell>
  )
}
