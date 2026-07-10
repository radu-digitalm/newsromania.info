/**
 * One-off config (owner, iulie 2026): AdSense approved the site and started
 * serving — but only via AUTO ADS, because our reserved <ins> blocks carried a
 * data-ad-client with NO data-ad-slot (site-config adNetworks.adUnitIds was
 * empty), so they could never fill. Five DISPLAY ad units were created in the
 * AdSense UI; this wires their slot IDs into site-config.
 *
 * FORMAT NOTE — the engine's DEFAULT_FORMAT (src/lib/ads/engine-core.ts) is
 * `feed → 'fluid'` and `article → 'in-article'`, which emit native in-feed /
 * in-article markup and require NATIVE ad units. Our new units are DISPLAY
 * units, so those two rows override `format` to 'rectangle' (fixed 300×250) —
 * exactly the size AdSlot already reserves for both containers. The other three
 * keep their defaults, all Display-compatible:
 *   leaderboard → 'horizontal' (CSS-sized responsive banner)
 *   article-end → 'rectangle'  (300×250 fixed)
 *   rail        → '300x600'    (fixed skyscraper; SideRailAd reserves height)
 *
 * Idempotent; owner-tunable in /admin afterwards. Purges the ads:config cache
 * so the change is live on the next request (no rebuild needed).
 *
 *   npx payload run scripts/maintenance/set-adsense-units-2026-07.mjs
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { getRedis, rkey } from '../../src/lib/redis.ts'

const payload = await getPayload({ config: configPromise })
const log = (msg) => console.log(`[set-adsense-units] ${msg}`)

/** Display ad units created 2026-07 under pub-8098077913729716. */
const UNITS = [
  // format omitted → DEFAULT_FORMAT 'horizontal' (CSS-sized responsive banner)
  { slot: 'leaderboard', unitId: '8431994098' },
  // override 'fluid' → Display-compatible fixed 300×250
  { slot: 'feed', unitId: '7939251065', format: 'rectangle' },
  // override 'in-article' → Display-compatible fixed 300×250
  { slot: 'article', unitId: '3179667410', format: 'rectangle' },
  // format omitted → DEFAULT_FORMAT 'rectangle'
  { slot: 'article-end', unitId: '5313087727' },
  // format omitted → DEFAULT_FORMAT '300x600'
  { slot: 'rail', unitId: '3737080936' },
]

try {
  const current = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  const before = (current.adNetworks?.adUnitIds ?? [])
    .map((row) => `${row.slot}→${row.unitId}`)
    .join(' / ')
  log(`adUnitIds before: ${before || '(empty)'}`)

  await payload.updateGlobal({
    slug: 'site-config',
    data: {
      // Preserve every other adNetworks field (publisher id, amazon tags).
      adNetworks: { ...current.adNetworks, adUnitIds: UNITS },
    },
  })
  log(
    `adUnitIds after:  ${UNITS.map((u) => `${u.slot}→${u.unitId}${u.format ? `(${u.format})` : ''}`).join(' / ')}`,
  )

  try {
    const deleted = await getRedis().del(rkey('ads', 'config'))
    log(`redis ads:config cache ${deleted ? 'purged' : 'was already empty'}`)
  } catch (err) {
    log(`redis purge skipped (${err.message}) — cache expires within 5 minutes anyway`)
  }

  log('done')
  process.exit(0)
} catch (err) {
  console.error('[set-adsense-units] FAILED:', err)
  process.exit(1)
}
