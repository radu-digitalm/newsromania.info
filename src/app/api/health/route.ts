import { getPayloadClient } from '@/lib/payload'
import { getRedis } from '@/lib/redis'

import packageJson from '../../../../package.json'

/**
 * GET /api/health → { ok, db, redis, version } (architecture.md §5).
 *
 * Used by the newsromania-health user timer (curl every 5 min). Carries no
 * secrets: booleans + the package.json version only. `ok` is true only when
 * BOTH Postgres (Payload count on users) and Redis (PING) answer; the route
 * itself never throws — a dead dependency yields 503 with ok:false.
 */

export const dynamic = 'force-dynamic'

async function checkDb(): Promise<boolean> {
  try {
    const payload = await getPayloadClient()
    await payload.count({ collection: 'users', where: {} })
    return true
  } catch {
    return false
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    return (await getRedis().ping()) === 'PONG'
  } catch {
    return false
  }
}

export async function GET(): Promise<Response> {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()])
  const ok = db && redis
  return Response.json({ ok, db, redis, version: packageJson.version }, { status: ok ? 200 : 503 })
}
