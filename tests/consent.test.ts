import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Consent layer unit tests (architecture.md §10): cookie parsing edge cases,
 * consentVersion re-prompt logic, and the /api/consent route contract.
 * Payload and Redis are ALWAYS mocked — no live services.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(async (args: unknown) => args),
  findGlobal: vi.fn(async () => ({
    gdpr: { consentVersion: 3, cookieRetentionDays: 180 },
  })),
  incr: vi.fn(async () => 1),
  expire: vi.fn(async () => 1),
}))

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({
    create: mocks.create,
    findGlobal: mocks.findGlobal,
  }),
}))

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({ incr: mocks.incr, expire: mocks.expire }),
  rkey: (...parts: Array<string | number>) => ['newsromania', ...parts].join(':'),
  // Pass-through cache so every test sees fresh site-config values.
  cacheJson: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}))

import {
  CONSENT_COOKIE_NAME,
  VISITOR_COOKIE_NAME,
  clearVisitorCookieHeader,
  consentCookieHeader,
  parseConsentCookie,
  readConsent,
  serializeConsentCookieValue,
  serializeCookie,
  visitorCookieHeader,
} from '../src/lib/consent'
import { POST } from '../src/app/api/consent/route'

beforeEach(() => {
  mocks.create.mockClear()
  mocks.findGlobal.mockClear()
  mocks.incr.mockClear()
  mocks.incr.mockResolvedValue(1)
  mocks.expire.mockClear()
})

// ---------------------------------------------------------------------------
// parseConsentCookie
// ---------------------------------------------------------------------------

describe('parseConsentCookie', () => {
  const value = (v: number, choice: string) =>
    encodeURIComponent(JSON.stringify({ v, choice, ts: '2026-07-06T10:00:00.000Z' }))

  it('reads accepted and refused at the current version', () => {
    expect(parseConsentCookie(value(3, 'accepted'), 3)).toBe('accepted')
    expect(parseConsentCookie(value(3, 'refused'), 3)).toBe('refused')
  })

  it('a newer stored version still counts', () => {
    expect(parseConsentCookie(value(4, 'accepted'), 3)).toBe('accepted')
  })

  it('version bump invalidates the stored choice (re-prompt)', () => {
    expect(parseConsentCookie(value(2, 'accepted'), 3)).toBe('unknown')
    expect(parseConsentCookie(value(1, 'refused'), 2)).toBe('unknown')
  })

  it('absent / empty values are unknown', () => {
    expect(parseConsentCookie(undefined, 1)).toBe('unknown')
    expect(parseConsentCookie(null, 1)).toBe('unknown')
    expect(parseConsentCookie('', 1)).toBe('unknown')
  })

  it('malformed JSON is unknown', () => {
    expect(parseConsentCookie('not-json', 1)).toBe('unknown')
    expect(parseConsentCookie('%7Bbroken', 1)).toBe('unknown')
    expect(parseConsentCookie('{"v":1', 1)).toBe('unknown')
  })

  it('wrongly typed payloads are unknown', () => {
    expect(parseConsentCookie(JSON.stringify({ v: '1', choice: 'accepted' }), 1)).toBe('unknown')
    expect(parseConsentCookie(JSON.stringify({ v: 1, choice: 'maybe' }), 1)).toBe('unknown')
    expect(parseConsentCookie(JSON.stringify({ v: 1 }), 1)).toBe('unknown')
    expect(parseConsentCookie(JSON.stringify(['accepted']), 1)).toBe('unknown')
    expect(parseConsentCookie(JSON.stringify(null), 1)).toBe('unknown')
    expect(parseConsentCookie(JSON.stringify('accepted'), 1)).toBe('unknown')
  })

  it('accepts both raw and URL-encoded JSON', () => {
    const raw = JSON.stringify({ v: 2, choice: 'refused', ts: 'x' })
    expect(parseConsentCookie(raw, 2)).toBe('refused')
    expect(parseConsentCookie(encodeURIComponent(raw), 2)).toBe('refused')
  })
})

// ---------------------------------------------------------------------------
// Cookie serialization
// ---------------------------------------------------------------------------

