import Link from 'next/link'

import type { Category } from '@/types/content'

/**
 * CategoryChip — pill link to a category page (design direction §4.3).
 * Border is decorative; the text carries the meaning. ≥44px touch target
 * everywhere; the compact 36px height applies only under a fine pointer
 * (mouse/trackpad), so touch tablets keep the full-size hit area.
 */

interface CategoryChipProps {
  category: Category
  /** Current category on category pages: inverted ink pill, aria-current. */
  active?: boolean
}

export function CategoryChip({ category, active = false }: CategoryChipProps) {
  const base =
    'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 font-sans text-sm font-semibold transition-colors pointer-fine:min-h-9'
  const state = active
    ? 'bg-ink text-white'
    : 'border border-[#C9CFDA] bg-surface text-ink hover:border-link-hover hover:text-link-hover'
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
