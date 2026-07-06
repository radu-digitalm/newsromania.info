import Image from 'next/image'
import Link from 'next/link'

import type { Category, FeedItem, ImageRef } from '@/types/content'

import { formatFeedDate } from './format-date'

/**
 * ArticleCard — broadsheet feed row (design direction §3.4, §4.1, §4.2).
 *
 * The two variants are instantly distinguishable by three redundant signals:
 * original  → person byline, plain title, INTERNAL link to /stiri/<slug>;
 * aggregated → source pill, trailing ↗ icon, EXTERNAL link to the publisher
 * (new tab). An original card never shows a pill; an aggregated card never
 * shows a person's byline.
 */

type HeadingTag = 'h2' | 'h3'

interface ArticleCardProps {
  item: FeedItem
  /** Heading level, so the card fits the page outline (h2 under a page h1, h3 on the home feed). */
  as?: HeadingTag
  /** 'featured' = home hero: image on top, display-size title, priority loading. */
  variant?: 'feed' | 'featured'
}

function itemImage(item: FeedItem): ImageRef {
  return (
    item.image ?? {
      url: `/placeholders/${item.category.slug}.png`,
      alt: `Ilustrație pentru categoria ${item.category.name}`,
      width: 1200,
      height: 675,
    }
  )
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
 * Title link with the correct semantics per item type. Exported so compact
 * lists (e.g. the home rail) reuse the exact same link grammar.
 */
export function ArticleTitleLink({ item, className }: { item: FeedItem; className?: string }) {
  if (item.type === 'original') {
    return (
      <Link href={`/stiri/${item.slug}`} className={className}>
        {item.title}
      </Link>
    )
  }
  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`group ${className ?? ''}`}
    >
      {item.title}
      {/* Trailing ↗ shifts to link blue on hover (§4.2). */}
      <ExternalLinkIcon className="ml-1.5 inline-block h-[0.65em] w-[0.65em] align-baseline text-ink-muted transition-colors group-hover:text-link" />
      <span className="sr-only">
        {' '}
        (link extern către {item.source.name} — se deschide în fereastră nouă)
      </span>
    </a>
  )
}

/**
 * Red category kicker (§4.1) — the editorial category label grammar used on
 * hero, feed rows and article pages. Vertical padding stretches the tap target
 * to 44px (14+16+14) while the negative margin cancels the layout impact.
 */
export function Kicker({ category }: { category: Category }) {
  return (
    <Link
      href={`/categorie/${category.slug}`}
      className="-my-3.5 inline-block py-3.5 font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-red-text transition-colors hover:text-link-hover"
    >
      {category.name}
    </Link>
  )
}

export function SourcePill({ name }: { name: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border-pill bg-accent-bg px-2.5 font-sans text-xs font-semibold leading-4 text-pill-text">
      Sursa: {name}
      <ExternalLinkIcon className="h-3 w-3" />
    </span>
  )
}

function MetaRow({ item }: { item: FeedItem }) {
  const date = <time dateTime={item.publishedAt}>{formatFeedDate(item.publishedAt)}</time>
  if (item.type === 'original') {
    return (
      <p className="mt-2.5 font-sans text-[13px] leading-[18px] text-ink-muted">
        de <span className="font-semibold text-ink">{item.author.name}</span>
        {' · '}
        {date}
      </p>
    )
  }
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[13px] leading-[18px] text-ink-muted">
      <SourcePill name={item.source.name} />
      <span aria-hidden="true">·</span>
      {date}
    </p>
  )
}

/** Thumbnail wrapped in the same link as the title, skipped by keyboard/SR (no double tab stop). */
function ThumbLink({
  item,
  priority = false,
  className,
  sizes,
}: {
  item: FeedItem
  priority?: boolean
  className: string
  sizes: string
}) {
  const image = itemImage(item)
  const wrapperClass = `${className} relative block overflow-hidden rounded-[2px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[2px] after:shadow-[inset_0_0_0_1px_rgba(20,24,29,0.08)] after:content-['']`
  const img = (
    <Image
      src={image.url}
      alt={image.alt}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
    />
  )
  if (item.type === 'original') {
    return (
      <Link href={`/stiri/${item.slug}`} tabIndex={-1} aria-hidden="true" className={wrapperClass}>
        {img}
      </Link>
    )
  }
  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      tabIndex={-1}
      aria-hidden="true"
      className={wrapperClass}
    >
      {img}
    </a>
  )
}

export function ArticleCard({ item, as = 'h3', variant = 'feed' }: ArticleCardProps) {
  const Heading = as

  if (variant === 'featured') {
    return (
      <article>
        <ThumbLink
          item={item}
          priority
          className="aspect-video w-full"
          sizes="(min-width: 1024px) 776px, 100vw"
        />
        <div className="mt-4">
          <Kicker category={item.category} />
          <Heading className="mt-2 font-serif text-[28px] font-bold leading-[34px] tracking-[-0.015em] text-ink md:text-[40px] md:leading-[46px]">
            <ArticleTitleLink
              item={item}
              className="decoration-link decoration-2 underline-offset-[3px] transition-colors hover:underline"
            />
          </Heading>
          <p className="mt-3 line-clamp-2 font-serif text-lg leading-7 text-ink-secondary md:text-xl md:leading-8">
            {item.excerpt}
          </p>
          <MetaRow item={item} />
        </div>
      </article>
    )
  }

  return (
    <article className="grid grid-cols-[1fr_auto] gap-4 border-b border-border py-5 last-of-type:border-b-0">
      <div className="min-w-0">
        <Kicker category={item.category} />
        <Heading className="mt-1.5 font-serif text-lg font-semibold leading-6 text-ink md:text-xl md:leading-[26px]">
          <ArticleTitleLink
            item={item}
            className="decoration-link decoration-2 underline-offset-[3px] transition-colors hover:underline"
          />
        </Heading>
        <p className="mt-1.5 hidden font-sans text-[15px] leading-[23px] text-ink-secondary md:line-clamp-2">
          {item.excerpt}
        </p>
        <MetaRow item={item} />
      </div>
      {/* self-start keeps the true 16:9 box (grid default stretch would override aspect-ratio) and top-aligns the thumb with the kicker (§3.4). */}
      <ThumbLink
        item={item}
        className="aspect-video w-28 shrink-0 self-start md:w-[220px]"
        sizes="(min-width: 768px) 220px, 112px"
      />
    </article>
  )
}
