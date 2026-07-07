import { describe, expect, it } from 'vitest'

import { adsenseInsProps, formatAttributes, pushScriptFor } from '../src/components/ads/AdSenseUnit'
import {
  adsenseAt,
  buildAdPlan,
  DEFAULT_FORMAT,
  decisionFor,
  type AdEngineConfig,
  type AdPlanInput,
  type AdSenseDecision,
} from '../src/lib/ads/engine'

// ---------------------------------------------------------------------------
// Fixtures — pure, mocked site-config (no Payload/Redis/DOM anywhere)
// ---------------------------------------------------------------------------

function config(overrides: Partial<AdEngineConfig> = {}): AdEngineConfig {
  return {
    adUnitIds: [],
    amazonPartnerTags: [],
    adFrequency: [{ region: 'default', everyNth: 4 }],
    behaviouralTargetingEnabled: false,
    ...overrides,
  }
}

function input(overrides: Partial<AdPlanInput> = {}): AdPlanInput {
  return {
    region: 'RO',
    adSet: 'ro',
    country: 'RO',
    categorySlug: 'tehnologie',
    consent: 'unknown',
    profile: null,
    ...overrides,
  }
}

/** A fully-populated post-approval config: every planned placement has ≥1 unit. */
const APPROVED_UNITS: AdEngineConfig['adUnitIds'] = [
  { slot: 'feed', unitId: '1111111111', format: null },
  { slot: 'feed', unitId: '2222222222', format: 'fluid:-6t+ed+2i-1n-4w' },
  { slot: 'feed', unitId: '3333333333', format: null },
  { slot: 'article', unitId: '4444444444', format: 'in-article' },
  { slot: 'article-end', unitId: '5555555555', format: null },
  { slot: 'leaderboard', unitId: '6666666666', format: '728x90' },
]

// ---------------------------------------------------------------------------
// 1. Unit selection by placement (site-config rows map 1:1 via `slot`)
// ---------------------------------------------------------------------------

