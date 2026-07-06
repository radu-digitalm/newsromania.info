import { buildOpsStats, type OpsStats } from '@/lib/ops-stats'
import { getPayloadClient } from '@/lib/payload'
import { cacheJson, rkey } from '@/lib/redis'

/**
 * GET /api/admin/ops-stats — statistici operaționale pentru panoul de admin
 * (PROJECT_BRIEF §17: sănătate feed-uri, conținut, cost LLM, CDP/consimțământ,
 * coadă socială, configurare reclame).
 *
 * - Autentificat prin Payload: cererea trebuie să poarte sesiunea de admin
 *   (cookie `payload-token`); fără utilizator → 403. Orice rol logat
 *   (admin/editor/author) poate citi — sunt doar agregate, fără date brute.
 * - Agregarea rulează prin Local API (src/lib/ops-stats.ts) și este pusă în
 *   cache Redis 60 s (`newsromania:admin:ops-stats`), astfel încât
 *   auto-reîmprospătarea panoului să nu bombardeze Postgres.
 */

export const dynamic = 'force-dynamic'

const CACHE_TTL_SEC = 60

export async function GET(request: Request): Promise<Response> {
  let payload
  try {
    payload = await getPayloadClient()
  } catch (error) {
    console.error('[ops-stats] payload init failed:', error)
    return Response.json(
      { error: 'Statisticile nu au putut fi calculate.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let user: unknown = null
  try {
    ;({ user } = await payload.auth({ headers: request.headers }))
  } catch {
    user = null
  }
  if (!user) {
    return Response.json(
      { error: 'Acces interzis. Autentifică-te în panoul de administrare.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const stats = await cacheJson<OpsStats>(rkey('admin', 'ops-stats'), CACHE_TTL_SEC, () =>
      buildOpsStats(payload),
    )
    return Response.json(stats, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('[ops-stats] aggregation failed:', error)
    return Response.json(
      { error: 'Statisticile nu au putut fi calculate.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
