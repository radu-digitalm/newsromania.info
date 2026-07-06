/**
 * newsromania-profiles — CDP profile aggregation + retention worker
 * (architecture.md §3/§7, PROJECT_BRIEF §7/§8). Runs every 10 minutes via
 * the newsromania-profiles.timer systemd user timer.
 *
 * Run from the project root (payload run loads .env + TypeScript):
 *
 *   npx payload run scripts/worker/profiles.mjs
 *
 * Pipeline per run:
 *   1. AGGREGATION — read cdp-events since the last run (Redis watermark,
 *      hard-capped at the last 24 h), group per visitor and upsert
 *      cdp-profiles:
 *        interests   = existing × 0.9 + new counts
 *                      (page_view 1, category_read 2, article_click 3);
 *        lastRegion  = region of the visitor's latest event;
 *        lastSeenAt  = latest event ts;  visits += 1 per run with activity;
 *        consentState = 'accepted' (events only exist for consenting
 *        visitors — the API drops everything else).
 *      Per-visitor double-count guard: events with ts ≤ profile.lastSeenAt
 *      are skipped even if the watermark was lost (Redis restart).
 *   2. RETENTION — delete cdp-events older than site-config
 *      cdp.retentionDays (default 365).
 *   3. GDPR ERASURE — visitors whose LATEST consent-record choice is
 *      'withdrawn'/'refused' get their profile AND events deleted.
 *   4. Every touched/purged visitor's Redis profile cache
 *      (newsromania:profile:<vid>) is invalidated.
 */

import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { decayInterests, interestCounts, profileCacheKey } from '../../src/lib/cdp.ts'
import { getRedis, rkey } from '../../src/lib/redis.ts'

const RUN_CAP_MS = 8 * 60 * 1000 // timer fires every 10 min; stay well under
const EVENTS_PAGE_SIZE = 500
const MAX_EVENT_PAGES = 40 // safety cap: 20k events/run
const WITHDRAWN_SCAN_LIMIT = 500
const AGGREGATION_WINDOW_MS = 24 * 60 * 60 * 1000

const startedAt = Date.now()
const timeUp = () => Date.now() - startedAt >= RUN_CAP_MS

const errMsg = (err) => (err instanceof Error ? err.message : String(err))

const WATERMARK_KEY = rkey('cdp', 'profiles', 'lastRunAt')

/** Last-run watermark from Redis; degrades to null (→ 24h window). */
async function readWatermark() {
  try {
    const raw = await getRedis().get(WATERMARK_KEY)
    if (raw && !Number.isNaN(Date.parse(raw))) return raw
  } catch (err) {
    console.warn(`[profiles] watermark necitibil (folosesc fereastra 24h): ${errMsg(err)}`)
  }
  return null
}

async function writeWatermark(iso) {
  try {
    await getRedis().set(WATERMARK_KEY, iso)
  } catch (err) {
    console.warn(`[profiles] watermark nescris: ${errMsg(err)}`)
  }
}

async function invalidateProfileCache(visitorId) {
  try {
    await getRedis().del(profileCacheKey(visitorId))
  } catch {
    // best-effort — TTL-ul de 10 min al cache-ului este plasa de siguranță
  }
}

/** All events with ts > since, oldest first, paginated + hard-capped. */
async function loadEventsSince(payload, sinceIso) {
  const events = []
  let page = 1
  for (; page <= MAX_EVENT_PAGES; page += 1) {
    const res = await payload.find({
      collection: 'cdp-events',
      where: { ts: { greater_than: sinceIso } },
      sort: 'ts',
      limit: EVENTS_PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: true,
    })
    events.push(...res.docs)
    if (!res.hasNextPage || timeUp()) break
  }
  return events
}

/** Group events per visitor, keeping only ts > profile.lastSeenAt later. */
function groupByVisitor(events) {
  const byVisitor = new Map()
  for (const event of events) {
    if (!event.visitorId) continue
    const list = byVisitor.get(event.visitorId)
    if (list) list.push(event)
    else byVisitor.set(event.visitorId, [event])
  }
  return byVisitor
}