describe('cookie serialization', () => {
  it('round-trips through parseConsentCookie', () => {
    const value = serializeConsentCookieValue('accepted', 5)
    expect(parseConsentCookie(value, 5)).toBe('accepted')
    expect(parseConsentCookie(value, 6)).toBe('unknown')
  })

  it('serializeCookie sets HttpOnly, SameSite=Lax and Path=/ by default', () => {
    const header = serializeCookie('a', 'b', { maxAge: 60 })
    expect(header).toContain('a=b')
    expect(header).toContain('Path=/')
    expect(header).toContain('Max-Age=60')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('HttpOnly')
    // NODE_ENV=test → no Secure flag outside production.
    expect(header).not.toContain('Secure')
  })

  it('consent cookie carries the retention window (180d default)', () => {
    expect(consentCookieHeader('refused', 1)).toContain(`Max-Age=${180 * 86_400}`)
    expect(consentCookieHeader('refused', 1, 30)).toContain(`Max-Age=${30 * 86_400}`)
  })

  it('visitor cookie lives 365d; clearing sets Max-Age=0', () => {
    expect(visitorCookieHeader('uuid-1')).toContain(`Max-Age=${365 * 86_400}`)
    expect(visitorCookieHeader('uuid-1')).toContain(`${VISITOR_COOKIE_NAME}=uuid-1`)
    expect(clearVisitorCookieHeader()).toContain(`${VISITOR_COOKIE_NAME}=;`)
    expect(clearVisitorCookieHeader()).toContain('Max-Age=0')
  })
})

// ---------------------------------------------------------------------------
// readConsent (server helper, versioned via site-config)
// ---------------------------------------------------------------------------

function cookieStore(value?: string) {
  return {
    get: (name: string) =>
      name === CONSENT_COOKIE_NAME && value !== undefined ? { value } : undefined,
  }
}

describe('readConsent', () => {
  it('returns unknown without touching Payload when the cookie is absent', async () => {
    await expect(readConsent(cookieStore())).resolves.toBe('unknown')
    expect(mocks.findGlobal).not.toHaveBeenCalled()
  })

  it('honors a current-version cookie', async () => {
    const value = serializeConsentCookieValue('accepted', 3)
    await expect(readConsent(cookieStore(value))).resolves.toBe('accepted')
  })

  it('re-prompts after a consentVersion bump', async () => {
    const value = serializeConsentCookieValue('accepted', 2) // site-config says 3
    await expect(readConsent(cookieStore(value))).resolves.toBe('unknown')
  })

  it('degrades to the default version when site-config is unreachable', async () => {
    mocks.findGlobal.mockRejectedValueOnce(new Error('db down'))
    const value = serializeConsentCookieValue('refused', 1) // default version = 1
    await expect(readConsent(cookieStore(value))).resolves.toBe('refused')
  })
})

// ---------------------------------------------------------------------------
// POST /api/consent
// ---------------------------------------------------------------------------

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3100/api/consent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.7',
      'user-agent': 'vitest',
      host: 'localhost:3100',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function formRequest(choice: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3100/api/consent', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-real-ip': '203.0.113.7',
      host: 'localhost:3100',
      ...headers,
    },
    body: new URLSearchParams({ choice }).toString(),
  })
}

