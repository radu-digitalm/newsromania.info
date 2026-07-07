/**
 * One-off reconciliation (deploy/DEPLOY.md §1, arch §8): the prod schema was
 * created by dev-mode push, so the freshly generated baseline migration must
 * be MARKED as applied — not run — and the push marker (batch -1) removed so
 * future `payload migrate` runs are non-interactive and start at batch 2.
 *
 * Run: npx payload run <this file>
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'

const BASELINE_NAME = '20260707_002408_baseline'

const payload = await getPayload({ config: configPromise })

try {
  const existing = await payload.find({
    collection: 'payload-migrations',
    limit: 100,
    overrideAccess: true,
  })
  console.log(
    '[reconcile] rânduri existente:',
    existing.docs.map((d) => `${d.name}#${d.batch}`).join(', ') || '(niciunul)',
  )

  if (!existing.docs.some((d) => d.name === BASELINE_NAME)) {
    await payload.create({
      collection: 'payload-migrations',
      data: { name: BASELINE_NAME, batch: 1 },
      overrideAccess: true,
    })
    console.log(`[reconcile] marcat ca aplicat: ${BASELINE_NAME} (batch 1)`)
  } else {
    console.log('[reconcile] baseline deja marcat — nimic de făcut')
  }

  const devMarkers = existing.docs.filter((d) => d.batch === -1)
  for (const marker of devMarkers) {
    await payload.delete({ collection: 'payload-migrations', id: marker.id, overrideAccess: true })
    console.log(`[reconcile] șters marcajul dev push: ${marker.name} (batch -1)`)
  }

  const after = await payload.find({
    collection: 'payload-migrations',
    limit: 100,
    overrideAccess: true,
  })
  console.log('[reconcile] stare finală:', after.docs.map((d) => `${d.name}#${d.batch}`).join(', '))
} finally {
  await payload.destroy()
}
process.exit(0)