async function findProfile(payload, visitorId) {
  const res = await payload.find({
    collection: 'cdp-profiles',
    where: { visitorId: { equals: visitorId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs[0] ?? null
}

/** Upsert one visitor's profile from its new events. Returns 'updated'|'created'|'skipped'. */
async function upsertProfile(payload, visitorId, events) {
  const existing = await findProfile(payload, visitorId)

  // Double-count guard: only events NEWER than the profile's lastSeenAt
  // contribute (the watermark alone is not durable — Redis may restart).
  const lastSeen = existing?.lastSeenAt ? Date.parse(existing.lastSeenAt) : null
  const fresh =
    lastSeen === null ? events : events.filter((event) => Date.parse(event.ts) > lastSeen)
  if (fresh.length === 0) return 'skipped'

  const sorted = [...fresh].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  const latest = sorted[sorted.length - 1]
  const latestWithRegion = [...sorted].reverse().find((event) => event.region)

  const data = {
    visitorId,
    interests: decayInterests(existing?.interests, interestCounts(sorted)),
    lastRegion: latestWithRegion?.region ?? existing?.lastRegion ?? null,
    lastSeenAt: latest.ts,
    // Aproximare: +1 „vizită” per rulare (granularitate 10 min) cu activitate.
    visits: (existing?.visits ?? 0) + 1,
    consentState: 'accepted',
  }

  if (existing) {
    await payload.update({
      collection: 'cdp-profiles',
      id: existing.id,
      data,
      depth: 0,
      overrideAccess: true,
    })
  } else {
    await payload.create({ collection: 'cdp-profiles', data, depth: 0, overrideAccess: true })
  }
  await invalidateProfileCache(visitorId)
  return existing ? 'updated' : 'created'
}

/** Step 2 — delete cdp-events older than cdp.retentionDays. */
async function enforceRetention(payload, retentionDays) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const res = await payload.delete({
    collection: 'cdp-events',
    where: { ts: { less_than: cutoff } },
    depth: 0,
    overrideAccess: true,
  })
  if (res.errors?.length) {
    console.warn(`[profiles] retenție: ${res.errors.length} erori la ștergere`)
  }
  return res.docs?.length ?? 0
}

/**
 * Step 3 — GDPR erasure. consent-records written on withdraw/refuse carry the
 * visitorId being given up (see /api/consent); a visitor whose LATEST record
 * is not 'accepted' loses profile + events + cache entry.
 */
async function purgeWithdrawnVisitors(payload) {
  const res = await payload.find({
    collection: 'consent-records',
    where: {
      and: [{ choice: { in: ['withdrawn', 'refused'] } }, { visitorId: { exists: true } }],
    },
    sort: '-ts',
    limit: WITHDRAWN_SCAN_LIMIT,
    depth: 0,
    overrideAccess: true,
  })

  const candidates = new Set(
    res.docs.map((doc) => doc.visitorId).filter((vid) => typeof vid === 'string' && vid !== ''),
  )

  let purged = 0
  for (const visitorId of candidates) {
    if (timeUp()) break
    // Alegerea CEA MAI RECENTĂ decide: un „accepted” ulterior anulează retragerea.
    const latest = await payload.find({
      collection: 'consent-records',
      where: { visitorId: { equals: visitorId } },
      sort: '-ts',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (latest.docs[0]?.choice === 'accepted') continue

    const hadProfile = await payload.delete({
      collection: 'cdp-profiles',
      where: { visitorId: { equals: visitorId } },
      depth: 0,
      overrideAccess: true,
    })
    const hadEvents = await payload.delete({
      collection: 'cdp-events',
      where: { visitorId: { equals: visitorId } },
      depth: 0,
      overrideAccess: true,
    })
    await invalidateProfileCache(visitorId)
    if ((hadProfile.docs?.length ?? 0) > 0 || (hadEvents.docs?.length ?? 0) > 0) {
      purged += 1
      console.log(`[profiles] șters (retragere consimțământ): vizitator ${visitorId.slice(0, 8)}…`)
    }
  }
  return purged
}

async function main() {
  const payload = await getPayload({ config: configPromise })
  const runStartIso = new Date().toISOString()

  const siteConfig = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  const retentionDays = siteConfig?.cdp?.retentionDays ?? 365

  // --- 1. aggregation -------------------------------------------------------
  const windowFloor = new Date(Date.now() - AGGREGATION_WINDOW_MS).toISOString()
  const watermark = await readWatermark()
  const since = watermark && watermark > windowFloor ? watermark : windowFloor

  const events = await loadEventsSince(payload, since)
  const byVisitor = groupByVisitor(events)
  console.log(
    `[profiles] ${events.length} evenimente noi de la ${since} (${byVisitor.size} vizitatori)`,
  )

  const totals = { created: 0, updated: 0, skipped: 0, retention: 0, purged: 0 }
  for (const [visitorId, visitorEvents] of byVisitor) {
    if (timeUp()) {
      console.warn('[profiles] limită de timp atinsă — vizitatorii rămași la rularea următoare')
      break
    }
    try {
      totals[await upsertProfile(payload, visitorId, visitorEvents)] += 1
    } catch (err) {
      console.warn(`[profiles] profil eșuat (${visitorId.slice(0, 8)}…): ${errMsg(err)}`)
    }
  }
  await writeWatermark(runStartIso)

  // --- 2. retention ----------------------------------------------------------
  if (!timeUp()) {
    try {
      totals.retention = await enforceRetention(payload, retentionDays)
    } catch (err) {
      console.warn(`[profiles] pasul de retenție a eșuat: ${errMsg(err)}`)
    }
  }

  // --- 3. GDPR erasure --------------------------------------------------------
  if (!timeUp()) {
    try {
      totals.purged = await purgeWithdrawnVisitors(payload)
    } catch (err) {
      console.warn(`[profiles] pasul de ștergere GDPR a eșuat: ${errMsg(err)}`)
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[profiles] gata în ${seconds}s — profile create: ${totals.created}, ` +
      `actualizate: ${totals.updated}, fără noutăți: ${totals.skipped}, ` +
      `evenimente expirate șterse: ${totals.retention}, vizitatori purjați (GDPR): ${totals.purged}`,
  )
}

// Top-level await: `payload run` importă modulul și iese imediat ce importul
// se încheie — fără await, rularea s-ar termina înainte de orice procesare.
try {
  await main()
} catch (err) {
  console.error(`[profiles] eroare fatală: ${errMsg(err)}`)
  process.exitCode = 1
}
// Ieșire ordonată: golește stdout, apoi închide procesul chiar dacă pool-ul
// DB/Redis ține event-loop-ul viu.
await new Promise((resolve) => process.stdout.write('', resolve))
process.exit(process.exitCode ?? 0)
