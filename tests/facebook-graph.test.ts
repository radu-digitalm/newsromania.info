import { afterEach, describe, expect, it } from 'vitest'

import { buildPageMessage, graphVersion } from '../scripts/worker/lib/facebook-graph.mjs'

// Pure helpers only — no Graph API calls.
describe('buildPageMessage', () => {
  it('is the trimmed headline followed by the link-in-comment pointer', () => {
    expect(buildPageMessage('  Guvernul a aprobat bugetul  ')).toBe(
      'Guvernul a aprobat bugetul\n\n👉 Link în primul comentariu.',
    )
  })

  it('never puts the article link in the body (only the pointer line)', () => {
    const out = buildPageMessage('BREAKING: ceva important')
    expect(out).not.toMatch(/https?:\/\//)
    expect(out).toContain('Link în primul comentariu')
  })

  it('is defensive against non-string / empty titles', () => {
    expect(buildPageMessage(undefined as unknown as string)).toBe(
      '\n\n👉 Link în primul comentariu.',
    )
    expect(buildPageMessage('')).toBe('\n\n👉 Link în primul comentariu.')
  })
})

describe('graphVersion', () => {
  const original = process.env.FB_GRAPH_VERSION
  afterEach(() => {
    if (original === undefined) delete process.env.FB_GRAPH_VERSION
    else process.env.FB_GRAPH_VERSION = original
  })

  it('honours a valid vNN.N override', () => {
    process.env.FB_GRAPH_VERSION = 'v22.0'
    expect(graphVersion()).toBe('v22.0')
  })

  it('falls back to the default for missing / malformed values', () => {
    delete process.env.FB_GRAPH_VERSION
    expect(graphVersion()).toMatch(/^v\d+\.\d+$/)
    process.env.FB_GRAPH_VERSION = 'garbage'
    expect(graphVersion()).toMatch(/^v\d+\.\d+$/)
  })
})
