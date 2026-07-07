'use client'

import { useEffect, useState } from 'react'

/**
 * „Gestionează consimțământul” — reopens Google's certified CMP consent
 * choices (Consent / Do not consent / Manage options).
 *
 * CMP reconciliation (2026-07): Google's CMP is the single consent experience,
 * delivered through the AdSense tag (AdSense › Privacy & messaging). The
 * documented reopen/revocation API is the Funding Choices `googlefc` surface:
 *
 *   googlefc.callbackQueue.push(googlefc.showRevocationMessage)
 *
 * showRevocationMessage() clears the current EU-regulations consent record (if
 * any) and shows the CMP message again so the visitor can change their choice.
 * (Ref: developers.google.com/funding-choices/fc-api-docs;
 *  support.google.com/adsense/answer/10959060.)
 *
 * Availability: the API is loaded asynchronously with the AdSense tag. We seed
 * `window.googlefc.callbackQueue` (safe to create before the script loads) and
 * flip the button to „ready” from the `CONSENT_API_READY` callback. Until then
 * — and where the CMP does not apply (outside the EEA/UK/CH, where Google shows
 * no message) or is blocked — the button stays a graceful fallback that points
 * the visitor to the browser's own cookie settings, so the control is never a
 * dead end.
 */

interface GoogleFc {
  callbackQueue?: Array<unknown>
  showRevocationMessage?: () => void
}

declare global {
  interface Window {
    googlefc?: GoogleFc
  }
}

const buttonClass =
  'inline-flex h-11 w-full items-center justify-center rounded-[2px] bg-link px-5 font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:opacity-85 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[260px]'

export function CmpManageButton() {
  // Assume unavailable until the CMP signals CONSENT_API_READY, so the button
  // never claims to reopen a message that cannot appear.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const w = window
    w.googlefc = w.googlefc || {}
    w.googlefc.callbackQueue = w.googlefc.callbackQueue || []
    // If the API is already loaded, this callback fires immediately; otherwise
    // it runs once the CMP is ready.
    w.googlefc.callbackQueue.push({
      CONSENT_API_READY: () => setReady(true),
    })
  }, [])

  function openCmp() {
    const fc = typeof window !== 'undefined' ? window.googlefc : undefined
    if (fc?.callbackQueue && typeof fc.showRevocationMessage === 'function') {
      // Documented reopen: queue the revocation message so it runs in the
      // CMP's own callback context.
      fc.callbackQueue.push(fc.showRevocationMessage)
    }
  }

  if (!ready) {
    return (
      <p className="mt-6 font-sans text-[15px] leading-[22px] text-ink-secondary">
        Fereastra de consimțământ Google nu este disponibilă momentan (de exemplu în afara
        UE/SEE/Elveției, unde nu este afișată, sau dacă este blocată de browser). Puteți gestiona
        oricând cookie-urile din setările browserului dumneavoastră, secțiunea „Confidențialitate” /
        „Cookie-uri”.
      </p>
    )
  }

  return (
    <button type="button" onClick={openCmp} className={`${buttonClass} mt-6`}>
      Gestionează consimțământul
    </button>
  )
}
