'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { pushNewAdSlots } from '@/components/ads/push-ads'
import {
  batchAdCount,
  END_OF_FEED_MESSAGE,
  feedRequestPath,
  LOAD_ERROR_MESSAGE,
  loadedAnnouncement,
  nextPageHref,
  shouldAutoLoad,
  type FeedBatchAds,
  type FeedBatchResponse,
} from '@/lib/feed-serialize'
import type { FeedCardItem } from '@/types/content'

import { PostBatch } from './FeedList'
import { FeedSkeleton } from './FeedSkeleton'

/**
 * FeedStream — client owner of feed pages ≥2 (design direction v2.1
 * §8.7/§8.9): the sentinel anchor + IntersectionObserver (the ONLY scroll
 * mechanism — no scroll/resize listeners), /api/feed batches rendered through
 * PostBatch (byte-identical interleaving to SSR page 1), static skeleton
 * pair, 4-batch auto-load cap → manual „Încarcă mai multe știri” pill,
 * persistent polite aria-live announcements, error/retry, end state, and
 * pushNewAdSlots() after each batch commit (§8.10).
 *
 * Server-streamed initial paint: the REAL `<a id="feed-next" rel="next">`
 * pill below — it works with zero JS (classic ?page=2 navigation, §8.11) and
 * doubles as the observer target after hydration.
 *
 * No URL mutation while scrolling (no history.replaceState), no CDP events,
 * no consent reads, no new cookies on the client — batch loads are NOT
 * pageviews (§8.7). Single in-flight guard (ref) — a fetch can never
 * double-fire; AbortController aborts on unmount. Retry re-requests the SAME
 * page number (idempotent — Redis-cached server-side).
 */

export interface FeedStreamProps {
  /** First page this component loads (page 1 is SSR) — always 2 today. */
  startPage: number
  /** Route params forwarded to /api/feed (mutually exclusive per §8.8). */
  params: { category?: string; q?: string }
  /** hasNextPage of the SSR page 1 — false ⇒ nothing to load. */
  initialHasMore: boolean
  /** Count of in-feed ads already rendered by page 1 (unit-rotation ordinal, §8.6). */
  adOrdinalStart: number
  headingAs: 'h2' | 'h3'
  /** false on /cautare — search batches never carry ads (§8.8). */
  withAds: boolean
}

interface LoadedBatch {
  page: number
  /** Wire shape — original `body` never travels in batches. */
  items: FeedCardItem[]
  ads: FeedBatchAds | null
}

/** v2 §4.5 pill recipe (border-functional 3.08:1 on canvas-dim — AA for UI). */
const pillClass =
  'inline-flex h-11 items-center justify-center rounded-full border border-border-functional bg-surface px-5 font-sans text-[15px] font-semibold leading-5 text-ink transition-colors hover:border-link hover:text-link active:opacity-85'

type Phase = 'idle' | 'loading' | 'error'

