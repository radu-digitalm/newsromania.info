import Link from 'next/link'

import { ArticleImage } from '@/components/articles/ArticleImage'
import type { Category, FeedItem } from '@/types/content'

import { formatFeedDate } from './format-date'

/**
 * ArticleCard — image-led magazine card (design direction v2 §4.1).
 *
 * v2.1 „Flux Social” status (§8.9): the feed routes (home/category/search)
 * now render PostCard streams — this component's 'feed' and overlay tiers are
 * no longer rendered by any feed route but stay exported and type-valid
 * (architecture.md module paths are fixed). The 'list' tier REMAINS in active
 * use: the home „Cele mai citite” strip-post and the article pages' „Mai
 * multe știri”.
 *
 * Tiers:
 * - 'feed'      → standard grid card: photo 16:9 with an overlaid category
 *                 chip, title, excerpt, meta (§4.1a). Unused by feed routes
 *                 since v2.1.
 * - 'featured'  → hero overlay card: photo fills the box, gradient scrim,
 *                 yellow kicker chip + display title + meta on the scrim
 *                 (§4.1c). Retired from feed routes in v2.1 (no scrim hero in
 *                 the stream); type-valid, never rendered there.
 * - 'secondary' → the two smaller hero-band overlay cards (§4.1c) — same
 *                 v2.1 status as 'featured'.
 * - 'list'      → compact thumb+title row („Cele mai citite”, „Mai multe
 *                 știri” — §4.1d), optional rank numeral.
 *
 * Owner requirement 2 (v2 §7.1 — deliberate change from v1): EVERY card links
 * INTERNALLY to /stiri/<slug> for BOTH content types. No external link, no
 * target="_blank", no ↗ on cards — the publisher link lives only on the
 * aggregated article page. The type signal on cards stays: original → person
 * byline; aggregated → non-interactive „Sursa: {X}” pill.
 *
 * Link pattern: one tab stop per card — the title <a> is stretched over the
 * whole card via after:inset-0 (card is position:relative); the category chip
 * sits above the stretch with z-10 as the card's second tab stop.
 */

type HeadingTag = 'h2' | 'h3' | 'h4'

interface ArticleCardProps {
  item: FeedItem
  /**
   * Heading level, so the card fits the page outline (h2 under a page h1;
   * h4 inside the home „Cele mai citite” strip-post, whose own head is h3).
   */
  as?: HeadingTag
  variant?: 'feed' | 'featured' | 'secondary' | 'list'
  /** List tier only: 1-based rank numeral („Cele mai citite”). */
  rank?: number
}

export function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6.5 3.5h-3A1.5 1.5 0 0 0 2 5v7.5A1.5 1.5 0 0 0 3.5 14H11a1.5 1.5 0 0 0 1.5-1.5v-3" />
      <path d="M9.5 2H14v4.5" />
      <path d="M14 2 7.5 8.5" />
    </svg>
  )
}

/**
 * Title link — always INTERNAL to /stiri/<slug> for both types (v2 §7.1).
 * Exported so compact lists reuse the exact same link grammar.
 */
export function ArticleTitleLink({ item, className }: { item: FeedItem; className?: string }) {
  return (
    <Link href={`/stiri/${item.slug}`} className={className}>
      {item.title}
    </Link>
  )
}

/** Stretched title link — covers the whole (relative) card with one tab stop. */
function StretchedTitleLink({ item, className }: { item: FeedItem; className?: string }) {
  return (
    <Link
      href={`/stiri/${item.slug}`}
      className={`${className ?? ''} after:absolute after:inset-0 after:content-['']`}
    >
      {item.title}
    </Link>
  )
}

/**
 * Kicker — the white category chip overlaid on card photos (§4.1a): solid
 * white pill, kicker token in red-text (6.27:1). Sits ABOVE the stretched
 * card link (relative z-10) as the card's second tab stop.
 */
export function Kicker({ category, onImage = false }: { category: Category; onImage?: boolean }) {
  return (
    <Link
      href={`/categorie/${category.slug}`}
      className={`relative z-10 inline-flex items-center rounded-full bg-white px-2.5 py-[3px] font-sans text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-red-text transition-colors hover:text-link ${
        onImage ? 'shadow-[0_1px_2px_rgba(16,22,31,0.16)]' : ''
      }`}
    >
      {category.name}
    </Link>
  )
}

