'use client'

import Image from 'next/image'
import { useState } from 'react'

/**
 * SmartImage (design-direction-v2 §5.1/§5.3) — the ONE image renderer for
 * every card/hero/lead surface. Behavior by source:
 *
 * - REMOTE publisher photo (http/https, aggregated `imageUrl` HOTLINK): plain
 *   `<img>` — third-party URLs are NEVER proxied/optimized/cached through our
 *   server (next/image is deliberately not used). `referrerPolicy="no-referrer"`,
 *   `loading="lazy"` + `decoding="async"` (hero/lead: `loading="eager"` +
 *   `fetchpriority="high"`). A broken hotlink is HIDDEN via `onError` (the
 *   image disappears — we render nothing, never a placeholder and never the
 *   browser broken-image glyph).
 * - LOCAL asset (`/media/*` uploads — our own original photos): next/image,
 *   which may optimize our own files freely.
 * - Missing/empty/disallowed src: NOTHING is rendered (return null). Text-only
 *   cards are intentional per the image-policy contract — placeholders as an
 *   image fallback are REMOVED everywhere; the caller drops the media box.
 *
 * Zero-CLS contract: when a photo IS present the component FILLS the box its
 * parent provides (parent owns aspect-ratio, radius and overflow clipping) via
 * absolutely positioned layers — images never dictate layout. The gradient
 * underlay paints instantly, so even the still-loading state looks intentional.
 */

export interface ArticleImageProps {
  /** Absolute or site-relative photo URL; empty/null → renders nothing. */
  src?: string | null
  alt: string
  /**
   * Category slug — retained for surface data-attributes/styling hooks; it no
   * longer drives any placeholder art (placeholders were removed).
   */
  categorySlug?: string
  /** Hero/lead images: eager + fetchpriority=high. Everything else lazy. */
  priority?: boolean
  /** next/image-style sizes hint (used for local/original images). */
  sizes?: string
}

/** Remote = hotlinked third-party photo; everything else is served by us. */
const isRemote = (src: string): boolean => /^https?:\/\//i.test(src)

export function ArticleImage({
  src,
  alt,
  categorySlug,
  priority = false,
  sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
}: ArticleImageProps) {
  const [broken, setBroken] = useState(false)

  const cleanSrc = typeof src === 'string' && src.trim().length > 0 ? src.trim() : null

  // No real image, or the hotlink broke at runtime: render NOTHING. Text-only
  // is a deliberate state — never a placeholder, never the broken-image glyph.
  if (cleanSrc === null || broken) return null

  return (
    <span className="relative block h-full w-full" data-category={categorySlug}>
      {/* Instant underlay (v2 §5.3 gradient) — paints before the network image
          arrives so the box never flashes empty while a real photo loads. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(135deg,var(--color-accent-bg,#E9EEF9)_0%,var(--color-accent-bg-strong,#DBE3F2)_100%)]"
      />
      {isRemote(cleanSrc) ? (
        // Third-party RSS/publisher photos are hotlinked, never proxied
        // through next/image (v2 §5.1 hard rule).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cleanSrc}
          alt={alt}
          referrerPolicy="no-referrer"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <Image
          src={cleanSrc}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setBroken(true)}
          className="object-cover"
        />
      )}
    </span>
  )
}
