import { describe, expect, it } from 'vitest'

// Pure per-item helpers of the ingest worker (scripts/worker/lib/rss.mjs) —
// no network: fetchFeedXml is exercised only via the fixture path in dev.
import {
  decodeFeedBytes,
  extractImage,
  itemDescription,
  itemGuid,
  itemPublishedAt,
  itemSourceText,
  stripHtml,
  USER_AGENT,
} from '../scripts/worker/lib/rss.mjs'
import { MAX_EXCERPT_WORDS, rssExcerpt } from '../scripts/worker/lib/excerpt.mjs'
import { parseOgImage, resolveImageUrl } from '../scripts/worker/lib/og-image.mjs'
import { DEFAULT_BATCH_SIZE, normalizeCursor, selectBatch } from '../scripts/worker/lib/batch.mjs'

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

  it('falls back to media:thumbnail (treated as an image even without @type)', () => {
    expect(extractImage({ mediaThumbnail: [{ $: { url: 'https://pub.example/thumb' } }] })).toBe(
      'https://pub.example/thumb',
    )
    // media:content is preferred over media:thumbnail when both exist.
    expect(
      extractImage({
        mediaContent: [{ $: { url: 'https://pub.example/big.jpg', medium: 'image' } }],
        mediaThumbnail: [{ $: { url: 'https://pub.example/thumb.jpg' } }],
      }),
    ).toBe('https://pub.example/big.jpg')
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

  it('decodes numeric character references (decimal + hex)', () => {
    // Romanian publisher punctuation: curly quotes, en-dash, ellipsis, nbsp.
    expect(stripHtml('&#8222;x&#8221; &#8211; y&#8230;')).toBe('„x” – y…')
    expect(stripHtml('a&#160;b')).toBe('a b')
    expect(stripHtml('&#x201E;foarte dezamăgit&#x201D;')).toBe('„foarte dezamăgit”')
    expect(stripHtml('final [&#8230;]')).toBe('final […]')
    // Invalid code points are left as the raw match, never crash.
    expect(stripHtml('&#9999999999;')).toBe('&#9999999999;')
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

describe('itemDescription (best raw text for the stored RSS excerpt)', () => {
  it('prefers the raw <description>, then summary/snippet/content', () => {
    expect(
      itemDescription({ descriptionRaw: '<p>Sumar publisher.</p>', contentEncoded: 'foo' }),
    ).toBe('<p>Sumar publisher.</p>')
    expect(itemDescription({ summary: 'doar summary' })).toBe('doar summary')
    expect(itemDescription({ contentSnippet: 'doar snippet' })).toBe('doar snippet')
    expect(itemDescription({ contentEncoded: 'ultima resursă' })).toBe('ultima resursă')
    expect(itemDescription({})).toBe('')
  })
})

describe('rssExcerpt — LEGAL GATE: ≤70-word very-short extract', () => {
  it('strips HTML and keeps short text verbatim (no ellipsis)', () => {
    expect(rssExcerpt('<p>Guvernul a aprobat bugetul pe 2026.</p>')).toBe(
      'Guvernul a aprobat bugetul pe 2026.',
    )
  })

  it('returns null for empty / textless input (caller goes AI or link-only)', () => {
    expect(rssExcerpt('')).toBeNull()
    expect(rssExcerpt('   <br> <img> ')).toBeNull()
    expect(rssExcerpt(undefined as unknown as string)).toBeNull()
  })

  it('trims to at most MAX_EXCERPT_WORDS words on a word boundary + ellipsis', () => {
    const long = Array.from({ length: 80 }, (_, i) => `cuvant${i}`).join(' ')
    const out = rssExcerpt(long)
    expect(out).not.toBeNull()
    expect(out!.endsWith('…')).toBe(true)
    // Word count of the clipped body (drop the trailing ellipsis token).
    const words = out!.replace(/…$/, '').trim().split(/\s+/)
    expect(words.length).toBe(MAX_EXCERPT_WORDS)
    expect(words[0]).toBe('cuvant0')
    expect(words[MAX_EXCERPT_WORDS - 1]).toBe(`cuvant${MAX_EXCERPT_WORDS - 1}`)
  })

  it('does not leave dangling punctuation before the ellipsis', () => {
    const words = Array.from({ length: MAX_EXCERPT_WORDS + 10 }, (_, i) =>
      i === MAX_EXCERPT_WORDS - 1 ? 'gata,' : `w${i}`,
    )
    const out = rssExcerpt(words.join(' '))
    expect(out).not.toBeNull()
    expect(out!.endsWith(',…')).toBe(false)
    expect(out!.endsWith('gata…')).toBe(true)
  })
})

describe('decodeFeedBytes — charset-aware feed decode (bursa.ro mojibake fix)', () => {
  // 0xE3 = „ă" in ISO-8859-2 (invalid as UTF-8 ⇒ would become U+FFFD).
  const iso88592Body = (declEncoding: string | null) =>
    Uint8Array.from([
      ...new TextEncoder().encode(
        `<?xml version="1.0"${declEncoding ? ` encoding="${declEncoding}"` : ''}?><t>b`,
      ),
      0xe3,
      ...new TextEncoder().encode('</t>'),
    ])

  it('decodes an iso-8859-2 feed via its XML encoding declaration', () => {
    const out = decodeFeedBytes(iso88592Body('iso-8859-2'))
    expect(out).toContain('bă')
    expect(out).not.toContain('�')
  })

  it('honors the HTTP Content-Type charset when the XML omits encoding', () => {
    const out = decodeFeedBytes(iso88592Body(null), 'application/xml; charset=iso-8859-2')
    expect(out).toContain('bă')
    expect(out).not.toContain('�')
  })

  it('defaults to UTF-8 when nothing is declared', () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0"?><t>ăâîșț</t>')
    expect(decodeFeedBytes(bytes)).toContain('ăâîșț')
  })

  it('falls back to UTF-8 for an unknown charset label (never throws)', () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0" encoding="bogus-xyz-42"?><t>ok</t>')
    expect(decodeFeedBytes(bytes)).toContain('ok')
  })

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const u8 = iso88592Body('iso-8859-2')
    expect(decodeFeedBytes(u8.buffer)).toContain('bă')
  })
})

