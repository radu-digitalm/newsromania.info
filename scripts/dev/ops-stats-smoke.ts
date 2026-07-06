/**
 * ONE-OFF dev smoke test for src/lib/ops-stats.ts (PROJECT_BRIEF §17).
 * Run: npx payload run scripts/dev/ops-stats-smoke.ts
 *
 * Rulează buildOpsStats() prin Local API pe baza de date reală (fără HTTP,
 * fără port) și afișează agregatul — verifică formă + interogări. Nu intră
 * în CI: testele unitare (tests/ops-stats.test.ts) rămân complet mock-uite.
 */
import { buildOpsStats } from '../../src/lib/ops-stats'
import { getPayloadClient } from '../../src/lib/payload'

const payload = await getPayloadClient()
const stats = await buildOpsStats(payload)

// Doar numere agregate — nicio informație sensibilă.
console.log(JSON.stringify(stats, null, 2))
process.exit(0)
