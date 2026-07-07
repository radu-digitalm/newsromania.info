/**
 * Rename the „Externe” category to „Internațional” (owner decision, iulie
 * 2026). Category is a Payload relationship referenced BY ID, so renaming the
 * doc's slug + name does NOT touch any article/aggregated-item relationships —
 * only the taxonomy label and its permalink slug change.
 *
 * Idempotent: finds the category whose slug is 'externe' and updates it to
 * slug 'international' / name 'Internațional'. If the rename already happened
 * (no 'externe' doc, an 'international' doc exists), it is a no-op. Never
 * creates a duplicate. Logs before/after.
 *
 *   npx payload run scripts/maintenance/rename-externe-international.mjs
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'

const OLD_SLUG = 'externe'
const NEW_SLUG = 'international'
const NEW_NAME = 'Internațional'

const log = (msg) => console.log(`[rename-externe] ${msg}`)

const payload = await getPayload({ config: configPromise })

let exitCode = 0

try {
  const findBySlug = async (slug) => {
    const { docs } = await payload.find({
      collection: 'categories',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return docs[0] ?? null
  }

  const before = await findBySlug(OLD_SLUG)
  const alreadyRenamed = await findBySlug(NEW_SLUG)

  if (!before) {
    // Nothing to rename — already done, or the category never existed.
    if (alreadyRenamed) {
      log(
        `deja redenumit — categoria există ca slug='${alreadyRenamed.slug}', ` +
          `name='${alreadyRenamed.name}' (id ${alreadyRenamed.id}). Nimic de făcut.`,
      )
    } else {
      log(`nicio categorie cu slug='${OLD_SLUG}' și niciuna cu slug='${NEW_SLUG}'. Nimic de făcut.`)
    }
  } else if (alreadyRenamed && alreadyRenamed.id !== before.id) {
    // Defensive: an 'international' doc already exists AND an 'externe' doc
    // still exists — renaming would violate the unique slug index. Do not
    // create a duplicate; leave the data for a human to reconcile.
    log(
      `ATENȚIE: există deja o categorie cu slug='${NEW_SLUG}' (id ${alreadyRenamed.id}) ` +
        `pe lângă cea veche slug='${OLD_SLUG}' (id ${before.id}). ` +
        `Nu redenumesc (aș crea un duplicat). Reconciliați manual.`,
    )
    exitCode = 1
  } else {
    log(`înainte: id=${before.id}, slug='${before.slug}', name='${before.name}'`)

    const after = await payload.update({
      collection: 'categories',
      id: before.id,
      data: { slug: NEW_SLUG, name: NEW_NAME },
      depth: 0,
      overrideAccess: true,
    })

    log(`după:    id=${after.id}, slug='${after.slug}', name='${after.name}'`)
    log('gata — relațiile articolelor/aggregated-items rămân neatinse (referință prin id).')
  }
} finally {
  await payload.destroy()
}

process.exit(exitCode)
