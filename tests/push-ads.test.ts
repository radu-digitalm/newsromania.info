import { describe, expect, it, vi } from 'vitest'

/**
 * pushNewAdSlots() — the infinite-feed AdSense fill helper (design direction
 * v2.1 §8.10): one push({}) per inserted <ins>, mark-first idempotency via
 * the shared data-nr-ad-pushed lock, unitless slots excluded at the selector.
 * Exercised against a minimal structural fake root — no DOM environment.
 */

import {
  AD_PUSHED_ATTR,
  isAdSlotVisible,
  NEW_AD_SLOT_SELECTOR,
  pushNewAdSlots,
  type AdSlotRoot,
  type PushableIns,
} from '../src/components/ads/push-ads'

function fakeIns(attrs: Record<string, string> = {}): PushableIns & {
  attrs: Record<string, string>
} {
  const store = { ...attrs }
  return {
    attrs: store,
    getAttribute: (name: string) => store[name] ?? null,
    setAttribute: (name: string, value: string) => {
      store[name] = value
    },
  }
}

function fakeRoot(slots: PushableIns[]) {
  // The implementation ignores the selector (call args are still recorded).
  const querySelectorAll = vi.fn(() => slots)
  const root: AdSlotRoot = { querySelectorAll }
  return { root, querySelectorAll }
}

describe('pushNewAdSlots', () => {
  it('queries with the documented selector: real units only, not-yet-pushed only', () => {
    const { root, querySelectorAll } = fakeRoot([])
    pushNewAdSlots(root, {})
    expect(querySelectorAll).toHaveBeenCalledWith(NEW_AD_SLOT_SELECTOR)
    // Unitless slots (site review pending) are excluded at the selector, and
    // the shared idempotency marker is part of it too.
    expect(NEW_AD_SLOT_SELECTOR).toContain('[data-ad-slot]')
    expect(NEW_AD_SLOT_SELECTOR).toContain(`:not([${AD_PUSHED_ATTR}="1"])`)
  })

  it('marks FIRST, then pushes exactly once per new <ins>', () => {
    const a = fakeIns()
    const b = fakeIns()
    const w: { adsbygoogle?: Array<Record<string, never>> } = {}

    expect(pushNewAdSlots(fakeRoot([a, b]).root, w)).toBe(2)
    expect(a.attrs[AD_PUSHED_ATTR]).toBe('1')
    expect(b.attrs[AD_PUSHED_ATTR]).toBe('1')
    expect(w.adsbygoogle).toHaveLength(2)
  })

  it('skips slots already marked by the inline script (shared lock, §8.10)', () => {
    const pushed = fakeIns({ [AD_PUSHED_ATTR]: '1' })
    const fresh = fakeIns()
    const w: { adsbygoogle?: Array<Record<string, never>> } = { adsbygoogle: [] }

    expect(pushNewAdSlots(fakeRoot([pushed, fresh]).root, w)).toBe(1)
    expect(w.adsbygoogle).toHaveLength(1)
  })

  it('re-running never double-fires (retries and re-renders included)', () => {
    const a = fakeIns()
    const w: { adsbygoogle?: Array<Record<string, never>> } = {}
    const { root } = fakeRoot([a])

    pushNewAdSlots(root, w)
    // The real selector would drop the marked <ins>; even if a stale list is
    // returned, the belt-and-braces attribute check skips it.
    pushNewAdSlots(root, w)
    expect(w.adsbygoogle).toHaveLength(1)
  })

  it('skips HIDDEN slots without marking them (v2.2 visibility guard — lg-only rail)', () => {
    // display:none (Tailwind `hidden`): offsetParent null AND offsetWidth 0.
    const hidden = Object.assign(fakeIns(), {
      offsetParent: null as unknown,
      offsetWidth: 0,
    })
    const visible = Object.assign(fakeIns(), { offsetParent: {}, offsetWidth: 300 })
    const w: { adsbygoogle?: Array<Record<string, never>> } = {}

    expect(pushNewAdSlots(fakeRoot([hidden, visible]).root, w)).toBe(1)
    expect(w.adsbygoogle).toHaveLength(1)
    // Unmarked, so a later pass can still fill it once it becomes visible.
    expect(hidden.attrs[AD_PUSHED_ATTR]).toBeUndefined()
    expect(visible.attrs[AD_PUSHED_ATTR]).toBe('1')

    // Once visible, the same slot gets its (single) fill.
    hidden.offsetParent = {}
    hidden.offsetWidth = 300
    expect(pushNewAdSlots(fakeRoot([hidden]).root, w)).toBe(1)
    expect(hidden.attrs[AD_PUSHED_ATTR]).toBe('1')
  })

  it('isAdSlotVisible: offsetParent OR width>0 ⇒ visible; layout-less fakes count visible', () => {
    expect(isAdSlotVisible(fakeIns())).toBe(true) // node-env fake, no layout fields
    expect(isAdSlotVisible(Object.assign(fakeIns(), { offsetParent: null, offsetWidth: 0 }))).toBe(
      false,
    )
    expect(isAdSlotVisible(Object.assign(fakeIns(), { offsetParent: {}, offsetWidth: 0 }))).toBe(
      true,
    )
    // position:fixed: offsetParent is null but the element has a layout box.
    expect(
      isAdSlotVisible(Object.assign(fakeIns(), { offsetParent: null, offsetWidth: 300 })),
    ).toBe(true)
  })

  it('no-ops on a null root and swallows push() failures (marks stay set)', () => {
    expect(pushNewAdSlots(null, {})).toBe(0)

    const a = fakeIns()
    const throwing = {
      adsbygoogle: {
        push: () => {
          throw new Error('adsense blocked')
        },
      } as unknown as Array<Record<string, never>>,
    }
    expect(pushNewAdSlots(fakeRoot([a]).root, throwing)).toBe(0)
    // Marked anyway — a failed fill is never retried into a double request.
    expect(a.attrs[AD_PUSHED_ATTR]).toBe('1')
  })
})
