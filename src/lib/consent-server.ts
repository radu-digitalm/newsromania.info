/**
 * GDPR consent — SERVER-ONLY helpers (split out of consent.ts, 2026-07).
 *
 * These reach Payload + Redis (dynamic import, but Turbopack's production build
 * still STATICALLY traces those into whatever bundle imports this module). They
 * used to live in consent.ts, but once a `'use client'` component
 * (CdpConsentGate) started importing consent.ts for its pure cookie helpers,
 * that trace dragged `@/lib/payload` (fs/dns/child_process) into the client
 * bundle and broke the production build. Keeping the server helpers HERE — and
 * consent.ts free of any payload/redis reference — restores the client-safety
 * contract: client code imports consent.ts, server code imports this.
 *
 * Import this ONLY from server code (layouts, route handlers, server libs).
 */

import {
  CONSENT_COOKIE_NAME,
  DEFAULT_CONSENT_VERSION,
  DEFAULT_COOKIE_RETENTION_DAYS,
  parseConsentCookie,
  type ConsentCookieReader,
  type ConsentState,
  type GdprSettings,
} from '@/lib/consent'

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
