/**
 * ONE-OFF live smoke test for src/lib/ads/amazon.ts (PROJECT_BRIEF §6.4).
 * Run: npx payload run scripts/dev/amazon-smoke.ts
 *
 * Frugal cu bugetul de apeluri (API-ul are throttling agresiv):
 *  1. calea grațioasă fără credențiale → [] fără NICIUN apel API;
 *  2. UN singur apel searchItems real (www.amazon.de + tag-ul din site-config)
 *     — verifică maparea produselor și scrierea cache-ului Redis
 *     (newsromania:amazon:* / newsromania:amazon-stale:*, TTL 24h/7z).
 * Nu intră în CI — testele unitare (tests/amazon.test.ts) rămân mock-uite.
 */
import { resetAmazonClient, searchProducts } from '../../src/lib/ads/amazon'
import { getRedis } from '../../src/lib/redis'

const input = {
  keywords: ['espressor cafea'],
  marketplace: 'www.amazon.de',
  partnerTag: 'newsr01-21',
  count: 3,
}

// --- 1) calea grațioasă: fără credențiale → [] fără apel API ---------------
const savedId = process.env.AMAZON_CREATORS_CREDENTIAL_ID
delete process.env.AMAZON_CREATORS_CREDENTIAL_ID
resetAmazonClient()
const empty = await searchProducts({ ...input, keywords: ['smoke graceful nocreds'] })
console.log('--- 1) graceful-empty (fara credentiale):', JSON.stringify(empty))
process.env.AMAZON_CREATORS_CREDENTIAL_ID = savedId
resetAmazonClient()

// --- 2) UN apel live ---------------------------------------------------------
const t0 = Date.now()
const products = await searchProducts(input)
console.log(`--- 2) apel live: ${products.length} produse in ${Date.now() - t0}ms`)
for (const p of products) {
  const img = p.image ? `${p.image.width}x${p.image.height}` : '-'
  const tagOk = p.url.includes(`tag=${input.partnerTag}`)
  console.log(`    asin=${p.asin} pret=${p.price ?? '-'} img=${img} tagOk=${tagOk}`)
  console.log(`    titlu=${p.title.slice(0, 70)}`)
}

// --- chei de cache -----------------------------------------------------------
const redis = getRedis()
const keys = await redis.keys('newsromania:amazon*')
console.log('--- chei Redis amazon:', keys.length ? keys : '(niciuna)')
await redis.quit()
process.exit(0)