/** Yellow kicker chip for overlay (scrim) cards — ink on brand-yellow (15.01:1). */
function OverlayKicker({ category }: { category: Category }) {
  return (
    <Link
      href={`/categorie/${category.slug}`}
      className="relative z-10 inline-flex items-center rounded-full bg-brand-yellow px-2.5 py-[3px] font-sans text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink focus-visible:outline-brand-yellow"
    >
      {category.name}
    </Link>
  )
}

/**
 * Source pill — „Sursa: {X}” attribution (§4.3). Non-interactive on cards
 * (the card's single link is internal); pass `href` on the article page's
 * attribution row, where it links to the publisher homepage.
 */
export function SourcePill({ name, href }: { name: string; href?: string }) {
  const className =
    'inline-flex h-6 items-center rounded-full border border-border-pill bg-accent-bg px-2.5 font-sans text-xs font-semibold leading-4 text-pill-text'
  if (href) {
    return (
      <a href={href} rel="noopener noreferrer nofollow" className={`${className} hover:underline`}>
        Sursa: {name}
      </a>
    )
  }
  return <span className={className}>Sursa: {name}</span>
}

/** Meta grammar (§4.1a): original = „de {Autor}” · date; aggregated = pill · date. */
function MetaRow({ item, className }: { item: FeedItem; className?: string }) {
  const date = <time dateTime={item.publishedAt}>{formatFeedDate(item.publishedAt)}</time>
  if (item.type === 'original') {
    return (
      <p className={`font-sans text-[13px] leading-[18px] text-ink-muted ${className ?? ''}`}>
        de <span className="font-semibold text-ink">{item.author.name}</span>
        {' · '}
        {date}
      </p>
    )
  }
  return (
    <p
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[13px] leading-[18px] text-ink-muted ${className ?? ''}`}
    >
      <SourcePill name={item.source.name} />
      <span aria-hidden="true">·</span>
      {date}
    </p>
  )
}

/** Overlay-card meta on the scrim (§4.1c) — overlay-meta 13px. */
function OverlayMetaRow({ item }: { item: FeedItem }) {
  const date = <time dateTime={item.publishedAt}>{formatFeedDate(item.publishedAt)}</time>
  return (
    <p className="mt-2 font-sans text-[13px] font-medium leading-[18px] text-[var(--color-overlay-meta,#D7DEE9)]">
      {item.type === 'original' ? (
        <>
          de {item.author.name}
          {' · '}
          {date}
        </>
      ) : (
        <>
          Sursa: {item.source.name}
          {' · '}
          {date}
        </>
      )}
    </p>
  )
}

/**
 * Photo of a card — src from the read layer. Renders nothing when the item has
 * no real image (ArticleImage returns null); callers drop the media box for
 * text-only items rather than reserving an empty frame or a placeholder.
 */
function CardImage({
  item,
  priority,
  sizes,
}: {
  item: FeedItem
  priority?: boolean
  sizes?: string
}) {
  return (
    <ArticleImage
      src={item.image?.url ?? null}
      alt={item.image?.alt ?? item.title}
      categorySlug={item.category.slug}
      priority={priority}
      sizes={sizes}
    />
  )
}

/** Hero/secondary overlay card (§4.1c): photo + scrim + bottom-anchored text. */
function OverlayCard({
  item,
  as,
  featured,
}: {
  item: FeedItem
  as: HeadingTag
  featured: boolean
}) {
  const Heading = as
  const titleClass = featured
    ? 'text-[26px] font-extrabold leading-[31px] tracking-[-0.02em] md:text-[40px] md:leading-[45px]'
    : 'text-[17px] font-bold leading-[23px] tracking-[-0.005em] md:text-[19px] md:leading-[25px] lg:text-[28px] lg:leading-[34px] lg:tracking-[-0.01em]'
  const boxClass = featured
    ? 'aspect-[4/3] md:aspect-video'
    : 'aspect-video lg:aspect-auto lg:h-full lg:min-h-0'

  // Overlay hover = photo scale only; the title stays white (§6).
  return (
    <article className={`group relative overflow-hidden rounded-[16px] bg-ink ${boxClass}`}>
      <div className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.03]">
        <CardImage
          item={item}
          priority={featured}
          sizes={featured ? '(min-width: 1024px) 800px, 100vw' : '(min-width: 1024px) 400px, 100vw'}
        />
      </div>
      {/* Decorative scrim (§5.2) — photo-to-panel fade only; contrast is NOT
          carried by the gradient (see the text panel below). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,16,27,0)_40%,rgba(10,16,27,0.55)_62%,rgba(10,16,27,0.88)_100%)]"
      />
      {/* Text panel (§5.2): solid rgba(10,16,27,0.85) + blur backing behind
          EVERY glyph — worst case (pure-white photo/placeholder) composite
          #2F343D: white title 12.53:1, overlay-meta 9.26:1, yellow focus ring
          10.36:1 — AA holds for any clamped line count at any breakpoint. */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-[rgba(10,16,27,0.85)] p-5 backdrop-blur-[6px] ${featured ? 'md:p-7' : ''}`}
      >
        <OverlayKicker category={item.category} />
        <Heading
          className={`mt-2.5 font-serif text-[var(--color-ink-inverse,#FFFFFF)] ${titleClass}`}
        >
          {/* Focus on the dark panel flips to the yellow outline (§6). */}
          <StretchedTitleLink
            item={item}
            className="line-clamp-3 focus-visible:outline-brand-yellow"
          />
        </Heading>
        <OverlayMetaRow item={item} />
      </div>
    </article>
  )
}

