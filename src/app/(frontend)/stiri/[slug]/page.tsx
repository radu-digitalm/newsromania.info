import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'

import { AdSlot } from '@/components/ads/AdSlot'
import { CategoryChip } from '@/components/articles/CategoryChip'
import { formatArticleDate } from '@/components/articles/format-date'
import { getArticleBySlug, getOriginalArticles } from '@/lib/mock-data'
import { absoluteUrl, articleJsonLd } from '@/lib/seo'

/**
 * Original article page (design direction §3.5) — ORIGINALS ONLY. Aggregated
 * items never get an on-site page; they link out to the source publisher.
 * Self-canonical: original articles belong to us.
 */

interface ArticlePageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getOriginalArticles().map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) return {}

  const canonical = absoluteUrl(`/stiri/${article.slug}`)
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
      title: article.title,
      description: article.excerpt,
      url: canonical,
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

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) notFound()

  const jsonLd = articleJsonLd(article)

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-6">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <article className="mx-auto max-w-[680px] rounded-[2px] bg-surface px-4 py-6 md:px-8 md:py-8">
        <CategoryChip category={article.category} />

        <h1 className="mt-4 font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-4xl md:leading-[44px]">
          {article.title}
        </h1>

        <p className="mt-3 font-sans text-[13px] leading-[18px] text-ink-muted">
          de <span className="font-semibold text-ink">{article.author.name}</span>
          {' · '}
          <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
        </p>

        {/* Standfirst — the lead paragraph (§2.2). */}
        <p className="mt-5 font-serif text-lg leading-7 text-ink-secondary md:text-xl md:leading-8">
          {article.excerpt}
        </p>

        {article.image && (
          <figure className="mt-5">
            <div className="relative aspect-video overflow-hidden rounded-[2px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[2px] after:shadow-[inset_0_0_0_1px_rgba(20,24,29,0.08)] after:content-['']">
              <Image
                src={article.image.url}
                alt={article.image.alt}
                fill
                priority
                sizes="(min-width: 768px) 680px, 100vw"
                className="object-cover"
              />
            </div>
          </figure>
        )}

        <div className="mt-6 font-serif text-[17px] leading-[29px] text-ink md:text-lg md:leading-[31px]">
          {article.body.map((paragraph, index) => (
            <Fragment key={index}>
              <p className="mt-5 first:mt-0">{paragraph}</p>
              {/* One in-article slot after the 3rd paragraph — never between title and byline (§4.5). */}
              {index === 2 && article.body.length > 3 && <AdSlot variant="article" />}
            </Fragment>
          ))}
        </div>

        <p className="mt-8">
          <Link
            href="/"
            className="inline-block py-3 font-sans text-[15px] font-semibold leading-5 text-link transition-colors hover:text-link-hover"
          >
            ← Înapoi la prima pagină
          </Link>
        </p>
      </article>
    </div>
  )
}
