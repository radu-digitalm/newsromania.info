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
 * Module hygiene: the parsing/serialization helpers are pure and client-safe.
 * Payload/Redis are only reached through dynamic imports inside the server
 * helpers, so importing this module never drags server-only deps into a
 * client bundle (or into unit tests that mock them).
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
// Server helpers (dynamic imports keep this module client-safe)
// ---------------------------------------------------------------------------

/**
 * Current GDPR knobs from the site-config global, Redis-cached 60s.
 * Degrades to defaults on any Payload/Redis failure — consent handling must
 * never take the site down.
 */
export async function getGdprSettings(): Promise<GdprSettings> {
  try {
    const [{ cacheJson, rkey }, { getPayloadClient }] = await Promise.all([
      import('@/lib/redis'),
      import('@/lib/payload'),
    ])
    return await cacheJson(rkey('config', 'gdpr'), 60, async () => {
      const payload = await getPayloadClient()
      const config = await payload.findGlobal({ slug: 'site-config' })
      return {
        consentVersion: config?.gdpr?.consentVersion ?? DEFAULT_CONSENT_VERSION,
        cookieRetentionDays: config?.gdpr?.cookieRetentionDays ?? DEFAULT_COOKIE_RETENTION_DAYS,
      }
    })
  } catch {
    return {
      consentVersion: DEFAULT_CONSENT_VERSION,
      cookieRetentionDays: DEFAULT_COOKIE_RETENTION_DAYS,
    }
  }
}

/**
 * Read the visitor's consent state from a server cookie store
 * (`await cookies()` in a layout/page, or `request.cookies` in a route).
 * 'unknown' when the cookie is absent, malformed, or from an older
 * consentVersion (site-config bump ⇒ re-prompt).
 */
export async function readConsent(cookieStore: ConsentCookieReader): Promise<ConsentState> {
  const raw = cookieStore.get(CONSENT_COOKIE_NAME)?.value
  if (!raw) {
    return 'unknown'
  }
  const { consentVersion } = await getGdprSettings()
  return parseConsentCookie(raw, consentVersion)
}
