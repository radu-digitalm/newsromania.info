import geoip from 'geoip-lite'

import { getPayloadClient } from '@/lib/payload'
import { cacheJson, rkey } from '@/lib/redis'

/**
 * Server-side IP geolocation (architecture.md §4) — feeds the ad engine's
 * region/adSet decision. Provider chain:
 *
 *   1. `x-geo-country` request header override (dev/testing ONLY — ignored in
 *      production so visitors cannot pick their ad region by sending a header)
 *   2. geoip-lite lookup(ip)
 *   3. country 'XX' (unknown)
 *
 * The country is then mapped to { region, adSet } via the site-config global's
 * `localeRules` array (Redis-cached 5 min); an unmatched country falls back to
 * { region: 'default', adSet: 'default' }. Per-IP results are cached under
 * `newsromania:geo:<ip>` for 6 h.
 *
 * DATA STALENESS: geoip-lite ships a bundled GeoLite2 snapshot
 * (node_modules/geoip-lite/data) frozen at package publish time — accuracy
 * degrades over the following months. If MAXMIND_LICENSE_KEY is set in .env, a
 * future updater (systemd user timer, NOT built here — documented only) can
 * refresh it with:
 *   node node_modules/geoip-lite/scripts/updatedb.js license_key=$MAXMIND_LICENSE_KEY
 * followed by a process restart (or geoip.reloadData()).
 */

export interface GeoResult {
  /** ISO 3166-1 alpha-2, or 'XX' when unknown/private. */
  country: string
  /** Region key used by adFrequency & friends ('UK', 'RO', 'default', …). */
  region: string
  /** Ad-set key consumed by the ads engine ('default' when unmatched). */
  adSet: string
}

/**
 * Structural subset of the Fetch `Headers` / Next.js `headers()` object —
 * lets resolveGeo()/getClientIp() accept either without importing Next types.
 */
export interface HeaderReader {
  get(name: string): string | null
}

export const UNKNOWN_COUNTRY = 'XX'
const DEFAULT_REGION = 'default'
const DEFAULT_AD_SET = 'default'

const GEO_CACHE_TTL_SEC = 6 * 60 * 60 // per-IP result: 6h
const LOCALE_RULES_CACHE_TTL_SEC = 5 * 60 // site-config localeRules: 5min

interface LocaleRule {
  country: string
  region: string
  adSet: string
}

// ---------------------------------------------------------------------------
// IP extraction & normalization
// ---------------------------------------------------------------------------

/**
 * Client IP from proxy headers: `X-Real-IP` → first `X-Forwarded-For` entry →
 * null. nginx sets `X-Real-IP: $remote_addr` in prod (deploy/nginx/
 * newsromania.conf), which cannot be spoofed past the proxy — prefer it.
 */
export function getClientIp(headersList: HeaderReader): string | null {
  const realIp = headersList.get('x-real-ip')?.trim()
  if (realIp) return realIp

  // X-Forwarded-For is "client, proxy1, proxy2" — leftmost is the client.
  const forwarded = headersList.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  return null
}

/** Trim/lowercase; IPv6-mapped IPv4 ('::ffff:1.2.3.4') → plain dotted IPv4. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const ip = raw.trim().toLowerCase()
  if (!ip) return null
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip)
  return mapped ? mapped[1] : ip
}

/**
 * Private/reserved ranges that can never geolocate — fast-path to 'XX'
 * without touching the GeoLite2 dataset or the per-IP Redis cache.
 * Expects a normalized IP (see normalizeIp()).
 */
export function isPrivateIp(ip: string): boolean {
  return (
    ip === '::1' || // IPv6 loopback
    ip.startsWith('127.') || // IPv4 loopback
    ip.startsWith('10.') || // RFC 1918
    ip.startsWith('192.168.') || // RFC 1918
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || // RFC 1918 172.16.0.0/12
    ip.startsWith('169.254.') || // IPv4 link-local
    ip.startsWith('fe80:') || // IPv6 link-local
    ip.startsWith('fc') || // IPv6 ULA fc00::/7
    ip.startsWith('fd')
  )
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the visitor's { country, region, adSet }. Accepts either a raw IP
 * string or a Headers-like object (e.g. `await headers()` in a server
 * component) — the latter also enables the dev `x-geo-country` override.
 * Never throws: any provider failure degrades to 'XX'/default/default.
 */
export async function resolveGeo(ipOrHeaders: string | null | HeaderReader): Promise<GeoResult> {
  if (isHeaderReader(ipOrHeaders)) {
    const override = devCountryOverride(ipOrHeaders)
    if (override) return mapCountry(override)
    return resolveGeoForIp(getClientIp(ipOrHeaders))
  }
  return resolveGeoForIp(ipOrHeaders)
}

function isHeaderReader(value: string | null | HeaderReader): value is HeaderReader {
  return typeof value === 'object' && value !== null && typeof value.get === 'function'
}

/** Dev/testing-only country override; production ignores the header. */
function devCountryOverride(headersList: HeaderReader): string | null {
  if (process.env.NODE_ENV === 'production') return null
  const value = headersList.get('x-geo-country')?.trim().toUpperCase()
  return value && /^[A-Z]{2}$/.test(value) ? value : null
}

async function resolveGeoForIp(rawIp: string | null): Promise<GeoResult> {
  const ip = normalizeIp(rawIp)

  // Fast-path: unknown or private/loopback IPs skip both the GeoLite2 lookup
  // and the per-IP cache (they still map through localeRules for consistency).
  if (!ip || isPrivateIp(ip)) return mapCountry(UNKNOWN_COUNTRY)

  return cacheJson(rkey('geo', ip), GEO_CACHE_TTL_SEC, async () => mapCountry(lookupCountry(ip)))
}

function lookupCountry(ip: string): string {
  try {
    return geoip.lookup(ip)?.country ?? UNKNOWN_COUNTRY
  } catch {
    return UNKNOWN_COUNTRY
  }
}

// ---------------------------------------------------------------------------
// localeRules mapping (site-config global)
// ---------------------------------------------------------------------------

async function mapCountry(country: string): Promise<GeoResult> {
  const rules = await getLocaleRules()
  const rule = rules.find((r) => r.country.trim().toUpperCase() === country)
  return rule
    ? { country, region: rule.region, adSet: rule.adSet }
    : { country, region: DEFAULT_REGION, adSet: DEFAULT_AD_SET }
}

/**
 * site-config `localeRules`, Redis-cached 5 min. A failure here (DB down
 * during a request) must never block a page render — degrade to no rules,
 * i.e. default/default.
 */
async function getLocaleRules(): Promise<LocaleRule[]> {
  try {
    return await cacheJson(rkey('geo', 'locale-rules'), LOCALE_RULES_CACHE_TTL_SEC, async () => {
      const payload = await getPayloadClient()
      const config = await payload.findGlobal({ slug: 'site-config', depth: 0 })
      return (config.localeRules ?? []).map(({ country, region, adSet }) => ({
        country,
        region,
        adSet,
      }))
    })
  } catch {
    return []
  }
}
