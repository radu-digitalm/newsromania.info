import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted): geoip-lite dataset, Payload local API, Redis cache layer.
// cacheJson is a pass-through that records { key, ttlSec } so tests can assert
// cache keys/TTLs without a live Redis.
// ---------------------------------------------------------------------------

const lookupMock = vi.hoisted(() => vi.fn())
const findGlobalMock = vi.hoisted(() => vi.fn())
const cacheCalls = vi.hoisted(() => [] as Array<{ key: string; ttlSec: number }>)
// Mutable AD_PREVIEW flag (R6b): geo.ts reads AD_PREVIEW live at call time, so
// a getter-backed mock lets each test drive the preview gate. Defaults OFF so
// the production/spoofing tests keep their real-launch semantics.
const previewFlag = vi.hoisted(() => ({ on: false }))

vi.mock('@/lib/ads/preview', () => ({
  get AD_PREVIEW() {
    return previewFlag.on
  },
}))

vi.mock('geoip-lite', () => ({ default: { lookup: lookupMock } }))

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({ findGlobal: findGlobalMock }),
}))

vi.mock('@/lib/redis', () => ({
  rkey: (...parts: Array<string | number>) => ['newsromania', ...parts].join(':'),
  cacheJson: async <T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> => {
    cacheCalls.push({ key, ttlSec })
    return fn()
  },
}))

import { getClientIp, isPrivateIp, normalizeIp, resolveGeo } from '../src/lib/geo'

const LOCALE_RULES = [
  { country: 'GB', region: 'UK', adSet: 'uk' },
  { country: 'RO', region: 'RO', adSet: 'ro' },
]

/** Case-insensitive Headers stand-in (matches the HeaderReader contract). */
function makeHeaders(entries: Record<string, string>): { get(name: string): string | null } {
  const map = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]))
  return { get: (name) => map.get(name.toLowerCase()) ?? null }
}

