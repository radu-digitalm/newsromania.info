/**
 * GDPR consent layer (architecture.md §4, PROJECT_BRIEF §8).
 *
 * Cookie `nr_consent` = URL-encoded JSON `{ v, choice, ts }` — HttpOnly,
 * SameSite=Lax, Secure in prod, path /, max-age from site-config
 * gdpr.cookieRetentionDays (180d default). It is written ONLY together with
 * an explicit visitor choice; nothing else touches cookies/storage before
 * that choice. The visitor-id cookie `nr_vid` exists only while
 * choice === 'accepted'.
 *
 * A version bump of site-config gdpr.consentVersion invalidates every stored
 * choice (v < current ⇒ 'unknown') and re-prompts the banner.
 *
 * Module hygiene: this module is PURE and client-safe — no Payload/Redis, not
 * even via dynamic import (Turbopack's production build statically traces those
 * into any importing bundle, so a `'use client'` importer would drag
 * fs/dns/child_process into the browser bundle). The server-only helpers that
 * read site-config (getGdprSettings, readConsent) live in `consent-server.ts`.
 */

export const CONSENT_COOKIE_NAME = 'nr_consent'
export const VISITOR_COOKIE_NAME = 'nr_vid'

export const DEFAULT_CONSENT_VERSION = 1
export const DEFAULT_COOKIE_RETENTION_DAYS = 180
export const VISITOR_COOKIE_MAX_AGE_DAYS = 365

/** What the visitor can choose in the banner (cookie payload values). */
export type ConsentChoice = 'accepted' | 'refused'
/** What a server read yields: 'unknown' = no valid, current-version cookie. */
export type ConsentState = ConsentChoice | 'unknown'
/** consent-records also log explicit withdrawals (stored choice = refused). */
export type ConsentRecordChoice = ConsentChoice | 'withdrawn'

export interface ConsentCookiePayload {
  v: number
  choice: ConsentChoice
  ts: string
}

export interface GdprSettings {
  consentVersion: number
  cookieRetentionDays: number
}

/** Minimal cookie-store shape — matches Next's (await cookies()) object. */
export interface ConsentCookieReader {
  get(name: string): { value: string } | undefined
}

// ---------------------------------------------------------------------------
// Pure, client-safe helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw `nr_consent` cookie value into a consent state.
 * Anything malformed, non-JSON, wrongly typed or older than
 * `currentVersion` collapses to 'unknown' (⇒ banner re-prompts).
 */
export function parseConsentCookie(
  raw: string | null | undefined,
  currentVersion: number,
): ConsentState {
  if (typeof raw !== 'string' || raw === '') {
    return 'unknown'
  }
  let text = raw
  try {
    text = decodeURIComponent(raw)
  } catch {
    // not URL-encoded — try the raw value as-is
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return 'unknown'
  }
  if (typeof data !== 'object' || data === null) {
    return 'unknown'
  }
  const { v, choice } = data as Record<string, unknown>
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return 'unknown'
  }
  if (choice !== 'accepted' && choice !== 'refused') {
    return 'unknown'
  }
  // Version bump re-prompts: an older stored choice no longer counts.
  if (v < currentVersion) {
    return 'unknown'
  }
  return choice
}

/** Build the (URL-encoded JSON) value stored in `nr_consent`. */
export function serializeConsentCookieValue(
  choice: ConsentChoice,
  version: number,
  now: Date = new Date(),
): string {
  const payload: ConsentCookiePayload = { v: version, choice, ts: now.toISOString() }
  return encodeURIComponent(JSON.stringify(payload))
}

export interface CookieOptions {
  /** Seconds. 0 deletes the cookie. */
  maxAge: number
  httpOnly?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
  path?: string
  secure?: boolean
}

