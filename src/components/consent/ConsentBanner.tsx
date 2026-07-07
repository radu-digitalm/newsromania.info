'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * GDPR consent banner (PROJECT_BRIEF §8 — strict, no dark patterns).
 *
 * Mounted by the server layout ONLY while the consent state is 'unknown'
 * (no valid, current-version nr_consent cookie), so it never re-renders for
 * visitors who already chose.
 *
 * - Binary honest choice: „Accept” / „Refuz” — identical size, style and
 *   click count. Refusing never blocks reading.
 * - Sticky bottom sheet, NO overlay: rendered as the LAST flex child of the
 *   body, `position: sticky; bottom: 0` keeps it pinned while scrolling but —
 *   unlike `fixed` — it occupies real layout height at the document end, so
 *   the footer legal bar and its keyboard-focused links are never hidden
 *   behind it (WCAG 2.2 SC 2.4.11 Focus Not Obscured). It disappears only
 *   through an explicit choice.
 * - Zero cookies/localStorage/sessionStorage touched here — the choice is
 *   sent to POST /api/consent, which writes the consent cookie server-side;
 *   the page then reloads so the server re-renders the consent state.
 * - No-JS degradation: the plain <form method="post"> submits natively and
 *   the API answers with a 303 redirect back to the Referer.
 */

const choiceButtonClass =
  'inline-flex h-11 flex-1 items-center justify-center rounded-full bg-link px-5 font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:opacity-85 disabled:cursor-not-allowed disabled:opacity-60'

export function ConsentBanner() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const choice = submitter instanceof HTMLButtonElement ? submitter.value : null
    if (choice !== 'accepted' && choice !== 'refused') {
      // Unexpected submitter — let the native form POST handle it.
      return
    }
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      // Reload so the server re-renders consent state (consent-mode script,
      // banner removal, ad decisions) from the HttpOnly cookie.
      window.location.reload()
    } catch {
      setBusy(false)
      setError('Nu am putut salva alegerea. Vă rugăm să încercați din nou.')
    }
  }

  return (
    <section
      role="region"
      aria-label="Consimțământ pentru cookie-uri"
      aria-live="polite"
      className="sticky bottom-0 z-50 w-full border-t border-border bg-surface shadow-[0_-8px_24px_rgba(16,22,31,0.12)]"
    >
      <div className="mx-auto w-full max-w-[1280px] px-4 py-4 md:px-6 md:py-5 xl:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
          <div className="flex-1">
            <h2 className="font-sans text-[15px] font-bold leading-5 text-ink">
              Cookie-uri și publicitate
            </h2>
            <p className="mt-1.5 font-sans text-[14px] leading-[21px] text-ink-secondary">
              Folosim cookie-uri pentru publicitate personalizată doar dacă sunteți de acord. Dacă
              refuzați, puteți citi site-ul în continuare, cu publicitate nepersonalizată. Alegerea
              se poate schimba oricând din pagina{' '}
              <Link
                href="/setari-cookies"
                className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
              >
                Setări cookies
              </Link>
              . Detalii în{' '}
              <Link
                href="/politica-de-cookies"
                className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
              >
                Politica de cookies
              </Link>
              .
            </p>
          </div>
          {/* Two EQUAL buttons — same size, same weight, one click each. */}
          <form
            method="post"
            action="/api/consent"
            onSubmit={handleSubmit}
            className="flex w-full shrink-0 gap-3 md:w-auto md:min-w-[280px]"
          >
            <button
              type="submit"
              name="choice"
              value="accepted"
              disabled={busy}
              className={choiceButtonClass}
            >
              Accept
            </button>
            <button
              type="submit"
              name="choice"
              value="refused"
              disabled={busy}
              className={choiceButtonClass}
            >
              Refuz
            </button>
          </form>
        </div>
        {error ? (
          <p className="mt-2 font-sans text-[13px] leading-[18px] text-red-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}