beforeEach(() => {
  lookupMock.mockReset()
  findGlobalMock.mockReset()
  findGlobalMock.mockResolvedValue({ localeRules: LOCALE_RULES })
  cacheCalls.length = 0
  previewFlag.on = false
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// getClientIp — X-Real-IP → first X-Forwarded-For → null
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  it('prefers X-Real-IP (set by nginx in prod) over X-Forwarded-For', () => {
    const headers = makeHeaders({
      'x-real-ip': '81.180.1.2',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    })
    expect(getClientIp(headers)).toBe('81.180.1.2')
  })

  it('falls back to the FIRST X-Forwarded-For entry (leftmost = client)', () => {
    const headers = makeHeaders({
      'x-forwarded-for': ' 203.0.113.7 , 70.41.3.18, 150.172.238.178',
    })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('returns null when neither header is present or both are empty', () => {
    expect(getClientIp(makeHeaders({}))).toBeNull()
    expect(getClientIp(makeHeaders({ 'x-real-ip': '  ', 'x-forwarded-for': ' , ' }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// normalizeIp / isPrivateIp helpers
// ---------------------------------------------------------------------------

describe('normalizeIp', () => {
  it('unwraps IPv6-mapped IPv4 addresses', () => {
    expect(normalizeIp('::ffff:81.180.223.5')).toBe('81.180.223.5')
    expect(normalizeIp('::FFFF:192.168.0.9')).toBe('192.168.0.9')
  })

  it('trims/lowercases and passes plain addresses through', () => {
    expect(normalizeIp(' 8.8.8.8 ')).toBe('8.8.8.8')
    expect(normalizeIp('2A02:2F0C::1')).toBe('2a02:2f0c::1')
    expect(normalizeIp('')).toBeNull()
    expect(normalizeIp(null)).toBeNull()
  })
})

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.20.0.2', '169.254.0.1', '::1', 'fd00::1'])(
    'flags %s as private',
    (ip) => {
      expect(isPrivateIp(ip)).toBe(true)
    },
  )

  it.each(['8.8.8.8', '81.180.223.5', '172.32.0.1', '2a02:2f0c::1'])('flags %s as public', (ip) => {
    expect(isPrivateIp(ip)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveGeo — header override (dev/testing)
// ---------------------------------------------------------------------------

describe('resolveGeo: x-geo-country override', () => {
  it('uses the override and never touches geoip', async () => {
    const geo = await resolveGeo(makeHeaders({ 'x-geo-country': 'gb', 'x-real-ip': '8.8.8.8' }))
    expect(geo).toEqual({ country: 'GB', region: 'UK', adSet: 'uk' })
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('ignores malformed override values and falls through to the IP chain', async () => {
    lookupMock.mockReturnValue({ country: 'RO' })
    const geo = await resolveGeo(makeHeaders({ 'x-geo-country': 'GBR', 'x-real-ip': '5.6.7.8' }))
    expect(lookupMock).toHaveBeenCalledWith('5.6.7.8')
    expect(geo).toEqual({ country: 'RO', region: 'RO', adSet: 'ro' })
  })

  it('is disabled in production when preview is OFF (visitors cannot spoof their region)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    lookupMock.mockReturnValue({ country: 'US' })
    const geo = await resolveGeo(makeHeaders({ 'x-geo-country': 'GB', 'x-real-ip': '8.8.8.8' }))
    expect(geo.country).toBe('US')
    expect(geo.region).toBe('default')
  })

  it('R6b: is RE-ENABLED in production when AD_PREVIEW is on (owner tunnel preview)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    previewFlag.on = true
    lookupMock.mockReturnValue({ country: 'US' })
    // Owner previews GB through the SSH tunnel: the header wins over geoip.
    const geo = await resolveGeo(makeHeaders({ 'x-geo-country': 'GB', 'x-real-ip': '8.8.8.8' }))
    expect(geo).toEqual({ country: 'GB', region: 'UK', adSet: 'uk' })
    expect(lookupMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// resolveGeo — ?geo=<CC> preview override (R6b, preview-gated)
// ---------------------------------------------------------------------------

describe('resolveGeo: ?geo query-param override (R6b)', () => {
  it('honors the countryOverride ONLY when AD_PREVIEW is on', async () => {
    previewFlag.on = true
    // Loopback IP (server sees the SSH tunnel as loopback) — no geoip lookup,
    // yet ?geo=fr maps to the FR marketplace region for the preview.
    const geo = await resolveGeo(makeHeaders({ 'x-real-ip': '127.0.0.1' }), 'fr')
    // FR isn't in LOCALE_RULES → keeps country FR but default region; the
    // marketplace mapping (marketplaceForCountry) then drives amazon.fr.
    expect(geo.country).toBe('FR')
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('ignores the countryOverride when AD_PREVIEW is off (real visitors)', async () => {
    previewFlag.on = false
    lookupMock.mockReturnValue({ country: 'RO' })
    const geo = await resolveGeo(makeHeaders({ 'x-real-ip': '81.180.223.5' }), 'fr')
    // ?geo=fr is ignored → falls through to the geoip chain (RO).
    expect(geo).toEqual({ country: 'RO', region: 'RO', adSet: 'ro' })
    expect(lookupMock).toHaveBeenCalledWith('81.180.223.5')
  })

  it('ignores a malformed override and falls through to the IP chain', async () => {
    previewFlag.on = true
    lookupMock.mockReturnValue({ country: 'GB' })
    const geo = await resolveGeo(makeHeaders({ 'x-real-ip': '81.2.69.142' }), 'FRA')
    expect(geo).toEqual({ country: 'GB', region: 'UK', adSet: 'uk' })
  })

  it('the ?geo override wins over the x-geo-country header (both preview-gated)', async () => {
    previewFlag.on = true
    const geo = await resolveGeo(
      makeHeaders({ 'x-geo-country': 'gb', 'x-real-ip': '8.8.8.8' }),
      'ro',
    )
    expect(geo).toEqual({ country: 'RO', region: 'RO', adSet: 'ro' })
  })
})

// ---------------------------------------------------------------------------
// resolveGeo — private/loopback fast path
// ---------------------------------------------------------------------------

describe('resolveGeo: private-IP fast path', () => {
  it.each(['127.0.0.1', '10.0.0.5', '192.168.1.1', '::1', '::ffff:192.168.7.7'])(
    '%s → XX/default/default without a geoip lookup or per-IP cache entry',
    async (ip) => {
      const geo = await resolveGeo(ip)
      expect(geo).toEqual({ country: 'XX', region: 'default', adSet: 'default' })
      expect(lookupMock).not.toHaveBeenCalled()
      // Only the localeRules cache is touched — never newsromania:geo:<ip>.
      expect(cacheCalls.map((c) => c.key)).toEqual(['newsromania:geo:locale-rules'])
    },
  )

  it('treats a missing IP the same way', async () => {
    const geo = await resolveGeo(null)
    expect(geo).toEqual({ country: 'XX', region: 'default', adSet: 'default' })
    expect(lookupMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// resolveGeo — geoip lookup + localeRules mapping
// ---------------------------------------------------------------------------

describe('resolveGeo: localeRules mapping', () => {
  it('maps a matched country to its region/adSet', async () => {
    lookupMock.mockReturnValue({ country: 'GB' })
    const geo = await resolveGeo('81.2.69.142')
    expect(geo).toEqual({ country: 'GB', region: 'UK', adSet: 'uk' })
  })

  it('keeps the country but falls back to default/default when unmatched', async () => {
    lookupMock.mockReturnValue({ country: 'DE' })
    const geo = await resolveGeo('88.99.1.1')
    expect(geo).toEqual({ country: 'DE', region: 'default', adSet: 'default' })
  })

  it('matches rule country codes case-insensitively', async () => {
    findGlobalMock.mockResolvedValue({
      localeRules: [{ country: ' ro ', region: 'RO', adSet: 'ro' }],
    })
    lookupMock.mockReturnValue({ country: 'RO' })
    const geo = await resolveGeo('81.180.223.5')
    expect(geo).toEqual({ country: 'RO', region: 'RO', adSet: 'ro' })
  })

  it('yields XX/default when the dataset has no match for the IP', async () => {
    lookupMock.mockReturnValue(null)
    const geo = await resolveGeo('192.0.2.1')
    expect(geo).toEqual({ country: 'XX', region: 'default', adSet: 'default' })
  })

  it('degrades to default/default when site-config is unreachable', async () => {
    findGlobalMock.mockRejectedValue(new Error('db down'))
    lookupMock.mockReturnValue({ country: 'RO' })
    const geo = await resolveGeo('81.180.223.5')
    expect(geo).toEqual({ country: 'RO', region: 'default', adSet: 'default' })
  })

  it('handles a site-config with no localeRules at all', async () => {
    findGlobalMock.mockResolvedValue({ localeRules: null })
    lookupMock.mockReturnValue({ country: 'GB' })
    const geo = await resolveGeo('81.2.69.142')
    expect(geo).toEqual({ country: 'GB', region: 'default', adSet: 'default' })
  })
})

// ---------------------------------------------------------------------------
// resolveGeo — caching contract
// ---------------------------------------------------------------------------

describe('resolveGeo: cache keys & TTLs', () => {
  it('caches the per-IP result under newsromania:geo:<ip> for 6h', async () => {
    lookupMock.mockReturnValue({ country: 'RO' })
    await resolveGeo('81.180.223.5')
    expect(cacheCalls).toContainEqual({ key: 'newsromania:geo:81.180.223.5', ttlSec: 21_600 })
  })

  it('caches localeRules for 5 min', async () => {
    lookupMock.mockReturnValue({ country: 'RO' })
    await resolveGeo('81.180.223.5')
    expect(cacheCalls).toContainEqual({ key: 'newsromania:geo:locale-rules', ttlSec: 300 })
  })

  it('normalizes IPv6-mapped IPv4 before lookup and cache key', async () => {
    lookupMock.mockReturnValue({ country: 'GB' })
    await resolveGeo('::ffff:81.2.69.142')
    expect(lookupMock).toHaveBeenCalledWith('81.2.69.142')
    expect(cacheCalls).toContainEqual({ key: 'newsromania:geo:81.2.69.142', ttlSec: 21_600 })
  })

  it('extracts the IP from headers when no override is present', async () => {
    lookupMock.mockReturnValue({ country: 'GB' })
    const geo = await resolveGeo(makeHeaders({ 'x-forwarded-for': '81.2.69.142, 10.0.0.1' }))
    expect(lookupMock).toHaveBeenCalledWith('81.2.69.142')
    expect(geo).toEqual({ country: 'GB', region: 'UK', adSet: 'uk' })
  })
})
