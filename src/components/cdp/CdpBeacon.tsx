'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * CdpBeacon — first-party behavioural beacon (PROJECT_BRIEF §7, strictly
 * consent-gated per §8).
 *
 * MOUNTING CONTRACT (integration layout):
 *   The SERVER layout mounts <CdpBeacon /> ONLY when
 *   `await readConsent(await cookies()) === 'accepted'` — i.e. only for
 *   visitors with an explicit, current-version Accept. Refused/unknown
 *   visitors never receive this component (zero tracking code runs for
 *   them). The server also gates on the `nr_vid` cookie being present; the
 *   /api/cdp/events route re-validates BOTH server-side on every batch, so
 *   even a mis-mounted beacon can never store anything without consent.
 *
 * DORMANT since the CMP reconciliation (2026-07):
 *   Our custom consent banner + POST /api/consent were retired in favour of
 *   Google's certified CMP, so the `nr_consent` cookie is NEVER written and
 *   readConsent() is always 'unknown'. This beacon therefore never mounts and
 *   /api/cdp/events drops everything — a privacy-safe, error-free dormant
 *   state (no cookies, no runtime code). To RE-ACTIVATE first-party analytics
 *   later, gate mounting on Google's TCF / Consent-Mode signal (e.g. the IAB
 *   TCF `euconsent-v2` / __tcfapi consent for the relevant purposes, or a
 *   Consent-Mode `analytics_storage: granted` read), NOT on the removed
 *   nr_consent cookie. See docs/architecture.md (Consent / CDP section).
 *
 * What it emits (batched, max 20 per queue, flushed every 5 s or on
 * pagehide / route change / article click via navigator.sendBeacon):
 *   - page_view      on every route load (per pathname);
 *   - scroll_depth   at 25 / 50 / 75 / 100 %, each once per pathname;
 *   - time_on_page   seconds on the page, on pagehide + on SPA route change;
 *   - article_click + category_read via ONE delegated click listener on
 *     article links (see resolveArticleClick for the link contract).
 *
 * PRIVACY INVARIANTS:
 *   - NO cookie/localStorage/sessionStorage reads or writes of ANY kind —
 *     the queue lives in memory only; visitor identity is the HttpOnly
 *     `nr_vid` cookie which the browser attaches to the same-origin
 *     sendBeacon request automatically (this code never sees it).
 *   - Fire-and-forget: failures are dropped silently, never retried from
 *     storage, never surfaced to the visitor.
 */

const ENDPOINT = '/api/cdp/events'
const FLUSH_INTERVAL_MS = 5_000
const MAX_QUEUE = 20
const SCROLL_STEPS = [25, 50, 75, 100] as const

interface BeaconEvent {
  type: 'page_view' | 'article_click' | 'scroll_depth' | 'time_on_page' | 'category_read'
  path: string
  articleId?: string
  category?: string
  value?: number
}

/** `/categorie/<slug>` → slug (page_view category enrichment). */
function categoryFromPath(pathname: string): string | undefined {
  const match = /^\/categorie\/([a-z0-9-]{1,80})(?:\/|$)/.exec(pathname)
  return match?.[1]
}

