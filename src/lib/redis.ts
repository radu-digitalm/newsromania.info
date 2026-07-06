import { Redis } from 'ioredis'

/**
 * Redis access layer (architecture.md §4). Every key MUST be built via
 * rkey() so it carries the `newsromania:` prefix. Never FLUSHALL/FLUSHDB —
 * invalidation is always targeted (SCAN + DEL), see purgeFeedCache().
 */

let client: Redis | null = null

function keyPrefix(): string {
  // Tolerate a trailing colon in REDIS_KEY_PREFIX (rkey() joins with ':').
  return (process.env.REDIS_KEY_PREFIX ?? 'newsromania').replace(/:+$/, '')
}

/** Lazy ioredis singleton. Reads REDIS_URL from env; never hardcode hosts. */
export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL
    if (!url) {
      throw new Error('REDIS_URL is not set')
    }
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
    })
    // Without a listener ioredis emits unhandled 'error' events that would
    // crash the process on transient outages.
    client.on('error', (err) => {
      console.error('[redis] connection error:', err.message)
    })
  }
  return client
}

/** `rkey('feed', slug, page)` → `newsromania:feed:<slug>:<page>` */
export function rkey(...parts: Array<string | number>): string {
  return [keyPrefix(), ...parts].join(':')
}

/**
 * Read-through JSON cache. On any Redis failure it degrades to calling `fn`
 * directly — caching must never take the site down.
 */
export async function cacheJson<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis()
  try {
    const hit = await redis.get(key)
    if (hit !== null) {
      return JSON.parse(hit) as T
    }
  } catch {
    // fall through to fresh fetch
  }
  const fresh = await fn()
  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlSec)
  } catch {
    // cache write failures are non-fatal
  }
  return fresh
}

/**
 * Purge every feed cache entry (`newsromania:feed:*`) via cursor SCAN + DEL.
 * NEVER uses FLUSHALL/FLUSHDB (shared-instance rule). Returns the number of
 * keys deleted.
 */
export async function purgeFeedCache(): Promise<number> {
  const redis = getRedis()
  const match = rkey('feed', '*')
  let cursor = '0'
  let deleted = 0
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      deleted += await redis.del(...keys)
    }
  } while (cursor !== '0')
  return deleted
}
