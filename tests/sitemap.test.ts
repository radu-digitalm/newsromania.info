/**
 * Teste vitest pentru sitemap.xml (src/app/sitemap.ts). Fără rețea:
 * getPublishedOriginals e mock-uit ca sitemap-ul să fie testat izolat de DB.
 *
 * Contract (PROJECT_BRIEF §16):
 * - listează DOAR pagini indexabile proprii: home, cele 8 categorii și
 *   fiecare articol ORIGINAL /stiri,
 * - EXCLUDE item-ele agregate (canonical la publisher) și paginile legale
 *   (noindex) — nu apar aici pentru că nu ajung niciodată în lista de
 *   originale și categoriile din config nu le conțin,
 * - toate URL-urile sunt absolute, pe originul canonic,
 * - lastModified pentru articole reflectă publishedAt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OriginalArticle } from '../src/types/content'

const getPublishedOriginalsMock = vi.fn<() => Promise<OriginalArticle[]>>()

vi.mock('../src/lib/content', () => ({
  getPublishedOriginals: () => getPublishedOriginalsMock(),
}))

import sitemap from '../src/app/sitemap'
import { siteConfig } from '../src/config/site'

const BASE = siteConfig.url.replace(/\/+$/, '')

function makeOriginal(slug: string, publishedAt: string): OriginalArticle {
  return {
    type: 'original',
    id: slug,
    slug,
    title: `Titlu ${slug}`,
    excerpt: 'Rezumat.',
    category: { slug: 'actualitate', name: 'Actualitate' },
    tags: [],
    publishedAt,
    author: { name: 'Redacția', slug: 'redactia' },
    body: ['Corp.'],
  }
}

describe('sitemap.xml', () => {
  beforeEach(() => {
    getPublishedOriginalsMock.mockReset()
  })

  it('lists home + every category + every published original', async () => {
    getPublishedOriginalsMock.mockResolvedValue([
      makeOriginal('primul-articol', '2026-07-01T08:00:00.000Z'),
      makeOriginal('al-doilea-articol', '2026-07-05T09:30:00.000Z'),
    ])

    const entries = await sitemap()
    const urls = entries.map((e) => e.url)

    expect(urls).toContain(`${BASE}/`)
    for (const category of siteConfig.categories) {
      expect(urls).toContain(`${BASE}/categorie/${category.slug}`)
    }
    expect(urls).toContain(`${BASE}/stiri/primul-articol`)
    expect(urls).toContain(`${BASE}/stiri/al-doilea-articol`)

    // Exact count: 1 home + N categories + M originals, no extras.
    expect(entries).toHaveLength(1 + siteConfig.categories.length + 2)
  })

  it('emits only absolute URLs on the canonical origin', async () => {
    getPublishedOriginalsMock.mockResolvedValue([
      makeOriginal('un-articol', '2026-07-01T08:00:00.000Z'),
    ])

    const entries = await sitemap()
    for (const entry of entries) {
      expect(entry.url.startsWith(`${BASE}/`)).toBe(true)
    }
  })

  it('uses the article publishedAt as lastModified for /stiri entries', async () => {
    const iso = '2026-07-05T09:30:00.000Z'
    getPublishedOriginalsMock.mockResolvedValue([makeOriginal('data-test', iso)])

    const entries = await sitemap()
    const article = entries.find((e) => e.url === `${BASE}/stiri/data-test`)!
    expect(article).toBeDefined()
    expect(new Date(article.lastModified!).toISOString()).toBe(iso)
  })

  it('excludes aggregated and legal pages (they never enter the sitemap)', async () => {
    getPublishedOriginalsMock.mockResolvedValue([])

    const entries = await sitemap()
    const urls = entries.map((e) => e.url)

    // No /stiri entries at all when there are no originals — proves
    // aggregated items are not sourced here.
    expect(urls.some((u) => u.startsWith(`${BASE}/stiri/`))).toBe(false)
    // Legal/info pages are never listed.
    for (const path of [
      '/politica-de-confidentialitate',
      '/politica-de-cookies',
      '/termeni-si-conditii',
      '/mentiuni-legale',
      '/despre-noi',
      '/contact',
      '/cautare',
    ]) {
      expect(urls).not.toContain(`${BASE}${path}`)
    }
  })

  it('gives home the highest priority and categories/articles sensible ones', async () => {
    getPublishedOriginalsMock.mockResolvedValue([
      makeOriginal('un-articol', '2026-07-01T08:00:00.000Z'),
    ])

    const entries = await sitemap()
    const home = entries.find((e) => e.url === `${BASE}/`)!
    const category = entries.find((e) => e.url.startsWith(`${BASE}/categorie/`))!
    const article = entries.find((e) => e.url.startsWith(`${BASE}/stiri/`))!

    expect(home.priority).toBe(1)
    expect(article.priority!).toBeLessThan(home.priority!)
    expect(category.priority!).toBeGreaterThan(0)
    expect(category.priority!).toBeLessThanOrEqual(1)
  })
})
