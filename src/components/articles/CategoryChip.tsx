import Link from 'next/link'

import type { Category } from '@/types/content'

/**
 * CategoryChip — pill link to a category page (design direction v2 §4.2).
 *
 * Default: the chip-nav / category grammar — rest on `surface` with a
 * decorative border (the label carries the meaning at 18.16:1), hover shifts
 * to `accent-bg` + link, active (current category) inverts to ink/white.
 * Mobile keeps a ≥44px hit area (40px pill + 4px block margins); the compact
 * 36px height applies only under a fine pointer.
 *
 * `size="small"`: the article-page kicker chip — 28px, kicker token in
 * `red-text` on white (6.27:1).
 */

interface CategoryChipProps {
  category: Category
  /** Current category (chip nav / category pages): inverted ink pill, aria-current. */
  active?: boolean
  /** 'small' = article-page kicker chip (§4.2). */
  size?: 'default' | 'small'
}

export function CategoryChip({ category, active = false, size = 'default' }: CategoryChipProps) {
  if (size === 'small') {
    return (
      <Link
        href={`/categorie/${category.slug}`}
        className="inline-flex h-7 items-center whitespace-nowrap rounded-full border border-border bg-white px-2.5 font-sans text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-red-text transition-colors hover:border-link hover:text-link"
      >
        {category.name}
      </Link>
    )
  }

  const base =
    'my-1 inline-flex h-10 items-center whitespace-nowrap rounded-full px-3.5 font-sans text-sm font-semibold leading-5 transition-colors pointer-fine:h-9'
  const state = active
    ? 'bg-ink text-white'
    : 'border border-[#C9D0DB] bg-surface text-ink hover:border-link hover:bg-accent-bg hover:text-link'
  return (
    <Link
      href={`/categorie/${category.slug}`}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${state}`}
    >
      {category.name}
    </Link>
  )
}