export function FeedStream({
  startPage,
  params,
  initialHasMore,
  adOrdinalStart,
  headingAs,
  withAds,
}: FeedStreamProps) {
  const { category, q } = params

  const [batches, setBatches] = useState<LoadedBatch[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [nextPage, setNextPage] = useState(startPage)
  const [autoLoads, setAutoLoads] = useState(0)
  const [announcement, setAnnouncement] = useState('')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLAnchorElement | null>(null)
  const statusRef = useRef<HTMLParagraphElement | null>(null)
  // Single in-flight guard — a fetch can never double-fire (observer +
  // click + effects included).
  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const loadPage = useCallback(
    async (page: number, manual: boolean, adOrdinalStart: number) => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      const controller = new AbortController()
      abortRef.current = controller
      setPhase('loading')
      // Clear the live region at load start: consecutive batches are usually
      // the same size, so without the empty→text transition the success
      // message would be byte-identical and screen readers would announce
      // only the FIRST append (§8.7 requires one announcement per batch).
      setAnnouncement('')
      try {
        // Owner v2.4: pass the batch's first ad ordinal (?ao=) so the route
        // resolves Amazon products for the right (every-3rd) slots and the 2:1
        // pattern holds unbroken across batches. withAds=false ⇒ ordinal 0.
        const res = await fetch(
          feedRequestPath({ category, q }, page, withAds ? adOrdinalStart : 0),
          {
            signal: controller.signal,
            headers: { accept: 'application/json' },
          },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as FeedBatchResponse
        if (!data || !Array.isArray(data.items)) throw new Error('invalid response')

        const more = Boolean(data.hasMore) && typeof data.nextPage === 'number'
        setBatches((prev) => [...prev, { page, items: data.items, ads: withAds ? data.ads : null }])
        setHasMore(more)
        if (typeof data.nextPage === 'number') setNextPage(data.nextPage)
        if (!manual) setAutoLoads((n) => n + 1)
        // Focus is NOT moved on append (no focus theft); after a manual-button
        // batch the button keeps focus because it stays mounted.
        const loaded = data.items.length > 0 ? loadedAnnouncement(data.items.length) : ''
        setAnnouncement(more ? loaded : `${loaded} ${END_OF_FEED_MESSAGE}`.trim())
        setPhase('idle')
      } catch {
        if (controller.signal.aborted) return
        setAnnouncement(LOAD_ERROR_MESSAGE)
        setPhase('error')
      } finally {
        inFlightRef.current = false
      }
    },
    [category, q, withAds],
  )

  // Abort any in-flight batch on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  // WCAG 2.4.3: the sentinel link and the retry button UNMOUNT on activation
  // (phase flips to 'loading'), which would drop keyboard focus to <body>.
  // Park focus on the persistent status region first — it stays mounted
  // across every phase and its aria-live announcement reports the outcome.
  const parkFocus = useCallback(() => {
    statusRef.current?.focus()
  }, [])

  const autoMode = shouldAutoLoad(autoLoads)

  // The 0-based ad ordinal the NEXT batch starts at (owner v2.4) — computed
  // from the currently-loaded batches (see below), passed to loadPage so the
  // request's ?ao= aligns the 2:1 Amazon interleave across the batch boundary.
  const nextRequestAdOrdinalRef = useRef(adOrdinalStart)

  // IntersectionObserver on the sentinel anchor — the ONLY scroll mechanism.
  // Paused while loading, in error state (until retry succeeds), past the
  // auto-load cap, and at the end of the feed.
  useEffect(() => {
    if (phase !== 'idle' || !hasMore || !autoMode) return
    const anchor = sentinelRef.current
    if (!anchor || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          void loadPage(nextPage, false, nextRequestAdOrdinalRef.current)
      },
      { rootMargin: '600px 0px 600px 0px', threshold: 0 },
    )
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [phase, hasMore, autoMode, nextPage, loadPage])

  // AdSense in dynamically loaded batches (§8.10): after each batch commit,
  // request one fill per NEW unit-carrying <ins> (idempotent via the shared
  // data-nr-ad-pushed marker; unitless slots are skipped by the selector).
  const batchCount = batches.length
  useEffect(() => {
    if (batchCount === 0) return
    pushNewAdSlots(containerRef.current)
  }, [batchCount])

  // Keep the observer's ad-ordinal ref current after each batch commit (owner
  // v2.4): the observer reads it on scroll WITHOUT re-subscribing, so the ?ao=
  // it sends aligns the 2:1 Amazon interleave across the batch boundary. Synced
  // in an effect (never written during render) — recomputes the cumulative
  // ordinal the NEXT batch starts at from the loaded batches.
  useEffect(() => {
    let ordinal = adOrdinalStart
    for (const batch of batches) {
      ordinal += batch.ads ? batchAdCount(batch.ads.everyNth, batch.items.length) : 0
    }
    nextRequestAdOrdinalRef.current = ordinal
  }, [batches, adOrdinalStart])

  // „Înapoi sus” — scroll to top (instant under prefers-reduced-motion) and
  // move focus to the main landmark (the existing skip-link target #continut).
  const backToTop = useCallback(() => {
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
    const main = document.getElementById('continut')
    if (main) {
      main.setAttribute('tabindex', '-1')
      main.focus({ preventScroll: true })
    }
  }, [])

  if (!initialHasMore) return null

  // Cumulative feed-ad ordinal across the WHOLE stream (§8.6): page 1 rendered
  // ordinals 0…adOrdinalStart−1; each batch continues where the previous
  // ended. Precomputed here (no reassignment inside the render callback —
  // react-hooks/immutability).
  const batchOrdinalStarts: number[] = []
  for (let i = 0; i < batches.length; i++) {
    if (i === 0) {
      batchOrdinalStarts.push(adOrdinalStart)
      continue
    }
    const prev = batches[i - 1]
    batchOrdinalStarts.push(
      batchOrdinalStarts[i - 1] +
        (prev.ads ? batchAdCount(prev.ads.everyNth, prev.items.length) : 0),
    )
  }

  // The 0-based ad ordinal the NEXT batch will start at (owner v2.4): the last
  // loaded batch's start + its own ad count (or the page-1 handoff when no
  // client batch has loaded yet). Sent as ?ao= so the route aligns the 2:1
  // Amazon interleave across the batch boundary.
  const lastStart = batchOrdinalStarts[batches.length - 1]
  const lastBatch = batches[batches.length - 1]
  const nextRequestAdOrdinal =
    lastBatch && lastStart !== undefined
      ? lastStart +
        (lastBatch.ads ? batchAdCount(lastBatch.ads.everyNth, lastBatch.items.length) : 0)
      : adOrdinalStart

  return (
    <div ref={containerRef}>
      {batches.map((batch, batchIndex) => (
        <div key={batch.page} className="mt-2 sm:mt-4">
          <PostBatch
            items={batch.items}
            everyNth={batch.ads?.everyNth ?? 0}
            feedDecision={batch.ads?.decisions[0]}
            adOrdinalStart={batchOrdinalStarts[batchIndex] ?? adOrdinalStart}
            amazonProducts={batch.ads?.products}
            headingAs={headingAs}
          />
        </div>
      ))}

      {/* Persistent polite status region (§8.7) — append / error / end.
          tabIndex −1: focus parks here when an unmounting control (sentinel /
          retry) is activated, so keyboard focus never resets to <body>. */}
      <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Loading: the sentinel row is replaced by the static skeleton pair. */}
      {phase === 'loading' && (
        <div className="mt-2 sm:mt-4">
          <FeedSkeleton />
        </div>
      )}

      {/* Sentinel + no-JS fallback in one element: a REAL rel="next" link
          styled as the v2 §4.5 pill. The hydrated stream intercepts it. */}
      {phase === 'idle' && hasMore && autoMode && (
        <p className="my-10 text-center">
          <a
            id="feed-next"
            rel="next"
            ref={sentinelRef}
            href={nextPageHref({ category, q }, nextPage)}
            onClick={(event) => {
              event.preventDefault()
              parkFocus()
              void loadPage(nextPage, false, nextRequestAdOrdinal)
            }}
            className={pillClass}
          >
            Pagina următoare →
          </a>
        </p>
      )}

      {/* Auto-load cap reached (§8.7): manual batches only — WCAG 2.4 footer
          reachability. Stays mounted while fetching so it keeps focus. */}
      {phase !== 'error' && hasMore && !autoMode && (
        <p className="my-10 text-center">
          <button
            type="button"
            disabled={phase === 'loading'}
            aria-disabled={phase === 'loading'}
            onClick={() => void loadPage(nextPage, true, nextRequestAdOrdinal)}
            className={`${pillClass} min-w-[220px] disabled:opacity-60`}
          >
            {phase === 'loading' ? 'Se încarcă…' : 'Încarcă mai multe știri'}
          </button>
        </p>
      )}

      {/* Error/retry: observer stays paused until a retry succeeds; retry
          re-requests the SAME page number. */}
      {phase === 'error' && (
        <div className="my-10 flex flex-col items-center gap-4 px-4 text-center">
          <p className="font-sans text-[15px] font-medium leading-[22px] text-ink-secondary">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            onClick={() => {
              parkFocus()
              void loadPage(nextPage, true, nextRequestAdOrdinal)
            }}
            className={pillClass}
          >
            Încearcă din nou
          </button>
        </div>
      )}

      {/* End of feed (§8.7). */}
      {!hasMore && batchCount > 0 && (
        <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
          <p className="font-sans text-[15px] font-medium leading-[22px] text-ink-secondary">
            {END_OF_FEED_MESSAGE}
          </p>
          <button type="button" onClick={backToTop} className={pillClass}>
            Înapoi sus ↑
          </button>
        </div>
      )}
    </div>
  )
}
