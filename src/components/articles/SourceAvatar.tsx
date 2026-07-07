import Image from 'next/image'

import type { FeedCardItem } from '@/types/content'

import logoSymbol from '../../../assets/logo-symbol.png'

/**
 * SourceAvatar — the 40px post-header identity disc (design direction v2.1
 * §8.5a/b). Pure, shared (server + client bundles), NEVER fetches an external
 * favicon.
 *
 * - Aggregated → monogram disc: white initial(s) on a deterministic 4-color
 *   background reusing EXISTING tokens only (link, link-hover, red-text, ink);
 *   index = (sum of UTF-16 char codes of the source name) mod 4. White-on-bg
 *   ratios recomputed: 6.58 / 9.21 / 6.27 / 18.16 — all ≥4.5.
 * - Original → brand mark: `surface` disc, 1px `border-pill` ring, the shipped
 *   logo symbol rendered 28px inside via next/image.
 *
 * The whole disc is aria-hidden: the source name / „NewsRomania” is the
 * adjacent text in the post header (PostCard), so the avatar is decorative.
 */

/** Existing tokens only: link, link-hover, red-text, ink (§8.5a). */
const MONOGRAM_PALETTE = ['#2E5AAE', '#234684', '#C0121F', '#10161F'] as const

/** Deterministic palette pick — stable per source name, SSR and client alike. */
export function monogramPaletteIndex(name: string): number {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return sum % MONOGRAM_PALETTE.length
}

/** First letters of the first two words (one word → one letter), uppercased. */
export function monogramInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

export function SourceAvatar({ item }: { item: FeedCardItem }) {
  if (item.type === 'original') {
    return (
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-pill bg-surface"
      >
        <Image src={logoSymbol} alt="" className="h-7 w-auto" />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-sans text-[15px] font-bold leading-5 text-white"
      style={{ backgroundColor: MONOGRAM_PALETTE[monogramPaletteIndex(item.source.name)] }}
    >
      {monogramInitials(item.source.name)}
    </span>
  )
}
