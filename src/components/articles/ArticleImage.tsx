'use client'

import Image from 'next/image'
import { useState } from 'react'

import { siteConfig } from '@/config/site'

/**
 * SmartImage (design-direction-v2 §5.1/§5.3) — the ONE image renderer for
 * every card/hero/lead surface. Behavior by source:
 *
 * - REMOTE publisher photo (http/https, aggregated `imageUrl`): plain `<img>`
 *   hotlink — third-party URLs are NEVER proxied/optimized/cached through our
 *   server (next/image is deliberately not used). `referrerPolicy="no-referrer"`,
 *   `loading="lazy"` + `decoding="async"` (hero/lead: `loading="eager"` +
 *   `fetchpriority="high"`). A broken hotlink flips to the branded placeholder
 *   via `onError` — the browser broken-image glyph is never shown.
 * - LOCAL asset (`/media/*` uploads, `/placeholders/*`): next/image, which may
 *   optimize our own files freely.
 * - Missing/disallowed src: the branded category placeholder
 *   (`/placeholders/<slug>.png`, regenerated per v2 §5.3 by
 *   `scripts/build-icons.mjs`).
 *
 * Zero-CLS contract: the component FILLS the box its parent provides (parent
 * owns aspect-ratio, radius and overflow clipping) via absolutely positioned
 * layers — images never dictate layout. The gradient underlay paints
 * instantly, so even the no-JS / still-loading state looks intentional.
 */

export interface ArticleImageProps {
  /** Absolute or site-relative photo URL; null/undefined → branded placeholder. */
  src?: string | null
  alt: string
  /** Category slug — drives the placeholder art/label. */
  categorySlug: string
  /** Hero/lead images: eager + fetchpriority=high. Everything else lazy. */
  priority?: boolean
  /** next/image-style sizes hint (used for local/original images). */
  sizes?: string
}

/** Remote = hotlinked third-party photo; everything else is served by us. */
const isRemote = (src: string): boolean => /^https?:\/\//i.test(src)

/** Branded placeholder path for a (validated) category slug (§5.3). */
function placeholderSrc(categorySlug: string): string {
  const known = siteConfig.categories.some((c) => c.slug === categorySlug)
  return `/placeholders/${known ? categorySlug : 'generic'}.png`
}

export function ArticleImage({
  src,
  alt,
  categorySlug,
  priority = false,
  sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
}: ArticleImageProps) {
  const [broken, setBroken] = useState(false)

  const cleanSrc = typeof src === 'string' && src.trim().length > 0 ? src.trim() : null
  const showPhoto = cleanSrc !== null && !broken
  const fallback = placeholderSrc(categorySlug)
  // The photo may already BE the placeholder (content.ts falls back before we
  // do) — don't stack a second identical layer underneath it in that case.
  const showFallbackLayer = !showPhoto && cleanSrc !== fallback

  return (
    <span className="relative block h-full w-full" data-category={categorySlug}>
      {/* Instant underlay (v2 §5.3 gradient) — paints before any network
          image and remains the no-JS degradation surface. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(135deg,var(--color-accent-bg,#E9EEF9)_0%,var(--color-accent-bg-strong,#DBE3F2)_100%)]"
      />
      {showFallbackLayer ? (
        <Image
          src={fallback}
          alt=""
          aria-hidden="true"
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : null}
      {showPhoto ? (
        isRemote(cleanSrc) ? (
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
        )
      ) : null}
    </span>
  )
}