/** Serialize a Set-Cookie header value (value must already be cookie-safe). */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${value}`]
  parts.push(`Path=${options.path ?? '/'}`)
  parts.push(`Max-Age=${options.maxAge}`)
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)
  if (options.httpOnly !== false) {
    parts.push('HttpOnly')
  }
  if (options.secure ?? process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }
  return parts.join('; ')
}

/** Set-Cookie header for `nr_consent` carrying the visitor's choice. */
export function consentCookieHeader(
  choice: ConsentChoice,
  version: number,
  retentionDays: number = DEFAULT_COOKIE_RETENTION_DAYS,
): string {
  return serializeCookie(CONSENT_COOKIE_NAME, serializeConsentCookieValue(choice, version), {
    maxAge: retentionDays * 86_400,
  })
}

/** Set-Cookie header creating `nr_vid` — ONLY ever sent with 'accepted'. */
export function visitorCookieHeader(visitorId: string): string {
  return serializeCookie(VISITOR_COOKIE_NAME, visitorId, {
    maxAge: VISITOR_COOKIE_MAX_AGE_DAYS * 86_400,
  })
}

/** Set-Cookie header deleting `nr_vid` (refused/withdrawn). */
export function clearVisitorCookieHeader(): string {
  return serializeCookie(VISITOR_COOKIE_NAME, '', { maxAge: 0 })
}

// ---------------------------------------------------------------------------
// Client-side, first-party CDP re-activation (CMP-consent gated)
// ---------------------------------------------------------------------------
//
// CMP reconciliation (2026-07): our custom banner + POST /api/consent are
// retired, so the HttpOnly `nr_consent`/`nr_vid` cookies are never written
// server-side any more. To RE-ACTIVATE the (dormant) first-party CDP we read
// Google's certified CMP signal CLIENT-SIDE (TCF v2 __tcfapi / Consent Mode —
// see components/cdp/consent-signal.ts) and, ONLY once it reports consent, the
// browser itself writes these two first-party cookies (SameSite=Lax, Secure in
// prod, NOT HttpOnly so the same client can re-read/clear them on withdrawal):
//   - `nr_consent` = the SAME versioned JSON `readConsent()` already parses, so
//     the server-side guard on /api/cdp/events + the profile lookup in the ad
//     engine light up UNCHANGED (they still require readConsent()==='accepted'
//     AND a valid nr_vid — the "lightweight consent proof" the brief asks for);
//   - `nr_vid`     = a first-party random visitor id.
// Before the CMP grant is read NOTHING is written — server cookies stay ZERO.
// These helpers are pure string builders (no document access) so consent.ts
// stays client-bundle-safe; the gate component applies them via document.cookie.

/** A `document.cookie` assignment string for a first-party (JS-readable) cookie. */
export function clientCookieAssignment(
  name: string,
  value: string,
  maxAgeSeconds: number,
  isSecure: boolean,
): string {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${maxAgeSeconds}`, 'SameSite=Lax']
  if (isSecure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

/** First-party `nr_consent` assignment carrying an explicit CMP-derived choice. */
export function clientConsentCookieAssignment(
  choice: ConsentChoice,
  version: number,
  isSecure: boolean,
  retentionDays: number = DEFAULT_COOKIE_RETENTION_DAYS,
): string {
  return clientCookieAssignment(
    CONSENT_COOKIE_NAME,
    serializeConsentCookieValue(choice, version),
    retentionDays * 86_400,
    isSecure,
  )
}

/** First-party `nr_vid` assignment (only ever written once CMP consent is read). */
export function clientVisitorCookieAssignment(visitorId: string, isSecure: boolean): string {
  return clientCookieAssignment(
    VISITOR_COOKIE_NAME,
    visitorId,
    VISITOR_COOKIE_MAX_AGE_DAYS * 86_400,
    isSecure,
  )
}

/** Delete a first-party cookie (Max-Age=0) — used on CMP consent withdrawal. */
export function clientClearCookieAssignment(name: string, isSecure: boolean): string {
  return clientCookieAssignment(name, '', 0, isSecure)
}

// The server-only helpers getGdprSettings() and readConsent() (they read
// site-config via Payload + Redis) now live in `consent-server.ts` — see this
// module's header for why they must not be reachable from a client bundle.
