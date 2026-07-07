/**
 * One-off config fix (owner OneLink setup, iulie 2026): the seeded Amazon
 * partner tag was wrong — `newsr01-21` is a UK (amazon.co.uk) tag, but it was
 * mapped to www.amazon.de. The owner's Amazon Associates „Link Stores”
 * (OneLink) now lists the real per-marketplace tags, so site-config
 * adNetworks.amazonPartnerTags is corrected to match each marketplace:
 *
 *   www.amazon.co.uk → newsr01-21        (primary UK StoreID / credentials account)
 *   www.amazon.de    → newsromania02-21  (RO + unmatched visitors buy on amazon.de)
 *   www.amazon.fr    → newsromaniafr-21
 *
 * The engine's marketplaceForCountry already routes GB→co.uk, FR→fr, RO/else→de,
 * so the geo ad engine now pairs each marketplace with a VALID tag.
 * NOTE: this only affects config correctness + future SiteStripe links — the
 * Creators/PA-API still returns AssociateNotEligible until the account clears
 * ~10 qualifying sales in the trailing 30 days (Amazon's gate, not our code).
 * Idempotent; owner-tunable in the Payload admin afterwards.
 *
 *   npx payload run scripts/maintenance/set-amazon-tags.mjs
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { getRedis, rkey } from '../../src/lib/redis.ts'

const payload = await getPayload({ config: configPromise })
const log = (msg) => console.log(`[set-amazon-tags] ${msg}`)

// Authoritative per-country tags from the owner's OneLink „Tracking ID
// preferences" (primary store newsr01-21). Each partnerTag matches its
// marketplace, so PA-API calls attribute correctly per market; for static/
// SiteStripe links the primary newsr01-21 + OneLink also redirects globally.
const TAGS = [
  { marketplace: 'www.amazon.co.uk', tag: 'newsr01-21' },
  { marketplace: 'www.amazon.de', tag: 'newsromaniade-21' },
  { marketplace: 'www.amazon.es', tag: 'newsromaniaes-21' },
  { marketplace: 'www.amazon.fr', tag: 'newsromaniafr-21' },
  { marketplace: 'www.amazon.it', tag: 'newsromaniait-21' },
  { marketplace: 'www.amazon.com', tag: 'newsromaniaus-20' },
]

try {
  const current = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  const before = (current.adNetworks?.amazonPartnerTags ?? [])
    .map((row) => `${row.marketplace}→${row.tag}`)
    .join(' / ')
  log(`amazonPartnerTags before: ${before || '(empty)'}`)

  await payload.updateGlobal({
    slug: 'site-config',
    data: {
      // Preserve every other adNetworks field (publisher id, ad unit ids).
      adNetworks: { ...current.adNetworks, amazonPartnerTags: TAGS },
    },
  })
  log(`amazonPartnerTags after:  ${TAGS.map((t) => `${t.marketplace}→${t.tag}`).join(' / ')}`)

  try {
    const deleted = await getRedis().del(rkey('ads', 'config'))
    log(`redis ads:config cache ${deleted ? 'purged' : 'was already empty'}`)
  } catch (err) {
    log(`redis purge skipped (${err.message}) — cache expires within 5 minutes anyway`)
  }

  log('done')
  process.exit(0)
} catch (err) {
  console.error('[set-amazon-tags] FAILED:', err)
  process.exit(1)
}
