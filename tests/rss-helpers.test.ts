import { describe, expect, it } from 'vitest'

// Pure per-item helpers of the ingest worker (scripts/worker/lib/rss.mjs) —
// no network: fetchFeedXml is exercised only via the fixture path in dev.
import {
  extractImage,
  itemGuid,
  itemPublishedAt,
  itemSourceText,
  stripHtml,
  USER_AGENT,
} from '../scripts/worker/lib/rss.mjs'

describe('itemGuid (dedup key: guid → link → null)', () => {
  it('prefers the guid and trims it', () => {
    expect(itemGuid({ guid: '  https://pub.example/?p=1  ', link: 'https://pub.example/a' })).toBe(
      'https://pub.example/?p=1',
    )
  })

  it('falls back to the link when guid is empty/missing', () => {
    expect(itemGuid({ guid: '   ', link: 'https://pub.example/a' })).toBe('https://pub.example/a')
    expect(itemGuid({ link: 'https://pub.example/b' })).toBe('https://pub.example/b')
  })

  it('returns null when neither exists (item is skipped, never crashes)', () => {
    expect(itemGuid({})).toBeNull()
    expect(itemGuid({ guid: '', link: '' })).toBeNull()
    expect(itemGuid({ guid: 42, link: null })).toBeNull()
  })
})

describe('itemPublishedAt', () => {
  const fallback = new Date('2026-07-06T00:00:00Z')

  it('prefers isoDate, then pubDate', () => {
    expect(
      itemPublishedAt(
        { isoDate: '2026-07-05T10:00:00Z', pubDate: 'Mon, 29 Jun 2026 08:00:00 GMT' },
        fallback,
      ).toISOString(),
    ).toBe('2026-07-05T10:00:00.000Z')
    expect(
      itemPublishedAt({ pubDate: 'Mon, 29 Jun 2026 08:00:00 GMT' }, fallback).toISOString(),
    ).toBe('2026-06-29T08:00:00.000Z')
  })

  it('skips unparseable dates and degrades to the fallback', () => {
    expect(itemPublishedAt({ isoDate: 'nu-e-data' }, fallback)).toBe(fallback)
    expect(itemPublishedAt({}, fallback)).toBe(fallback)
  })
})

describe('extractImage — LEGAL GATE: only enclosure / media:content', () => {
  it('accepts an image enclosure', () => {
    expect(
      extractImage({ enclosure: { url: 'https://pub.example/foto.jpg', type: 'image/jpeg' } }),
    ).toBe('https://pub.example/foto.jpg')
  })

  it('rejects non-image enclosures (podcast mp3)', () => {
    expect(
      extractImage({ enclosure: { url: 'https://pub.example/ep.mp3', type: 'audio/mpeg' } }),
    ).toBeNull()
  })

  it('falls back to the first image-looking media:content entry', () => {
    const item = {
      mediaContent: [
        { $: { url: 'https://pub.example/clip.mp4', type: 'video/mp4' } },
        { $: { url: 'https://pub.example/poza.png', medium: 'image' } },
      ],
    }
    expect(extractImage(item)).toBe('https://pub.example/poza.png')
  })

  it('detects images by extension when type/medium are missing', () => {
    expect(extractImage({ enclosure: { url: 'https://pub.example/img.webp?w=1200' } })).toBe(
      'https://pub.example/img.webp?w=1200',
    )
  })

  it('never uses http-less/other sources (og:image, content HTML, data URIs)', () => {
    expect(extractImage({ enclosure: { url: 'data:image/png;base64,AAAA' } })).toBeNull()
    expect(extractImage({ ogImage: 'https://pub.example/og.jpg' })).toBeNull()
    expect(extractImage({ content: '<img src="https://pub.example/in-content.jpg">' })).toBeNull()
    expect(extractImage({})).toBeNull()
  })
})

describe('stripHtml / itemSourceText (transient LLM input, never stored)', () => {
  it('strips tags and decodes the common entities', () => {
    expect(stripHtml('<p>Guvernul&nbsp;a &quot;aprobat&quot; &amp; publicat</p>')).toBe(
      'Guvernul a "aprobat" & publicat',
    )
    expect(stripHtml(42)).toBe('')
  })

  it('prefers content:encoded over content/contentSnippet/summary', () => {
    const item = {
      contentEncoded: '<p>Textul complet.</p>',
      content: 'scurt',
      contentSnippet: 'si mai scurt',
    }
    expect(itemSourceText(item)).toBe('Textul complet.')
    expect(itemSourceText({ contentSnippet: 'doar snippet' })).toBe('doar snippet')
    expect(itemSourceText({})).toBe('')
  })

  it('caps the LLM input at maxChars with an ellipsis', () => {
    const text = itemSourceText({ content: 'x'.repeat(5000) }, 100)
    expect(text.length).toBe(101)
    expect(text.endsWith('…')).toBe(true)
  })

  it('identifies the bot honestly (UA carries project + contact URL)', () => {
    expect(USER_AGENT).toContain('newsromania-bot')
    expect(USER_AGENT).toContain('newsromania.info')
  })
})