describe('buildAdPlan — unit selection by placement', () => {
  it('each placement picks ONLY units whose slot matches', () => {
    const plan = buildAdPlan(input(), config({ adUnitIds: APPROVED_UNITS }))
    expect(decisionFor(plan, 'feed')?.adsense?.unitId).toBe('1111111111')
    expect(decisionFor(plan, 'article')?.adsense?.unitId).toBe('4444444444')
    expect(decisionFor(plan, 'article-end')?.adsense?.unitId).toBe('5555555555')
    expect(decisionFor(plan, 'leaderboard')?.adsense?.unitId).toBe('6666666666')
  })

  it('exposes the full same-placement pool in config order (adsenseUnits)', () => {
    const plan = buildAdPlan(input(), config({ adUnitIds: APPROVED_UNITS }))
    expect(decisionFor(plan, 'feed')?.adsenseUnits?.map((u) => u.unitId)).toEqual([
      '1111111111',
      '2222222222',
      '3333333333',
    ])
    expect(decisionFor(plan, 'article')?.adsenseUnits).toHaveLength(1)
  })

  it('an empty format falls back to the placement default', () => {
    const plan = buildAdPlan(input(), config({ adUnitIds: APPROVED_UNITS }))
    expect(decisionFor(plan, 'feed')?.adsense?.format).toBe(DEFAULT_FORMAT.feed)
    expect(decisionFor(plan, 'article-end')?.adsense?.format).toBe(DEFAULT_FORMAT['article-end'])
    // Explicit formats pass through untouched.
    expect(decisionFor(plan, 'article')?.adsense?.format).toBe('in-article')
    expect(decisionFor(plan, 'leaderboard')?.adsense?.format).toBe('728x90')
  })

  it('placement defaults follow the v2 §4.4 mapping (rail kept for compat only)', () => {
    expect(DEFAULT_FORMAT).toEqual({
      feed: 'fluid',
      article: 'in-article',
      'article-end': 'rectangle',
      rail: 'rectangle',
      leaderboard: 'horizontal',
    })
  })

  it('rows with an empty unitId are ignored (never render a slotless push)', () => {
    const plan = buildAdPlan(
      input(),
      config({ adUnitIds: [{ slot: 'feed', unitId: '', format: 'fluid' }] }),
    )
    expect(decisionFor(plan, 'feed')?.adsense?.unitId).toBeUndefined()
    expect(decisionFor(plan, 'feed')?.adsenseUnits).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Rotation determinism (adsenseAt: units[index mod N], no randomness)
// ---------------------------------------------------------------------------

describe('adsenseAt — deterministic rotation by position index', () => {
  const plan = buildAdPlan(input(), config({ adUnitIds: APPROVED_UNITS }))
  const feed = decisionFor(plan, 'feed')

  it('cycles units[index mod N] across page positions', () => {
    expect(adsenseAt(feed, 0)?.unitId).toBe('1111111111')
    expect(adsenseAt(feed, 1)?.unitId).toBe('2222222222')
    expect(adsenseAt(feed, 2)?.unitId).toBe('3333333333')
    expect(adsenseAt(feed, 3)?.unitId).toBe('1111111111') // wraps
    expect(adsenseAt(feed, 7)?.unitId).toBe('2222222222')
  })

  it('is deterministic — same decision + index always yields the same unit', () => {
    for (let i = 0; i < 5; i++) {
      expect(adsenseAt(feed, 1)?.unitId).toBe('2222222222')
    }
  })

  it('carries the rotated unit format (layout key included)', () => {
    expect(adsenseAt(feed, 1)?.format).toBe('fluid:-6t+ed+2i-1n-4w')
    expect(adsenseAt(feed, 2)?.format).toBe(DEFAULT_FORMAT.feed)
  })

  it('a single-unit placement serves the same unit at every index', () => {
    const article = decisionFor(plan, 'article')
    expect(adsenseAt(article, 0)?.unitId).toBe('4444444444')
    expect(adsenseAt(article, 1)?.unitId).toBe('4444444444')
    expect(adsenseAt(article, 9)?.unitId).toBe('4444444444')
  })

  it('degrades safely: no units → base decision; no decision → undefined', () => {
    const empty = buildAdPlan(input(), config())
    const end = decisionFor(empty, 'article-end')
    expect(adsenseAt(end, 2)).toEqual(end?.adsense)
    expect(adsenseAt(end, 2)?.unitId).toBeUndefined()
    // 'rail' is never planned in v2 ⇒ no decision ⇒ undefined all the way.
    expect(adsenseAt(decisionFor(empty, 'rail'), 0)).toBeUndefined()
    expect(adsenseAt(undefined, 0)).toBeUndefined()
  })

  it('clamps degenerate indexes to 0 instead of crashing', () => {
    expect(adsenseAt(feed, -3)?.unitId).toBe('1111111111')
    expect(adsenseAt(feed, Number.NaN)?.unitId).toBe('1111111111')
    expect(adsenseAt(feed, 1.9)?.unitId).toBe('2222222222') // floors
  })
})

// ---------------------------------------------------------------------------
// 3. NPA propagation (consent !== 'accepted' ⇒ npa on every rendered unit)
// ---------------------------------------------------------------------------

describe('npa propagation — engine decision → rotated unit → <ins> attributes', () => {
  it.each(['unknown', 'refused'] as const)(
    'consent=%s ⇒ npa=true survives rotation and reaches data-npa="1"',
    (consent) => {
      const plan = buildAdPlan(input({ consent }), config({ adUnitIds: APPROVED_UNITS }))
      for (const placement of ['feed', 'article', 'article-end', 'leaderboard'] as const) {
        for (const index of [0, 1, 2]) {
          const rotated = adsenseAt(decisionFor(plan, placement), index)
          expect(rotated?.npa).toBe(true)
          expect(adsenseInsProps(rotated!)['data-npa']).toBe('1')
        }
      }
    },
  )

  it('consent=accepted ⇒ npa=false ⇒ data-npa="0"', () => {
    const plan = buildAdPlan(input({ consent: 'accepted' }), config({ adUnitIds: APPROVED_UNITS }))
    const rotated = adsenseAt(decisionFor(plan, 'feed'), 1)
    expect(rotated?.npa).toBe(false)
    expect(adsenseInsProps(rotated!)['data-npa']).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// 4. Empty-unitId fallback (AdSense review pending — EXPECTED state)
// ---------------------------------------------------------------------------

describe('empty-unitId fallback — inert reserved slot, never a fake ad', () => {
  const inert: AdSenseDecision = { unitId: undefined, format: 'auto', npa: true }

  it('renders NO data-ad-slot and requests no fill', () => {
    const props = adsenseInsProps(inert)
    expect(props).not.toHaveProperty('data-ad-slot')
    // The client is always present (site tag continuity), slot never faked.
    expect(props['data-ad-client']).toMatch(/^ca-pub-\d+$/)
  })

  it('the seeded (pre-approval) config yields inert decisions on all placements', () => {
    const plan = buildAdPlan(input(), config())
    for (const slot of plan.slots) {
      expect(adsenseAt(slot, 0)?.unitId).toBeUndefined()
      expect(adsenseInsProps(adsenseAt(slot, 0)!)).not.toHaveProperty('data-ad-slot')
    }
  })

  it('a real unitId flows into data-ad-slot', () => {
    const props = adsenseInsProps({ unitId: '9876543210', format: 'rectangle', npa: true })
    expect(props['data-ad-slot']).toBe('9876543210')
  })
})

// ---------------------------------------------------------------------------
// Format → <ins> attribute mapping (responsive per placement, §6.4)
// ---------------------------------------------------------------------------

describe('formatAttributes — placement format mapping', () => {
  it('feed: fluid/in-feed → data-ad-format="fluid" (+ optional layout key)', () => {
    expect(formatAttributes('fluid')['data-ad-format']).toBe('fluid')
    expect(formatAttributes('in-feed')['data-ad-format']).toBe('fluid')
    expect(formatAttributes('fluid')['data-ad-layout-key']).toBeUndefined()
    const keyed = formatAttributes('fluid:-6t+ed+2i-1n-4w')
    expect(keyed['data-ad-format']).toBe('fluid')
    expect(keyed['data-ad-layout-key']).toBe('-6t+ed+2i-1n-4w')
  })

  it('article: in-article → fluid + data-ad-layout="in-article"', () => {
    const attrs = formatAttributes('in-article')
    expect(attrs['data-ad-format']).toBe('fluid')
    expect(attrs['data-ad-layout']).toBe('in-article')
  })

  it('article-end: rectangle/300x250 → fixed 300×250, no data-ad-format', () => {
    for (const format of ['rectangle', '300x250']) {
      const attrs = formatAttributes(format)
      expect(attrs.style).toEqual({ display: 'inline-block', width: 300, height: 250 })
      expect(attrs['data-ad-format']).toBeUndefined()
    }
  })

  it('leaderboard: horizontal → CSS-sized responsive banner (no inline size, no format)', () => {
    // v2 §4.4: the banner is no longer desktop-only — AdSlot's media-query
    // classes size the <ins> (320×100 <768px / 728×90 ≥768px), so the
    // attributes carry no fixed dimensions and no data-ad-format.
    for (const format of ['horizontal', 'leaderboard']) {
      const attrs = formatAttributes(format)
      expect(attrs.style).toEqual({ display: 'block' })
      expect(attrs['data-ad-format']).toBeUndefined()
      expect(attrs['data-full-width-responsive']).toBeUndefined()
    }
    // An explicit fixed size stays fixed (owner opted out of responsive).
    expect(formatAttributes('728x90').style).toEqual({
      display: 'inline-block',
      width: 728,
      height: 90,
    })
  })

  it('any WxH → fixed custom size; unknown/auto → responsive auto', () => {
    expect(formatAttributes('300x600').style).toEqual({
      display: 'inline-block',
      width: 300,
      height: 600,
    })
    for (const format of ['auto', 'whatever']) {
      const attrs = formatAttributes(format)
      expect(attrs['data-ad-format']).toBe('auto')
      expect(attrs['data-full-width-responsive']).toBe('true')
    }
  })
})

// ---------------------------------------------------------------------------
// Per-slot push script (idempotent guard — max one push() per <ins>)
// ---------------------------------------------------------------------------

describe('pushScriptFor — idempotent per-slot fill request', () => {
  it('targets exactly the given <ins> id and guards against double push', () => {
    const script = pushScriptFor('nr-ad-:r1:')
    expect(script).toContain('document.getElementById("nr-ad-:r1:")')
    expect(script).toContain("getAttribute('data-nr-ad-pushed')==='1'")
    expect(script).toContain("setAttribute('data-nr-ad-pushed','1')")
    // The guard is set BEFORE the push so a re-run can never double-fill.
    expect(script.indexOf("setAttribute('data-nr-ad-pushed','1')")).toBeLessThan(
      script.indexOf('adsbygoogle=window.adsbygoogle||[]).push({})'),
    )
    // Failures are swallowed — a blocked script must never break the page.
    expect(script).toContain('catch(e){}')
  })
})
