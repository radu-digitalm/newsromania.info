import Link from 'next/link'

import { ArticleImage } from '@/components/articles/ArticleImage'
import { CategoryChip } from '@/components/articles/CategoryChip'
import type { FeedCardItem } from '@/types/content'

import { formatFeedDate } from './format-date'
import { SourceAvatar } from './SourceAvatar'

/**
 * PostCard — THE social-style post card of the v2.1 „Flux Social” feed
 * (design direction v2.1 §8.4/§8.5). Single source of truth for post markup:
 * imported by the SSR page-1 tree (renders as an RSC there) AND by the client
 * FeedStream batches — therefore client-renderable by construction: only pure
 * imports (ArticleImage is already 'use client', CategoryChip/next/link are
 * fine, formatFeedDate and SourceAvatar are pure). No async, no headers().
 *
 * Anatomy (agreed interpretation — Facebook-STYLE in our brand skin, no fake
 * social chrome): header row (identity + relative <time>) → full-bleed 16:9
 * photo → bold title → short excerpt (visible at ALL widths — deliberate v2.1
 * change from v2 §4.1a) → footer row (CategoryChip + read affordance).
 *
 * Geometry (§8.2): <640px edge-to-edge — radius 0, border top/bottom only,
 * the 8px canvas-dim gap between cards is the divider; ≥640px radius 16px,
 * 1px border all around + standard-card shadow, 16px gaps. Hover lift only
 * ≥640px under (hover:hover) and (pointer:fine) — v2 §6 recipe B.
 *
 * Links: one tab stop per card — the stretched INTERNAL title link to
 * /stiri/<slug> for BOTH content types (v2 §7.1 unchanged); the footer
 * CategoryChip is the second tab stop (relative z-10 above the stretch).
 * Type signal preserved: original = brand avatar + „NewsRomania” + byline;
 * aggregated = monogram avatar + bold source name + sr-only „Sursa:” prefix.
 */

type HeadingTag = 'h2' | 'h3'

export interface PostCardProps {
  /** FeedItem is assignable — client batches pass the body-less wire shape. */
  item: FeedCardItem
  /** Heading level, fitting the page outline (home stream h3; category/search h2). */
  as?: HeadingTag
  /** 'featured' = the home page-1 lead post (§8.5c): eager image, display type. */
  variant?: 'post' | 'featured'
}

/** Stretched internal title link — covers the whole (relative) card, one tab stop. */
function StretchedTitleLink({ item, className }: { item: FeedCardItem; className?: string }) {
  return (
    <Link
      href={`/stiri/${item.slug}`}
      className={`${className ?? ''} after:absolute after:inset-0 after:content-['']`}
    >
      {item.title}
    </Link>
  )
}

/** ① Header row (§8.4): 40px avatar + identity block, padding 12×16. */
function PostHeader({ item }: { item: FeedCardItem }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <SourceAvatar item={item} />
      <div className="min-w-0">
        <p className="truncate font-sans text-[15px] font-bold leading-5 text-ink">
          {item.type === 'original' ? (
            'NewsRomania'
          ) : (
            <>
              {/* Attribution stays explicit for AT users (§8.4); the visible
                  „Sursa: {X}” pill lives on the article page (§4.3). */}
              <span className="sr-only">Sursa: </span>
              {item.source.name}
            </>
          )}
        </p>
        <p className="truncate font-sans text-[13px] font-medium leading-[18px] text-ink-muted">
          {item.type === 'original' ? <>de {item.author.name} · </> : null}
          <time dateTime={item.publishedAt}>{formatFeedDate(item.publishedAt)}</time>
        </p>
      </div>
    </div>
  )
}

export function PostCard({ item, as = 'h3', variant = 'post' }: PostCardProps) {
  const Heading = as
  const featured = variant === 'featured'
  const imageUrl = item.image?.url ?? null

  // §8.5c featured differences are type-scale + image priority ONLY — same anatomy.
  const titleClass = featured
    ? 'text-[24px] font-extrabold leading-[29px] tracking-[-0.02em] md:text-[32px] md:leading-[38px]'
    : 'text-[19px] font-bold leading-[25px] tracking-[-0.01em] md:text-[21px] md:leading-[27px]'
  const excerptClass = featured
    ? 'line-clamp-3 text-base leading-6 md:text-[17px] md:leading-[26px]'
    : 'line-clamp-2 text-sm leading-[21px] md:text-[15px] md:leading-[22px]'

  return (
    <article className="group relative flex flex-col overflow-hidden border-y border-border bg-surface transition-[transform,box-shadow] duration-200 ease-out sm:rounded-[16px] sm:border sm:shadow-[0_1px_2px_rgba(16,22,31,0.06),0_1px_3px_rgba(16,22,31,0.04)] sm:hover:-translate-y-0.5 sm:hover:shadow-[0_8px_24px_rgba(16,22,31,0.12)]">
      <PostHeader item={item} />

      {/* ② Media — full-bleed 16:9, the card owns radius/clipping (zero CLS).
          Text-only posts (no real photo) drop the media box entirely — no
          empty 16:9 frame, no placeholder — so the header flows straight into
          the title and the card reads as an intentional text post (§8). */}
      {imageUrl && (
        <div className="relative aspect-video overflow-hidden">
          <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.03]">
            <ArticleImage
              src={imageUrl}
              alt={item.image?.alt ?? item.title}
              categorySlug={item.category.slug}
              priority={featured}
              sizes="(min-width: 640px) 640px, 100vw"
            />
          </div>
        </div>
      )}

      {/* ③ Title — stretched internal link, 3-line clamp. Extra top padding on
          text-only cards so the title isn't cramped against the header row. */}
      <Heading
        className={`px-4 font-serif text-ink transition-colors group-hover:text-link ${imageUrl ? 'pt-3' : 'pt-1'} ${titleClass}`}
      >
        <StretchedTitleLink item={item} className="line-clamp-3" />
      </Heading>

      {/* ④ Excerpt — visible at ALL widths (deliberate v2.1 change, §8.11). */}
      <p className={`mt-1.5 px-4 font-sans text-ink-secondary ${excerptClass}`}>{item.excerpt}</p>

      {/* ⑤ Footer row — category chip (2nd tab stop) + visual read affordance. */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <span className="relative z-10">
          <CategoryChip category={item.category} size="small" />
        </span>
        {/* Purely visual — the stretched title link already carries the
            accessible action; no duplicate announcement, no extra tab stop. */}
        <span
          aria-hidden="true"
          className="shrink-0 font-sans text-sm font-semibold leading-5 text-link"
        >
          Citește articolul →
        </span>
      </div>
    </article>
  )
}
