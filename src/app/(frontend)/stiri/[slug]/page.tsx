import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdSlot } from '@/components/ads/AdSlot'
import { ArticleAdSlot } from '@/components/ads/ArticleAdSlot'
import { ArticleSideRail } from '@/components/ads/ArticleSideRail'
import { ExternalLinkIcon, SourcePill } from '@/components/articles/ArticleCard'
import { ArticleImage } from '@/components/articles/ArticleImage'
import { CategoryChip } from '@/components/articles/CategoryChip'
import { formatArticleDate } from '@/components/articles/format-date'
import { MoreNews } from '@/components/articles/MoreNews'
import { decisionFor, type AdPlan } from '@/lib/ads/engine'
import { getRequestAdPlan } from '@/lib/ads/plan-for-request'
import { recordArticleView } from '@/lib/article-views'
import { getFeedItemBySlug } from '@/lib/content'
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
 * Ads (owner requirement R3): BOTH types carry the responsive top banner
 * (above the <article> — never between title and attribution) and exactly ONE
 * ad box BELOW the article body/CTA — the dedicated 'article-end' placement,
 * which the engine marks network 'amazon' (a single product, R1/R2). There is
 * NO mid-article slot anymore (removed on both branches, R3).
 *
 * After that single box, BOTH types mount the „Mai multe știri” section
 * (owner requirement 4, <MoreNews>): four cards + two staggered AdSense boxes
 * (R5), so the article page shows both networks (Amazon below + AdSense in the
 * related-news grid).
 */

