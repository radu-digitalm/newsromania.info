/**
 * Teste vitest pentru robots.txt (src/app/robots.ts). Modul pur — fără rețea.
 *
 * Contract:
 * - permite crawling-ul întregului site public (Allow: /),
 * - blochează backend-ul editorial (/admin), API-ul (/api) și dashboard-ul
 *   de analytics Umami proxat sub /stats,
 * - publică referința corectă către sitemap pe originul canonic.
 */
import { describe, expect, it } from 'vitest'

import robots from '../src/app/robots'
import { siteConfig } from '../src/config/site'

describe('robots.txt', () => {
  const result = robots()
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules!]
  const rule = rules[0]!

  it('has a single wildcard user-agent rule', () => {
    expect(rules).toHaveLength(1)
    expect(rule.userAgent).toBe('*')
  })

  it('allows the public site', () => {
    expect(rule.allow).toBe('/')
  })

  it('disallows the backend, the API, and the analytics dashboard', () => {
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow!]
    expect(disallow).toContain('/admin')
    expect(disallow).toContain('/api')
    expect(disallow).toContain('/stats')
  })

  it('does not disallow any public content path', () => {
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow!]
    // Public reading surfaces must stay crawlable.
    expect(disallow).not.toContain('/')
    expect(disallow).not.toContain('/stiri')
    expect(disallow).not.toContain('/categorie')
  })

  it('points at the sitemap on the canonical origin', () => {
    const base = siteConfig.url.replace(/\/+$/, '')
    expect(result.sitemap).toBe(`${base}/sitemap.xml`)
  })
})
