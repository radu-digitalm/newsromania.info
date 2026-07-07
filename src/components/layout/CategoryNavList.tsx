'use client'

import { usePathname } from 'next/navigation'

import { CategoryChip } from '@/components/articles/CategoryChip'
import { siteConfig } from '@/config/site'

/**
 * Chip-nav category row (design direction v2 §3.2.3): one row of
 * CategoryChips, the current section rendered as the active (ink) chip via
 * `aria-current="page"`. Client boundary only for `usePathname()` — the
 * markup is fully server-rendered and works with JavaScript disabled.
 * Overflow: horizontal scroll, hidden scrollbars, 24px right-edge fade. The
 * fade is applied at EVERY width (not just mobile): the row can also overflow
 * between 768px and ~900px, and with scrollbars hidden the fade is the only
 * affordance that more chips exist. When everything fits, the last 24px of
 * the row are empty, so the mask is invisible.
 */
export function CategoryNavList() {
  const pathname = usePathname()

  return (
    <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_calc(100%-24px),transparent)] [&::-webkit-scrollbar]:hidden">
      {siteConfig.categories.map((category) => (
        <li key={category.slug} className="shrink-0">
          <CategoryChip category={category} active={pathname === `/categorie/${category.slug}`} />
        </li>
      ))}
    </ul>
  )
}