describe('POST /api/consent', () => {
  it('rejects invalid choices without setting cookies or writing records', async () => {
    for (const body of [{ choice: 'yes' }, { choice: 42 }, {}, 'accepted']) {
      const res = await POST(jsonRequest(body))
      expect(res.status).toBe(400)
      expect(res.headers.getSetCookie()).toHaveLength(0)
    }
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('accepted: sets versioned nr_consent + nr_vid and logs the record', async () => {
    const res = await POST(jsonRequest({ choice: 'accepted' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, choice: 'accepted' })

    const setCookies = res.headers.getSetCookie()
    const consentCookie = setCookies.find((c) => c.startsWith(`${CONSENT_COOKIE_NAME}=`))
    const vidCookie = setCookies.find((c) => c.startsWith(`${VISITOR_COOKIE_NAME}=`))
    expect(consentCookie).toBeDefined()
    expect(consentCookie).toContain('HttpOnly')
    expect(consentCookie).toContain('SameSite=Lax')
    // Version comes from the (mocked) site-config global (consentVersion: 3).
    const rawValue = consentCookie!.split(';')[0]!.slice(CONSENT_COOKIE_NAME.length + 1)
    expect(parseConsentCookie(rawValue, 3)).toBe('accepted')
    expect(vidCookie).toBeDefined()
    expect(vidCookie).toContain('HttpOnly')
    expect(vidCookie).toContain(`Max-Age=${365 * 86_400}`)

    expect(mocks.create).toHaveBeenCalledTimes(1)
    const args = mocks.create.mock.calls[0]![0] as {
      collection: string
      data: Record<string, unknown>
    }
    expect(args.collection).toBe('consent-records')
    expect(args.data.choice).toBe('accepted')
    expect(typeof args.data.visitorId).toBe('string')
    expect(args.data.userAgent).toBe('vitest')
    // Never the raw IP — a 64-hex sha256 digest.
    expect(args.data.ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(args.data.ipHash).not.toContain('203.0.113.7')
  })

  it('refused: clears nr_vid and logs a record without visitorId', async () => {
    const res = await POST(jsonRequest({ choice: 'refused' }))
    expect(res.status).toBe(200)

    const vidCookie = res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${VISITOR_COOKIE_NAME}=`))
    expect(vidCookie).toContain('Max-Age=0')

    const args = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(args.data.choice).toBe('refused')
    expect(args.data.visitorId).toBeNull()
  })

  it('withdrawn: records the withdrawal but stores a refused cookie', async () => {
    const res = await POST(jsonRequest({ choice: 'withdrawn' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, choice: 'refused' })

    const setCookies = res.headers.getSetCookie()
    const consentCookie = setCookies.find((c) => c.startsWith(`${CONSENT_COOKIE_NAME}=`))!
    const rawValue = consentCookie.split(';')[0]!.slice(CONSENT_COOKIE_NAME.length + 1)
    expect(parseConsentCookie(rawValue, 3)).toBe('refused')
    expect(setCookies.find((c) => c.startsWith(`${VISITOR_COOKIE_NAME}=`))).toContain('Max-Age=0')

    const args = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(args.data.choice).toBe('withdrawn')
    expect(args.data.visitorId).toBeNull()
  })

  it('form POST answers 303 back to a same-origin Referer', async () => {
    const res = await POST(
      formRequest('refused', { referer: 'http://localhost:3100/setari-cookies?x=1' }),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/setari-cookies?x=1')
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${CONSENT_COOKIE_NAME}=`))).toBe(
      true,
    )
  })

  it('form POST ignores a cross-origin Referer (redirects to /)', async () => {
    const res = await POST(formRequest('accepted', { referer: 'https://evil.example/phish' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')
  })

  it('rate-limits to 10/min/IP via Redis', async () => {
    mocks.incr.mockResolvedValueOnce(11)
    const res = await POST(jsonRequest({ choice: 'accepted' }))
    expect(res.status).toBe(429)
    expect(res.headers.getSetCookie()).toHaveLength(0)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('degrades open when Redis is down (choice still honored)', async () => {
    mocks.incr.mockRejectedValueOnce(new Error('redis down'))
    const res = await POST(jsonRequest({ choice: 'refused' }))
    expect(res.status).toBe(200)
  })

  it('still answers (and sets the cookie) when the record write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.create.mockRejectedValueOnce(new Error('db down'))
    const res = await POST(jsonRequest({ choice: 'accepted' }))
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${CONSENT_COOKIE_NAME}=`))).toBe(
      true,
    )
    errorSpy.mockRestore()
  })

  it('truncates the user agent to 160 characters', async () => {
    await POST(jsonRequest({ choice: 'refused' }, { 'user-agent': 'x'.repeat(500) }))
    const args = mocks.create.mock.calls[0]![0] as { data: Record<string, unknown> }
    expect((args.data.userAgent as string).length).toBe(160)
  })
})
