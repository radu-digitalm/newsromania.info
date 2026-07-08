import { createHash } from 'node:crypto'

import { trackEvents, validateEventBatch, isValidVisitorId, type CdpTrackedEvent } from '@/lib/cdp'
import { VISITOR_COOKIE_NAME, type ConsentCookieReader } from '@/lib/consent'
import { readConsent } from '@/lib/consent-server'
import { getRedis, rkey } from '@/lib/redis'

/**
 * POST /api/cdp/events — the ONLY ingestion point for behavioural events
 * (architecture.md §5, PROJECT_BRIEF §7/§8).
 *
 * Consent-gated SERVER-SIDE, never trusted to the client: events are stored
 * only when the `nr_consent` cookie parses to 'accepted' at the CURRENT
 * consentVersion AND the HttpOnly `nr_vid` visitor cookie is present. Anything
 * else — missing/refused/outdated consent, missing visitor id, malformed
 * body, unknown event types, rate-limit hits, internal failures — is dropped
 * SILENTLY. The response is `204 No Content` in every case, so the endpoint
 * never leaks whether a visitor is tracked, rate-limited or invalid.
 *
 * - Body: `{ events: [...] }`, ≤ 20 events, validated manually (type
 *   whitelist per architecture §3, path sanity, numeric bounds) — no zod.
 * - Enrichment: `region` via resolveGeo(getClientIp) — soft-imported so a
 *   missing/failing geo module degrades to 'XX'; `ts` is server time;
 *   `visitorId` comes from the cookie, NEVER from the body.
 * - Rate limit: 60 req/min/IP via Redis (keyed by IP hash — no raw IPs in
 *   Redis); degrades open on Redis failure.
 * - Sent by CdpBeacon via navigator.sendBeacon — the body may arrive as
 *   text/plain, so we parse JSON regardless of Content-Type.
 */

export const dynamic = 'force-dynamic'

const RATE_LIMIT_PER_MINUTE = 60
const UNKNOWN_REGION = 'XX'

function noContent(): Response {
  return new Response(null, { status: 204 })
}

function clientIp(request: Request): string {
  // nginx passes X-Real-IP (architecture.md §4); X-Forwarded-For as fallback.
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return 'unknown'
}

function hashIp(ip: string): string {
  return createHash('sha256')
    .update(ip + (process.env.PAYLOAD_SECRET ?? ''))
    .digest('hex')
}

/** true = allowed, false = over the limit. Degrades open on Redis failure. */
async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const redis = getRedis()
    const key = rkey('ratelimit', 'cdp', hashIp(ip).slice(0, 32))
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, 60)
    }
    return count <= RATE_LIMIT_PER_MINUTE
  } catch {
    return true
  }
}

/**
 * Minimal Cookie-header parser exposing the ConsentCookieReader contract, so
 * readConsent() works on a plain Request (no next/headers dependency).
 */
function cookieReader(request: Request): ConsentCookieReader {
  const map = new Map<string, string>()
  const header = request.headers.get('cookie') ?? ''
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (name && !map.has(name)) map.set(name, value)
  }
  return {
    get: (name: string) => {
      const value = map.get(name)
      return value === undefined ? undefined : { value }
    },
  }
}

/**
 * Region enrichment via src/lib/geo — SOFT import: if the module is missing
 * or resolution throws, events still land with region 'XX'.
 */
async function resolveRegion(request: Request): Promise<string> {
  try {
    const geo = await import('@/lib/geo')
    const result = await geo.resolveGeo(geo.getClientIp(request.headers))
    return result.region || UNKNOWN_REGION
  } catch {
    return UNKNOWN_REGION
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = clientIp(request)
    if (!(await checkRateLimit(ip))) {
      return noContent()
    }

    // --- consent gate (server-side, before anything else is even parsed) ---
    const cookies = cookieReader(request)
    const consent = await readConsent(cookies)
    if (consent !== 'accepted') {
      return noContent()
    }
    const visitorId = cookies.get(VISITOR_COOKIE_NAME)?.value
    if (!isValidVisitorId(visitorId)) {
      return noContent()
    }

    // --- body validation (manual whitelist, path sanity, numeric bounds) ---
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return noContent()
    }
    const rawEvents =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).events
        : undefined
    const events = validateEventBatch(rawEvents)
    if (events.length === 0) {
      return noContent()
    }

    // --- enrichment + insert ---
    const region = await resolveRegion(request)
    const ts = new Date().toISOString()
    const tracked: CdpTrackedEvent[] = events.map((event) => ({
      ...event,
      visitorId,
      region,
      ts,
    }))
    await trackEvents(tracked)

    return noContent()
  } catch {
    // Never leak anything — not even a 500.
    return noContent()
  }
}
