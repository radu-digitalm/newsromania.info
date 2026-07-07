import { describe, expect, it, vi } from 'vitest'

/**
 * rateLimit() — the fixed-window limiter behind /api/feed (design direction
 * v2.1 §8.8): INCR + EXPIRE-on-first-hit call order, window math, and the
 * non-negotiable FAIL-OPEN on any Redis error (a limiter must never take the
 * feed down). Exercised through the injectable client — no live Redis.
 */

import { rateLimit, type RateLimitClient } from '../src/lib/redis'

function fakeClient(start = 0) {
  let counter = start
  const calls: string[] = []
  const client: RateLimitClient = {
    incr: vi.fn(async (key: string) => {
      calls.push(`incr:${key}`)
      counter += 1
      return counter
    }),
    expire: vi.fn(async (key: string, seconds: number) => {
      calls.push(`expire:${key}:${seconds}`)
      return 1
    }),
  }
  return { client, calls }
}

describe('rateLimit', () => {
  it('INCRs the key, sets the TTL only on the FIRST hit of the window', async () => {
    const { client, calls } = fakeClient()

    await expect(rateLimit('newsromania:rl:feed:1.2.3.4', 120, 60, client)).resolves.toBe(true)
    // First hit: INCR then EXPIRE with the window, in that order.
    expect(calls).toEqual([
      'incr:newsromania:rl:feed:1.2.3.4',
      'expire:newsromania:rl:feed:1.2.3.4:60',
    ])

    await expect(rateLimit('newsromania:rl:feed:1.2.3.4', 120, 60, client)).resolves.toBe(true)
    // Second hit: INCR only — the TTL is never refreshed mid-window.
    expect(client.expire).toHaveBeenCalledTimes(1)
    expect(client.incr).toHaveBeenCalledTimes(2)
  })

  it('allows exactly `limit` requests, denies from limit+1 on', async () => {
    const { client } = fakeClient()
    const results: boolean[] = []
    for (let i = 0; i < 5; i++) {
      results.push(await rateLimit('k', 3, 60, client))
    }
    expect(results).toEqual([true, true, true, false, false])
  })

  it('fails OPEN when INCR throws', async () => {
    const client: RateLimitClient = {
      incr: vi.fn(async () => {
        throw new Error('redis down')
      }),
      expire: vi.fn(async () => 1),
    }
    await expect(rateLimit('k', 1, 60, client)).resolves.toBe(true)
    expect(client.expire).not.toHaveBeenCalled()
  })

  it('fails OPEN when EXPIRE throws on the first hit', async () => {
    const client: RateLimitClient = {
      incr: vi.fn(async () => 1),
      expire: vi.fn(async () => {
        throw new Error('redis down')
      }),
    }
    await expect(rateLimit('k', 1, 60, client)).resolves.toBe(true)
  })
})