/** `/stiri/<slug>` → slug — original articles are identified by slug. */
function articleSlugFromHref(href: string): string | undefined {
  const match = /^\/stiri\/([A-Za-z0-9_-]{1,120})(?:[/?#]|$)/.exec(href)
  return match?.[1]
}

/**
 * Delegated article-link contract (in preference order):
 *   1. `data-cdp-article` (+ optional `data-cdp-category`) on the anchor —
 *      works for BOTH internal originals and external aggregated links;
 *   2. internal `href="/stiri/<slug>"` anchors (ArticleTitleLink/ThumbLink);
 *   3. category fallback: the closest <article> card's kicker link
 *      (`/categorie/<slug>`) names the story's category.
 * Returns null for non-article anchors.
 */
function resolveArticleClick(
  anchor: HTMLAnchorElement,
): { articleId?: string; category?: string } | null {
  const dataArticle = anchor.dataset.cdpArticle
  const href = anchor.getAttribute('href') ?? ''
  const articleId = dataArticle || articleSlugFromHref(href)
  if (!articleId) return null

  let category = anchor.dataset.cdpCategory || undefined
  if (!category) {
    const kicker = anchor
      .closest('article')
      ?.querySelector<HTMLAnchorElement>('a[href^="/categorie/"]')
    category = kicker ? categoryFromPath(kicker.getAttribute('href') ?? '') : undefined
  }
  return { articleId, category }
}

export function CdpBeacon() {
  const pathname = usePathname()
  const queueRef = useRef<BeaconEvent[]>([])
  /** Dedupe guard for React StrictMode double-mounts in dev. */
  const lastPageViewRef = useRef<{ path: string; at: number } | null>(null)

  useEffect(() => {
    const path = pathname || '/'
    const startedAt = Date.now()
    const sentScrollSteps = new Set<number>()
    let scrollScheduled = false

    function send(events: BeaconEvent[]) {
      if (events.length === 0) return
      const body = JSON.stringify({ events })
      try {
        if (typeof navigator.sendBeacon === 'function') {
          // Blob keeps the JSON content type; same-origin, cookies attached.
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
        } else {
          void fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          }).catch(() => undefined)
        }
      } catch {
        // best-effort analytics — never disturb the visitor
      }
    }

    function flush() {
      send(queueRef.current.splice(0, queueRef.current.length))
    }

    function enqueue(event: BeaconEvent, { immediate = false } = {}) {
      queueRef.current.push(event)
      if (immediate || queueRef.current.length >= MAX_QUEUE) flush()
    }

    // --- page_view (dedupe StrictMode's dev double-mount) -------------------
    const last = lastPageViewRef.current
    if (!last || last.path !== path || Date.now() - last.at > 1_000) {
      lastPageViewRef.current = { path, at: Date.now() }
      const category = categoryFromPath(path)
      enqueue({
        type: 'page_view',
        path,
        ...(category ? { category } : {}),
        ...(articleSlugFromHref(path) ? { articleId: articleSlugFromHref(path) } : {}),
      })
    }

    // --- scroll_depth: 25/50/75/100, once each per pathname -----------------
    function measureScrollDepth() {
      scrollScheduled = false
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      const depth =
        scrollable <= 0
          ? 100
          : Math.min(100, ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100)
      for (const step of SCROLL_STEPS) {
        if (depth >= step && !sentScrollSteps.has(step)) {
          sentScrollSteps.add(step)
          enqueue({ type: 'scroll_depth', path, value: step })
        }
      }
    }
    function onScroll() {
      if (scrollScheduled) return
      scrollScheduled = true
      requestAnimationFrame(measureScrollDepth)
    }
    // Short pages may already satisfy thresholds without any scrolling.
    measureScrollDepth()
    window.addEventListener('scroll', onScroll, { passive: true })

    // --- article_click + category_read: ONE delegated listener --------------
    function onClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      const info = resolveArticleClick(anchor)
      if (!info) return
      enqueue({ type: 'article_click', path, ...info })
      if (info.category) {
        enqueue({ type: 'category_read', path, category: info.category })
      }
      // Navigation may be imminent (incl. external aggregated links) — flush
      // now; sendBeacon survives the page teardown.
      flush()
    }
    document.addEventListener('click', onClick)

    // --- time_on_page on pagehide (sendBeacon survives unload) --------------
    function onPageHide() {
      enqueue(
        { type: 'time_on_page', path, value: Math.round((Date.now() - startedAt) / 1000) },
        { immediate: true },
      )
    }
    window.addEventListener('pagehide', onPageHide)

    // --- periodic flush ------------------------------------------------------
    const interval = window.setInterval(flush, FLUSH_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('click', onClick)
      // SPA route change: close out this page (pagehide never fires) and
      // flush whatever is left so events keep their correct `path`.
      enqueue(
        { type: 'time_on_page', path, value: Math.round((Date.now() - startedAt) / 1000) },
        { immediate: true },
      )
    }
  }, [pathname])

  return null
}
