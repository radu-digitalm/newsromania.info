import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import { ExternalLinkIcon, Kicker, SourcePill } from '@/components/articles/ArticleCard'
import { formatArticleDate } from '@/components/articles/format-date'
import { decisionFor } from '@/lib/ads/engine'
import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { getFeedItemBySlug } from '@/lib/content'
import { absoluteUrl, articleJsonLd, serializeJsonLd } from '@/lib/seo'
import { siteConfig } from '@/config/site'
import type { AggregatedItem, FeedItem, ImageRef } from '@/types/content'

/**
 * Article page (design direction §3.5) — both content types:
 * - ORIGINAL: full body, byline, NewsArticle JSON-LD, self-canonical.
 * - AGGREGATED: source-pill row + short fair-use excerpt ONLY (never full
 *   text), ending in the full-width „Citește articolul integral pe {Sursă} ↗”
 *   button. Canonical points to the original publisher (PROJECT_BRIEF §16)
 *   and no structured data is emitted — we never claim authorship.
 */

interface ArticlePageProps {
  params: Promise<{ slug: string }>
}

// Fully dynamic: new articles must resolve without a rebuild, and ad
// decisions become per-request (architecture.md §2). Unknown slugs 404 via
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

function LeadImage({ image }: { image: ImageRef }) {
  return (
    <figure className="mt-5">
      <div className="relative aspect-video overflow-hidden rounded-[2px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[2px] after:shadow-[inset_0_0_0_1px_rgba(20,24,29,0.08)] after:content-['']">
        <Image
          src={image.url}
          alt={image.alt}
          fill
          priority
          sizes="(min-width: 768px) 680px, 100vw"
          className="object-cover"
        />
      </div>
    </figure>
  )
}

function BackToHomeLink() {
  return (
    <p className="mt-8">
      <Link
        href="/"
        className="inline-block py-3 font-sans text-[15px] font-semibold leading-5 text-link transition-colors hover:text-link-hover"
      >
        ← Înapoi la prima pagină
      </Link>
    </p>
  )
}

/** Full-width primary link-button to the publisher (§3.5, „Quiet Tricolor” graft). */
function ReadFullArticleButton({ article }: { article: AggregatedItem }) {
  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[2px] bg-link px-5 text-center font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover active:opacity-85"
    >
      Citește articolul integral pe {article.source.name}
      <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only"> (link extern către {article.source.name})</span>
    </a>
  )
}

function ArticleHeader({ article }: { article: FeedItem }) {
  return (
    <>
      <Kicker category={article.category} />

      <h1 className="mt-4 font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-4xl md:leading-[44px]">
        {article.title}
      </h1>

      {article.type === 'original' ? (
        <p className="mt-3 font-sans text-[13px] leading-[18px] text-ink-muted">
          de <span className="font-semibold text-ink">{article.author.name}</span>
          {' · '}
          <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
        </p>
      ) : (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[13px] leading-[18px] text-ink-muted">
          <SourcePill name={article.source.name} />
          <span aria-hidden="true">·</span>
          <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
        </p>
      )}

      {/* Standfirst — the lead paragraph (§2.2); for aggregated items this IS
          the whole fair-use excerpt. */}
      <p className="mt-5 font-serif text-lg leading-7 text-ink-secondary md:text-xl md:leading-8">
        {article.excerpt}
      </p>

      {article.image && <LeadImage image={article.image} />}
    </>
  )
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const article = await getFeedItemBySlug(slug)
  if (!article) notFound()

  if (article.type === 'aggregated') {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
        <article className="mx-auto max-w-[680px] rounded-[2px] bg-surface px-4 py-6 md:px-8 md:py-8">
          <ArticleHeader article={article} />
          <ReadFullArticleButton article={article} />
          <BackToHomeLink />
        </article>
      </div>
    )
  }

  // Per-request ad decisions (architecture.md §4) — the article's category
  // drives contextual keywords; consent/profile handled inside the helper.
  const adPlan = await getRequestAdPlan(article.category.slug)
  const articleAd = decisionFor(adPlan, 'article')

  const jsonLd = articleJsonLd(article)

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}

      <article className="mx-auto max-w-[680px] rounded-[2px] bg-surface px-4 py-6 md:px-8 md:py-8">
        <ArticleHeader article={article} />

        <div className="mt-6 font-serif text-[17px] leading-[29px] text-ink md:text-lg md:leading-[31px]">
          {article.body.map((paragraph, index) => (
            <Fragment key={index}>
              <p className="mt-5 first:mt-0">{paragraph}</p>
              {/* One in-article slot after the 3rd paragraph — never between title and byline (§4.5). */}
              {index === 2 && article.body.length > 3 && (
                <AdSlot variant="article" decision={articleAd} />
              )}
            </Fragment>
          ))}
        </div>

        {/* Second in-article slot at article end (§3.5/§4.5). */}
        <AdSlot variant="article" decision={articleAd} />

        <BackToHomeLink />
      </article>
    </div>
  )
}