describe('resolveImageUrl (absolute http(s) only, relative resolved vs page)', () => {
  const page = 'https://pub.example/stiri/articol'
  it('resolves relative paths against the article URL', () => {
    expect(resolveImageUrl('/media/foto.jpg', page)).toBe('https://pub.example/media/foto.jpg')
    expect(resolveImageUrl('foto.jpg', page)).toBe('https://pub.example/stiri/foto.jpg')
  })
  it('keeps absolute http(s) urls and rejects other schemes / empties', () => {
    expect(resolveImageUrl('https://cdn.example/a.jpg', page)).toBe('https://cdn.example/a.jpg')
    expect(resolveImageUrl('data:image/png;base64,AAAA', page)).toBeNull()
    expect(resolveImageUrl('', page)).toBeNull()
    expect(resolveImageUrl(undefined as unknown as string, page)).toBeNull()
  })
})

describe('parseOgImage (og:image → twitter:image → first on-domain <img>)', () => {
  const page = 'https://pub.example/stiri/articol'

  it('prefers og:image regardless of attribute order', () => {
    expect(
      parseOgImage('<meta property="og:image" content="https://pub.example/og.jpg">', page),
    ).toBe('https://pub.example/og.jpg')
    expect(
      parseOgImage('<meta content="https://pub.example/og2.jpg" property="og:image"/>', page),
    ).toBe('https://pub.example/og2.jpg')
  })

  it('falls back to twitter:image (name= attribute)', () => {
    expect(
      parseOgImage('<meta name="twitter:image" content="https://pub.example/tw.jpg">', page),
    ).toBe('https://pub.example/tw.jpg')
  })

  it('resolves a relative og:image against the page URL', () => {
    expect(parseOgImage('<meta property="og:image" content="/img/lead.jpg">', page)).toBe(
      'https://pub.example/img/lead.jpg',
    )
  })

  it('falls back to the first ON-DOMAIN <img>, skipping off-domain ones', () => {
    const html =
      '<img src="https://ads.other.com/tracker.gif"><img src="https://pub.example/inline.jpg">'
    expect(parseOgImage(html, page)).toBe('https://pub.example/inline.jpg')
  })

  it('returns null when there is no usable image', () => {
    expect(parseOgImage('<html><head></head><body>fără poze</body></html>', page)).toBeNull()
    expect(parseOgImage('', page)).toBeNull()
  })
})

describe('selectBatch / normalizeCursor (5-min rotating batches)', () => {
  const feeds = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }))

  it('has a sane default batch size', () => {
    expect(DEFAULT_BATCH_SIZE).toBe(10)
  })

  it('normalizes garbage/negative/out-of-range cursors into [0, total)', () => {
    expect(normalizeCursor(null, 25)).toBe(0)
    expect(normalizeCursor('nan', 25)).toBe(0)
    expect(normalizeCursor('-4', 25)).toBe(0)
    expect(normalizeCursor('30', 25)).toBe(5)
    expect(normalizeCursor('7', 25)).toBe(7)
    expect(normalizeCursor('7', 0)).toBe(0)
  })

  it('takes BATCH_SIZE feeds from the cursor and advances it', () => {
    const first = selectBatch(feeds, null, 10)
    expect(first.start).toBe(0)
    expect(first.batch.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(first.nextCursor).toBe(10)

    const second = selectBatch(feeds, String(first.nextCursor), 10)
    expect(second.batch.map((f) => f.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(second.nextCursor).toBe(20)
  })

  it('wraps around the end so every feed is eventually covered', () => {
    const third = selectBatch(feeds, '20', 10)
    // 20..24 then wrap to 0..4 (ids 21..25, 1..5)
    expect(third.batch.map((f) => f.id)).toEqual([21, 22, 23, 24, 25, 1, 2, 3, 4, 5])
    expect(third.nextCursor).toBe(5)
  })

  it('never duplicates within one batch when total ≤ batch size', () => {
    const small = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const res = selectBatch(small, '1', 10)
    expect(res.batch.map((f) => f.id)).toEqual([2, 3, 1])
    expect(res.nextCursor).toBe(1) // (start 1 + processed 3) % 3
  })

  it('handles an empty feed list', () => {
    expect(selectBatch([], '4', 10)).toEqual({ batch: [], nextCursor: 0, start: 0 })
  })
})
