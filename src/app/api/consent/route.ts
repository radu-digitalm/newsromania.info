import { createHash, randomUUID } from 'node:crypto'

import {
  clearVisitorCookieHeader,
  consentCookieHeader,
  visitorCookieHeader,
  type ConsentChoice,
  type ConsentRecordChoice,
} from '@/lib/consent'
import { getGdprSettings } from '@/lib/consent-server'
import { getPayloadClient } from '@/lib/payload'
import { getRedis, rkey } from '@/lib/redis'

/**
 * POST /api/consent — the ONLY writer of the consent cookies
 * (architecture.md §5, PROJECT_BRIEF §8).
 *
 * SUPERSEDED by Google's certified CMP (CMP reconciliation 2026-07): the
 * custom consent banner that POSTed here was retired, so nothing in the app
 * calls this route in production any more — advertising consent is collected
 * through Google's CMP instead. The route + the consent-records collection are
 * left in place (harmless, still unit-tested) in case the first-party consent
 * flow is ever reinstated; they no longer participate in the live consent path.
 *
 * Accepts JSON `{ choice }` (fetch from the banner) or an
 * application/x-www-form-urlencoded body (no-JS <form> fallback → 303 back
 * to the Referer). Valid choices: accepted | refused | withdrawn.
 *
 * - Sets `nr_consent` (HttpOnly — the page reloads after the choice, so the
 *   server re-renders consent state; the client never reads the cookie).
 * - 'accepted' also mints `nr_vid`; 'refused'/'withdrawn' delete it.
 * - Writes a consent-records doc (choice as given, incl. 'withdrawn';
 *   ipHash = sha256(ip + PAYLOAD_SECRET) — never the raw IP). On
 *   refuse/withdraw the record carries the visitor's EXISTING nr_vid (if
 *   any), so the CDP profiles worker (scripts/worker/profiles.mjs) can
 *   erase that visitor's profile + events — GDPR right to erasure.
 * - Rate limit 10/min/IP via Redis (degrades open on Redis failure).
 */

const RATE_LIMIT_PER_MINUTE = 10
const VALID_CHOICES: ReadonlySet<string> = new Set(['accepted', 'refused', 'withdrawn'])

function clientIp(request: Request): string {
  // nginx passes X-Real-IP (architecture.md §4); X-Forwarded-For as fallback.
  const real = request.headers.get('x-real-ip')
  if (real) {
    return real.trim()
  }
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]!.trim()
  }
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
    // Key by IP hash — no raw IPs in Redis either.
    const key = rkey('ratelimit', 'consent', hashIp(ip).slice(0, 32))
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, 60)
    }
    return count <= RATE_LIMIT_PER_MINUTE
  } catch {
    return true
  }
}

interface ParsedBody {
  choice: ConsentRecordChoice | null
  isForm: boolean
}

async function parseBody(request: Request): Promise<ParsedBody> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as unknown
      const choice =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>).choice
          : undefined
      return {
        choice:
          typeof choice === 'string' && VALID_CHOICES.has(choice)
            ? (choice as ConsentRecordChoice)
            : null,
        isForm: false,
      }
    } catch {
      return { choice: null, isForm: false }
    }
  }
  // <form method="post"> fallback (urlencoded or multipart).
  try {
    const form = await request.formData()
    const choice = form.get('choice')
    return {
      choice:
        typeof choice === 'string' && VALID_CHOICES.has(choice)
          ? (choice as ConsentRecordChoice)
          : null,
      isForm: true,
    }
  } catch {
    return { choice: null, isForm: true }
  }
}

/**
 * The visitor's EXISTING `nr_vid` from the Cookie header (uuid-shaped only).
 * Read exclusively while processing an explicit refuse/withdraw choice, so
 * the consent record can name the id whose CDP data must be erased.
 */
function existingVisitorId(request: Request): string | null {
  const header = request.headers.get('cookie') ?? ''
  const match = /(?:^|;\s*)nr_vid=([A-Za-z0-9-]{8,64})(?:;|$)/.exec(header)
  return match ? match[1] : null
}

/** Same-origin Referer → its path (form fallback returns there); else '/'. */
function redirectTarget(request: Request): string {
  const referer = request.headers.get('referer')
  if (!referer) {
    return '/'
  }
  try {
    const target = new URL(referer)
    const host = request.headers.get('host')
    if (host && target.host === host) {
      return target.pathname + target.search
    }
  } catch {
    // fall through
  }
  return '/'
}

function jsonResponse(status: number, body: Record<string, unknown>, headers?: Headers): Response {
  const h = headers ?? new Headers()
  h.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers: h })
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request)

  if (!(await checkRateLimit(ip))) {
    return jsonResponse(429, { ok: false, error: 'Prea multe cereri. Încercați din nou imediat.' })
  }

  const { choice, isForm } = await parseBody(request)
  if (!choice) {
    return jsonResponse(400, {
      ok: false,
      error: 'Alegere invalidă. Valori acceptate: accepted, refused, withdrawn.',
    })
  }

  // Withdrawal is recorded as 'withdrawn' but the stored cookie state
  // becomes 'refused' (binary honest state going forward).
  const cookieChoice: ConsentChoice = choice === 'accepted' ? 'accepted' : 'refused'
  const { consentVersion, cookieRetentionDays } = await getGdprSettings()

  const headers = new Headers()
  headers.append(
    'Set-Cookie',
    consentCookieHeader(cookieChoice, consentVersion, cookieRetentionDays),
  )

  let visitorId: string | null = null
  if (choice === 'accepted') {
    visitorId = randomUUID()
    headers.append('Set-Cookie', visitorCookieHeader(visitorId))
  } else {
    // Record the id being given up (if any): the profiles worker uses it to
    // delete the visitor's CDP profile + events (GDPR erasure), then the
    // cookie itself is removed below.
    visitorId = existingVisitorId(request)
    headers.append('Set-Cookie', clearVisitorCookieHeader())
  }

  // Compliance log (create-only collection). A failed write must not undo
  // the visitor's choice — log and continue.
  try {
    const payload = await getPayloadClient()
    await payload.create({
      collection: 'consent-records',
      data: {
        choice,
        ts: new Date().toISOString(),
        visitorId,
        ipHash: hashIp(ip),
        userAgent: (request.headers.get('user-agent') ?? '').slice(0, 160),
      },
    })
  } catch (err) {
    console.error('[consent] failed to write consent record:', err)
  }

  if (isForm) {
    headers.set('Location', redirectTarget(request))
    return new Response(null, { status: 303, headers })
  }
  return jsonResponse(200, { ok: true, choice: cookieChoice }, headers)
}
