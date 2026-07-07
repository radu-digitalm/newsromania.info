/**
 * One-off config update (owner decision, iulie 2026 — v2.2): in-feed ad
 * frequency becomes „un bloc de reclamă la maximum 3 știri” for ALL regions —
 * site-config adFrequency → UK:3 / RO:3 / default:3. Idempotent (safe to
 * re-run); the value stays owner-tunable in the Payload admin afterwards.
 *
 *   npx payload run scripts/maintenance/set-ad-frequency-3.mjs
 *
 * Also deletes the ad engine's Redis config cache (newsromania:ads:config,
 * 5-min TTL) so SSR pages and /api/feed batches pick the new frequency up
 * immediately instead of after cache expiry.
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { getRedis, rkey } from '../../src/lib/redis.ts'

const payload = await getPayload({ config: configPromise })
const log = (msg) => console.log(`[set-ad-frequency-3] ${msg}`)

try {
  const current = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  const before = (current.adFrequency ?? [])
    .map((row) => `${row.region}:${row.everyNth}`)
    .join(' / ')
  log(`adFrequency before: ${before || '(empty)'}`)

  await payload.updateGlobal({
    slug: 'site-config',
    data: {
      adFrequency: [
        { region: 'UK', everyNth: 3 },
        { region: 'RO', everyNth: 3 },
        { region: 'default', everyNth: 3 },
      ],
    },
  })
  log('adFrequency after:  UK:3 / RO:3 / default:3')

  // Invalidate the engine's cached config slice (engine.ts, TTL 5 min) so the
  // change is live on the very next request.
  try {
    const deleted = await getRedis().del(rkey('ads', 'config'))
    log(`redis ads:config cache ${deleted ? 'purged' : 'was already empty'}`)
  } catch (err) {
    log(`redis purge skipped (${err.message}) — cache expires within 5 minutes anyway`)
  }

  log('done')
  process.exit(0)
} catch (err) {
  console.error('[set-ad-frequency-3] FAILED:', err)
  process.exit(1)
}
