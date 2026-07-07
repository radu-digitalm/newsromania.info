import { describe, expect, it } from 'vitest'

import {
  buildAdPlan,
  DEFAULT_EVERY_NTH,
  DEFAULT_MARKETPLACE,
  decisionFor,
  feedAdPositions,
  marketplaceForCountry,
  type AdEngineConfig,
  type AdPlanInput,
} from '../src/lib/ads/engine'
import {
  blendKeywords,
  CATEGORY_KEYWORDS,
  contextualKeywords,
  MAX_KEYWORDS,
  topInterests,
} from '../src/lib/ads/keywords'

// ---------------------------------------------------------------------------
// Fixtures — pure, mocked site-config (no Payload/Redis anywhere in the core)
// ---------------------------------------------------------------------------

/**
 * Mirrors the seeded site-config (scripts/seed/baseline.mjs, arch §3 + v2.2:
 * owner decision — an ad block between max 3 news, all regions).
 */
function seededConfig(overrides: Partial<AdEngineConfig> = {}): AdEngineConfig {
  return {
    adUnitIds: [],
    amazonPartnerTags: [{ marketplace: 'www.amazon.de', tag: 'newsr01-21' }],
    adFrequency: [
      { region: 'UK', everyNth: 3 },
      { region: 'RO', everyNth: 3 },
      { region: 'default', everyNth: 3 },
    ],
    behaviouralTargetingEnabled: true,
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

const PROFILE = { interests: { sport: 5, sanatate: 3, tehnologie: 1 } }

// ---------------------------------------------------------------------------
// Frequency by region (v2.2 adFrequency: UK 3, RO 3, default 3)
// ---------------------------------------------------------------------------

describe('buildAdPlan — everyNth by region', () => {
  it('resolves the seeded regional frequencies (v2.2: every 3rd post, all regions)', () => {
    const config = seededConfig()
    expect(buildAdPlan(input({ region: 'UK' }), config).everyNth).toBe(3)
    expect(buildAdPlan(input({ region: 'RO' }), config).everyNth).toBe(3)
    expect(buildAdPlan(input({ region: 'default' }), config).everyNth).toBe(3)
  })

  it('stays owner-tunable: a per-region admin override wins over the default row', () => {
    const config = seededConfig({
      adFrequency: [
        { region: 'RO', everyNth: 5 },
        { region: 'default', everyNth: 3 },
      ],
    })
    expect(buildAdPlan(input({ region: 'RO' }), config).everyNth).toBe(5)
    expect(buildAdPlan(input({ region: 'UK' }), config).everyNth).toBe(3)
  })

  it('falls back to the default row for an unmapped region', () => {
    expect(buildAdPlan(input({ region: 'FR' }), seededConfig()).everyNth).toBe(3)
  })

  it('matches regions case-insensitively', () => {
    expect(buildAdPlan(input({ region: 'uk' }), seededConfig()).everyNth).toBe(3)
  })

  it('uses DEFAULT_EVERY_NTH when adFrequency is empty or invalid', () => {
    expect(buildAdPlan(input(), seededConfig({ adFrequency: [] })).everyNth).toBe(DEFAULT_EVERY_NTH)
    expect(
      buildAdPlan(input(), seededConfig({ adFrequency: [{ region: 'RO', everyNth: 0 }] })).everyNth,
    ).toBe(DEFAULT_EVERY_NTH)
  })
})

describe('feedAdPositions — n, 2n, 3n, capped, never after the last row', () => {
  it('injects after rows n, 2n, 3n for a full page', () => {
    expect([...feedAdPositions(3, 10)].sort((a, b) => a - b)).toEqual([3, 6, 9])
  })

  it('caps at 3 ads per page', () => {
    expect(feedAdPositions(2, 50).size).toBe(3)
  })

  it('never places an ad after (or past) the final row', () => {
    // 10 items, everyNth 5 → position 10 would sit after the last row: dropped.
    expect([...feedAdPositions(5, 10)]).toEqual([5])
    expect(feedAdPositions(4, 4).size).toBe(0)
  })

  it('returns nothing for degenerate frequencies', () => {
    expect(feedAdPositions(0, 10).size).toBe(0)
    expect(feedAdPositions(Number.NaN, 10).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// NPA (CMP reconciliation 2026-07): personalization is governed by Google's
// certified CMP + Consent Mode v2, NOT by our own consent — buildAdPlan
// hard-sets npa=false for every consent state.
// ---------------------------------------------------------------------------

describe('buildAdPlan — npa always false (CMP owns personalization)', () => {
  it.each(['unknown', 'refused', 'accepted'] as const)(
    'consent=%s ⇒ npa=false on every slot',
    (consent) => {
      const plan = buildAdPlan(input({ consent }), seededConfig())
      expect(plan.slots).toHaveLength(5) // v2.2: feed, article, article-end, rail, leaderboard
      for (const slot of plan.slots) expect(slot.adsense?.npa).toBe(false)
    },
  )
})

describe('buildAdPlan — AdSense unit resolution', () => {
  it('emits unitId only for placements with a configured unit (review pending ⇒ none)', () => {
    const config = seededConfig({
      adUnitIds: [{ slot: 'feed', unitId: '1234567890', format: 'rectangle' }],
    })
    const plan = buildAdPlan(input(), config)
    expect(decisionFor(plan, 'feed')?.adsense?.unitId).toBe('1234567890')
    // No unit configured ⇒ unitId undefined ⇒ the slot renders reserved-empty.
    expect(decisionFor(plan, 'article-end')?.adsense?.unitId).toBeUndefined()
    expect(decisionFor(plan, 'leaderboard')?.adsense?.unitId).toBeUndefined()
  })

  it('every planned placement still gets an adsense decision with the seeded (empty) config', () => {
    const plan = buildAdPlan(input(), seededConfig())
    for (const placement of ['feed', 'article', 'article-end', 'rail', 'leaderboard'] as const) {
      const slot = decisionFor(plan, placement)
      expect(slot?.adsense).toBeDefined()
      expect(slot?.adsense?.unitId).toBeUndefined()
      expect(slot?.adsense?.format).toBeTruthy()
    }
  })

  it("plans the 'rail' placement (v2.2 desktop rail; v2.3 R1: Amazon surface)", () => {
    const plan = buildAdPlan(input(), seededConfig())
    expect(plan.slots.map((slot) => slot.placement)).toEqual([
      'feed',
      'article',
      'article-end',
      'rail',
      'leaderboard',
    ])
    // The AdSense fallback is still present (default 300×600 skyscraper) — used
    // only when no partnerTag matches the marketplace.
    expect(decisionFor(plan, 'rail')?.adsense?.format).toBe('300x600')
    // v2.3 R1: with a matching partnerTag the rail carries AMAZON (the
    // home/category page's Amazon surface — mix AdSense + Amazon per page).
    expect(decisionFor(plan, 'rail')?.network).toBe('amazon')
    expect(decisionFor(plan, 'rail')?.amazon).toBeDefined()
  })

  it('the rail falls back to AdSense when no partnerTag matches the marketplace', () => {
    // GB visitor → www.amazon.co.uk → no .co.uk tag seeded ⇒ AdSense rail.
    const gb = buildAdPlan(input({ country: 'GB', region: 'UK' }), seededConfig())
    expect(decisionFor(gb, 'rail')?.network).toBe('adsense')
    expect(decisionFor(gb, 'rail')?.amazon).toBeUndefined()
  })

  it('the rail carries Amazon even without page keywords (generic shopping fallback)', () => {
    // Homepage: no category, refused visitor ⇒ no contextual/behavioural
    // keywords, yet the rail still resolves an Amazon decision (R1).
    const plan = buildAdPlan(
      input({ categorySlug: undefined, consent: 'refused', profile: null }),
      seededConfig(),
    )
    const rail = decisionFor(plan, 'rail')
    expect(rail?.network).toBe('amazon')
    expect(rail?.amazon?.marketplace).toBe(DEFAULT_MARKETPLACE)
    expect(rail?.amazon?.partnerTag).toBe('newsr01-21')
    expect(rail?.amazon?.keywords.length).toBeGreaterThan(0)
  })

  it('a configured rail unit still resolves as the AdSense fallback (no matching tag)', () => {
    const config = seededConfig({
      amazonPartnerTags: [], // no tag anywhere ⇒ rail degrades to AdSense
      adUnitIds: [{ slot: 'rail', unitId: '5555555555', format: 'rectangle' }],
    })
    const rail = decisionFor(buildAdPlan(input(), config), 'rail')
    expect(rail?.network).toBe('adsense')
    expect(rail?.adsense?.unitId).toBe('5555555555')
    expect(rail?.adsense?.format).toBe('rectangle')
  })
})

// ---------------------------------------------------------------------------
// Keyword blending — consent on/off
// ---------------------------------------------------------------------------

describe('keywords — consent gating & blending', () => {
  it('covers all 8 canonical categories with Romanian keyword sets', () => {
    const slugs = Object.keys(CATEGORY_KEYWORDS)
    expect(slugs.sort()).toEqual(
      [
        'actualitate',
        'politica',
        'economie',
        'international',
        'sport',
        'sanatate',
        'tehnologie',
        'cultura',
      ].sort(),
    )
    for (const slug of slugs) expect(CATEGORY_KEYWORDS[slug].length).toBeGreaterThan(0)
  })

  it('no consent ⇒ contextual keywords only (never from the profile)', () => {
    const plan = buildAdPlan(input({ consent: 'refused', profile: PROFILE }), seededConfig())
    const amazon = decisionFor(plan, 'article')?.amazon
    expect(amazon?.keywords).toEqual(contextualKeywords('tehnologie'))
    // Nothing from the (illegally-passed) profile leaks into the keywords.
    for (const kw of amazon?.keywords ?? []) {
      expect(CATEGORY_KEYWORDS.sport).not.toContain(kw)
      expect(CATEGORY_KEYWORDS.sanatate).not.toContain(kw)
    }
  })

  it('consent + profile ⇒ blends top-2 interests, current category first', () => {
    const plan = buildAdPlan(
      input({ consent: 'accepted', profile: PROFILE, categorySlug: 'tehnologie' }),
      seededConfig(),
    )
    const keywords = decisionFor(plan, 'article')?.amazon?.keywords ?? []
    // Category-contextual keywords lead...
    expect(keywords.slice(0, 3)).toEqual([...CATEGORY_KEYWORDS.tehnologie])
    // ...then the top-2 interests (sport, sanatate) contribute — tehnologie
    // (rank 3) does not add a third set.
    expect(keywords.some((kw) => CATEGORY_KEYWORDS.sport.includes(kw))).toBe(true)
    expect(keywords.length).toBeLessThanOrEqual(MAX_KEYWORDS)
  })

  it('consent but behaviouralTargeting disabled ⇒ contextual only', () => {
    const plan = buildAdPlan(
      input({ consent: 'accepted', profile: PROFILE }),
      seededConfig({ behaviouralTargetingEnabled: false }),
    )
    expect(decisionFor(plan, 'article')?.amazon?.keywords).toEqual(contextualKeywords('tehnologie'))
  })

  it('topInterests ranks by weight and ignores unknown slugs', () => {
    expect(topInterests({ sport: 1, tehnologie: 9, necunoscut: 99 })).toEqual([
      'tehnologie',
      'sport',
    ])
  })

  it('blendKeywords dedups and caps at MAX_KEYWORDS', () => {
    const blended = blendKeywords({ categorySlug: 'sport', interests: { sport: 9, cultura: 5 } })
    expect(new Set(blended).size).toBe(blended.length)
    expect(blended.length).toBeLessThanOrEqual(MAX_KEYWORDS)
    expect(blended.slice(0, 3)).toEqual([...CATEGORY_KEYWORDS.sport])
  })
})

// ---------------------------------------------------------------------------
// Amazon: marketplace mapping + partnerTag/keyword/placement gating
// ---------------------------------------------------------------------------

describe('marketplaceForCountry', () => {
  it('maps GB/FR/US and defaults everything else to amazon.de', () => {
    expect(marketplaceForCountry('GB')).toBe('www.amazon.co.uk')
    expect(marketplaceForCountry('UK')).toBe('www.amazon.co.uk') // region alias
    expect(marketplaceForCountry('FR')).toBe('www.amazon.fr')
    expect(marketplaceForCountry('US')).toBe('www.amazon.com')
    expect(marketplaceForCountry('RO')).toBe(DEFAULT_MARKETPLACE)
    expect(marketplaceForCountry('XX')).toBe(DEFAULT_MARKETPLACE)
    expect(marketplaceForCountry(undefined)).toBe(DEFAULT_MARKETPLACE)
  })
})

describe('buildAdPlan — Amazon decisions', () => {
  it('emits amazon for the article slots and the rail (never in-feed/banner)', () => {
    // v2 moved the old sidebar's Amazon inventory to the end-of-article slot
    // ('article-end'); v2.3 R1 adds the desktop rail as an Amazon surface.
    // In-feed and the top banner stay AdSense-only.
    const plan = buildAdPlan(input(), seededConfig())
    expect(decisionFor(plan, 'article')?.network).toBe('amazon')
    expect(decisionFor(plan, 'article-end')?.network).toBe('amazon')
    expect(decisionFor(plan, 'rail')?.network).toBe('amazon')
    expect(decisionFor(plan, 'feed')?.network).toBe('adsense')
    expect(decisionFor(plan, 'leaderboard')?.network).toBe('adsense')
    expect(decisionFor(plan, 'feed')?.amazon).toBeUndefined()
    expect(decisionFor(plan, 'leaderboard')?.amazon).toBeUndefined()
  })

  it('requires a partnerTag matching the visitor marketplace', () => {
    // RO visitor → www.amazon.de → seeded tag matches.
    const ro = buildAdPlan(input({ country: 'RO' }), seededConfig())
    expect(decisionFor(ro, 'article-end')?.amazon).toEqual({
      keywords: contextualKeywords('tehnologie'),
      marketplace: 'www.amazon.de',
      partnerTag: 'newsr01-21',
    })
    // GB visitor → www.amazon.co.uk → no tag seeded ⇒ AdSense keeps the slot.
    const gb = buildAdPlan(input({ country: 'GB', region: 'UK' }), seededConfig())
    expect(decisionFor(gb, 'article-end')?.network).toBe('adsense')
    expect(decisionFor(gb, 'article-end')?.amazon).toBeUndefined()
    // Add a .co.uk tag ⇒ the GB visitor gets it, marketplace-matched.
    const withUkTag = seededConfig({
      amazonPartnerTags: [
        { marketplace: 'www.amazon.de', tag: 'newsr01-21' },
        { marketplace: 'www.amazon.co.uk', tag: 'newsruk-21' },
      ],
    })
    const gb2 = buildAdPlan(input({ country: 'GB', region: 'UK' }), withUkTag)
    expect(decisionFor(gb2, 'article')?.amazon?.marketplace).toBe('www.amazon.co.uk')
    expect(decisionFor(gb2, 'article')?.amazon?.partnerTag).toBe('newsruk-21')
  })

  it('falls back to the region for the marketplace when country is absent', () => {
    const plan = buildAdPlan(input({ country: undefined, region: 'UK' }), seededConfig())
    // Region UK → co.uk marketplace → no seeded tag ⇒ no amazon decision.
    expect(decisionFor(plan, 'article')?.amazon).toBeUndefined()
  })

  it('requires resolved keywords (homepage without profile ⇒ no amazon)', () => {
    const plan = buildAdPlan(input({ categorySlug: undefined }), seededConfig())
    expect(decisionFor(plan, 'article')?.network).toBe('adsense')
    expect(decisionFor(plan, 'article')?.amazon).toBeUndefined()
  })

  it('homepage WITH consent + profile still gets interest-driven amazon keywords', () => {
    const plan = buildAdPlan(
      input({ categorySlug: undefined, consent: 'accepted', profile: PROFILE }),
      seededConfig(),
    )
    const amazon = decisionFor(plan, 'article')?.amazon
    expect(amazon).toBeDefined()
    expect(amazon?.keywords.some((kw) => CATEGORY_KEYWORDS.sport.includes(kw))).toBe(true)
  })
})
