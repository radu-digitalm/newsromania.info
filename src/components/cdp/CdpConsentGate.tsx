'use client'

import { useEffect, useState } from 'react'

import {
  CONSENT_COOKIE_NAME,
  VISITOR_COOKIE_NAME,
  clientClearCookieAssignment,
  clientConsentCookieAssignment,
  clientVisitorCookieAssignment,
} from '@/lib/consent'

import { CdpBeacon } from './CdpBeacon'
import { subscribeCmpConsent, type CmpConsentSignal } from './consent-signal'

/**
 * CdpConsentGate — client-side re-activation gate for the first-party CDP
 * (PROJECT_BRIEF §7/§8, CMP reconciliation 2026-07).
 *
 * The server layout mounts this UNCONDITIONALLY, but it renders NOTHING and
 * writes NO cookies until Google's certified CMP reports consent client-side
 * (consent-signal.ts reads TCF v2 / Consent Mode). Flow:
 *
 *   - signal 'granted' → write the two first-party cookies (nr_consent as the
 *     versioned JSON readConsent() parses = the server-side "consent proof",
 *     and a minted nr_vid visitor id) if not already present, then mount
 *     <CdpBeacon />. The beacon's POSTs carry these cookies same-origin, so the
 *     UNCHANGED server guard on /api/cdp/events (readConsent()==='accepted' AND
 *     a valid nr_vid) accepts them, and getRequestAdPlan() starts consulting
 *     the CDP profile for ad targeting.
 *   - signal 'denied' → clear both cookies (honours a withdrawal read from the
 *     CMP; the profiles worker then erases that visitor via consent-records if
 *     one was logged) and unmount the beacon.
 *   - signal 'unknown' → do nothing, stay dormant, zero cookies.
 *
 * Cookies are first-party and NOT HttpOnly (this same client must be able to
 * re-read/clear them on withdrawal). `consentVersion` is passed from the server
 * layout (site-config) so the written nr_consent matches the version the server
 * validates against — a later version bump re-prompts exactly as before.
 */

function readCookie(name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie)
  return match ? match[1]! : null
}

/** Minted client-side; the server never trusts it beyond its uuid-ish shape. */
function mintVisitorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for very old browsers — still matches the server's VISITOR_ID_RE.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`
}

export function CdpConsentGate({ consentVersion }: { consentVersion: number }) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const isSecure = window.location.protocol === 'https:'

    function grant() {
      // Consent proof (nr_consent) — the server re-validates version + choice.
      document.cookie = clientConsentCookieAssignment('accepted', consentVersion, isSecure)
      // Reuse an existing nr_vid if one is already set (stable identity across
      // visits); otherwise mint a fresh first-party one.
      let visitorId = readCookie(VISITOR_COOKIE_NAME)
      if (!visitorId) {
        visitorId = mintVisitorId()
      }
      document.cookie = clientVisitorCookieAssignment(visitorId, isSecure)
      setActive(true)
    }

    function deny() {
      document.cookie = clientClearCookieAssignment(CONSENT_COOKIE_NAME, isSecure)
      document.cookie = clientClearCookieAssignment(VISITOR_COOKIE_NAME, isSecure)
      setActive(false)
    }

    const unsubscribe = subscribeCmpConsent((signal: CmpConsentSignal) => {
      if (signal === 'granted') grant()
      else if (signal === 'denied') deny()
      // 'unknown' → stay dormant.
    })

    return unsubscribe
  }, [consentVersion])

  return active ? <CdpBeacon /> : null
}