interface ArticlePageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ geo?: string }>
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
  // No real photo → render NOTHING: no lead figure, no empty 16:9 box, no
  // placeholder. The read layer already sets image: undefined whenever there
  // is no genuine photo (image-policy contract), so image presence IS the
  // signal — text-only articles simply open on their standfirst.
  const imageUrl = article.image?.url
  if (!imageUrl) return null

  return (
    <figure className="mt-6">
      <div className="aspect-video overflow-hidden rounded-[16px] shadow-[inset_0_0_0_1px_rgba(16,22,31,0.06)]">
        <ArticleImage
          src={imageUrl}
          alt={article.image?.alt ?? article.title}
          categorySlug={article.category.slug}
          priority
          sizes="(min-width: 768px) 680px, 100vw"
        />
      </div>
      {/* „Foto: {Sursă}” only over a REAL publisher photo (attribution accuracy,
          PROJECT_BRIEF 0.1/0.2) — a hotlinked aggregated image is always the
          source's own, so the credit is correct whenever a photo is present. */}
      {article.type === 'aggregated' && (
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
  sidebar,
  after,
}: {
  adPlan: AdPlan
  children: React.ReactNode
  /**
   * Owner fix round: the desktop-only sticky Amazon sidebar beside the article
   * (the post page had no sidebar ad before). Rendered at lg+ only; on mobile
   * the article stays single-column, so text is never covered.
   */
  sidebar?: React.ReactNode
  after?: React.ReactNode
}) {
  return (
    <div className="pb-16">
      {/* Top banner (§3.5 ①) — above the <article>, so no ad ever sits
          between title and attribution (hard rule kept). */}
      <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6 xl:px-8">
        <AdSlot variant="leaderboard" decision={decisionFor(adPlan, 'leaderboard')} />
      </div>

      {/* Reading surface: full-bleed white section on the page canvas. Two
          columns at lg+ (article + sticky Amazon sidebar), single column below
          — the article column stays centered when no sidebar renders. */}
      <div className="bg-surface">
        <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6 xl:px-8">
          <div className="mx-auto flex w-full max-w-[760px] justify-center gap-8 lg:max-w-[1092px] lg:justify-between">
            <article className="w-full min-w-0 max-w-[760px] py-8 md:py-10">{children}</article>
            {sidebar && <div className="hidden py-8 md:py-10 lg:block">{sidebar}</div>}
          </div>
        </div>
      </div>

      {after && <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6 xl:px-8">{after}</div>}
    </div>
  )
}

export default async function ArticlePage({ params, searchParams }: ArticlePageProps) {
  const { slug } = await params
  const { geo } = await searchParams
  const article = await getFeedItemBySlug(slug)
  if (!article) notFound()

  // Record ONE aggregate view for the „cele mai citite” admin dashboard (owner
  // ask #2b). Fire-and-forget: recordArticleView is best-effort and never throws
  // (a view counter must never block or fail an article render); we don't await
  // the result. Consent-free — a plain global tally, no per-visitor data.
  void recordArticleView(article.slug)

  // Per-request ad decisions (architecture.md §4) — the article's category
  // drives contextual keywords; consent/profile handled inside the helper.
  // ?geo=<CC> is the owner's preview override (honored only under AD_PREVIEW).
  const adPlan = await getRequestAdPlan(article.category.slug, { countryOverride: geo })
  // The below-body ad box — the dedicated 'article-end' placement (its own
  // unit pool). Owner v2.4: the article surface's ad boxes carry a 0-based
  // ORDINAL that decides adsense vs amazon (2:1 via networkForOrdinal), NOT the
  // placement — the below-body box is ordinal 0 (adsense), then „Mai multe
  // știri” continues from ordinal 1 (see MoreNews), so the pattern reads
  // adsense, adsense, amazon and the single Amazon box lands in the related grid.
  const articleEndAd = decisionFor(adPlan, 'article-end')
  const ARTICLE_END_ORDINAL = 0

  // Owner fix round: the desktop-only sticky Amazon sidebar (the post page had
  // no sidebar ad before, "prioritise amazon"). It uses the rail placement's
  // Amazon decision — present whenever a partnerTag matches the marketplace, and
  // it carries the generic shopping-keyword fallback so it resolves even for an
  // article whose category yields no contextual keywords. Its cards start at a
  // variant PAST the article-end/MoreNews Amazon ordinals (0–2) so no two Amazon
  // slots on the page repeat.
  const sidebarAmazon = decisionFor(adPlan, 'rail')?.amazon
  const ARTICLE_SIDEBAR_START_VARIANT = 3
  const sidebar = sidebarAmazon ? (
    <ArticleSideRail decision={sidebarAmazon} startVariant={ARTICLE_SIDEBAR_START_VARIANT} />
  ) : undefined

  if (article.type === 'aggregated') {
    return (
      <ArticleShell
        adPlan={adPlan}
        sidebar={sidebar}
        after={<MoreNews article={article} adPlan={adPlan} adOrdinalStart={1} />}
      >
        <ArticleHeader article={article} />
        {/* Fair-use excerpt — NEVER full text (PROJECT_BRIEF 0.1/0.2). */}
        <Standfirst text={article.excerpt} />
        {/* CTA directly after the excerpt; the ad comes only BELOW the CTA
            block — never between excerpt and CTA (misclick protection). */}
        <ReadFullArticleCta article={article} />
        {/* R3: exactly one ad box, below the CTA — never between excerpt and
            CTA (misclick protection). v2.4: ordinal 0 ⇒ AdSense. */}
        <ArticleAdSlot decision={articleEndAd} ordinal={ARTICLE_END_ORDINAL} />
      </ArticleShell>
    )
  }

  const jsonLd = articleJsonLd(article)

  return (
    <ArticleShell
      adPlan={adPlan}
      sidebar={sidebar}
      after={<MoreNews article={article} adPlan={adPlan} adOrdinalStart={1} />}
    >
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}

      <ArticleHeader article={article} />
      <Standfirst text={article.excerpt} />

      {/* Original body — 680px reading column (§3.5.1). R3: no mid-article
          slot anymore — the single ad box comes below the whole body. */}
      <div className="max-w-[680px] font-sans text-[17px] leading-7 text-ink md:text-lg md:leading-[30px]">
        {article.body.map((paragraph, index) => (
          <p key={index} className="mt-5">
            {paragraph}
          </p>
        ))}
      </div>

      {/* The SINGLE below-article box (§3.5 ⑦) — the dedicated 'article-end'
          placement. v2.4: ordinal 0 ⇒ AdSense; the Amazon box lands in „Mai
          multe știri” (ordinal 2). Same placement on both content types. */}
      <ArticleAdSlot decision={articleEndAd} ordinal={ARTICLE_END_ORDINAL} />
    </ArticleShell>
  )
}