/** List-tier row (§4.1d): 88/120px thumb, optional rank numeral, h4-token title. */
function ListCard({ item, as, rank }: { item: FeedItem; as: HeadingTag; rank?: number }) {
  const Heading = as
  // Text-only items drop the thumbnail column entirely — the title spans the
  // full row rather than sitting beside an empty box or a placeholder.
  const hasImage = Boolean(item.image?.url)
  return (
    <article
      className={`group relative grid items-start gap-3 transition-transform duration-200 ease-out hover:-translate-y-0.5 ${
        hasImage ? 'grid-cols-[88px_1fr] md:grid-cols-[120px_1fr]' : 'grid-cols-1'
      }`}
    >
      {hasImage && (
        <div className="aspect-video overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_rgba(16,22,31,0.06)]">
          <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.03]">
            <CardImage item={item} sizes="120px" />
          </div>
        </div>
      )}
      <div className="min-w-0">
        <Heading className="font-serif text-[15px] font-semibold leading-5 text-ink transition-colors group-hover:text-link md:text-base md:leading-[21px]">
          {typeof rank === 'number' && (
            <span
              aria-hidden="true"
              className="mr-2 align-baseline font-serif text-xl font-extrabold leading-[21px] text-red-text"
            >
              {rank}
            </span>
          )}
          <StretchedTitleLink item={item} className="line-clamp-3" />
        </Heading>
        <MetaRow item={item} className="mt-1.5" />
      </div>
    </article>
  )
}

export function ArticleCard({ item, as = 'h3', variant = 'feed', rank }: ArticleCardProps) {
  if (variant === 'featured' || variant === 'secondary') {
    return <OverlayCard item={item} as={as} featured={variant === 'featured'} />
  }
  if (variant === 'list') {
    return <ListCard item={item} as={as} rank={rank} />
  }

  const Heading = as
  const hasImage = Boolean(item.image?.url)

  // Standard grid card (§4.1a). Text-only variant: drop the 16:9 media box
  // (and its overlaid Kicker) entirely — no empty frame, no placeholder — and
  // move the category chip inline above the title so the card still reads as
  // an intentional text post.
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(16,22,31,0.06),0_1px_3px_rgba(16,22,31,0.04)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,22,31,0.12)]">
      {hasImage && (
        <div className="relative aspect-video overflow-hidden">
          <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.03]">
            <CardImage
              item={item}
              sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
            />
          </div>
          <div className="absolute left-2.5 top-2.5">
            <Kicker category={item.category} onImage />
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        {!hasImage && (
          <div className="mb-2">
            <Kicker category={item.category} />
          </div>
        )}
        <Heading className="font-serif text-[17px] font-bold leading-[23px] tracking-[-0.005em] text-ink transition-colors group-hover:text-link md:text-[19px] md:leading-[25px]">
          <StretchedTitleLink item={item} className="line-clamp-2" />
        </Heading>
        {/* Excerpt hidden below 640px — mobile stays dense (§4.1a). */}
        <p className="mt-2 hidden font-sans text-sm leading-[21px] text-ink-secondary sm:line-clamp-2 md:text-[15px] md:leading-[22px]">
          {item.excerpt}
        </p>
        <MetaRow item={item} className="mt-auto pt-3" />
      </div>
    </article>
  )
}
