/**
 * load-census-feeds.mjs — populate the `feeds` collection from the vetted RSS
 * census (scripts/seed/rss-census.json, 44 sources; PROJECT_BRIEF 0.1 legal
 * gate). Idempotent, keyed by feed URL.
 *
 *   npx payload run scripts/maintenance/load-census-feeds.mjs
 *
 * Per census entry, upsert a `feeds` doc keyed by `url` (= census.feedUrl):
 *   - EXISTS  → leave `active` UNTOUCHED (owner may have already enabled it
 *               after a T&C check; we never re-disable). The category mapping
 *               IS reconciled to the census: `defaultCategory` is updated when
 *               it drifts from census.category (the census is the authoritative
 *               category assignment — e.g. g4media.ro/feed → 'politica' — and
 *               every category must have feed coverage). Nothing else changes.
 *   - NEW     → create with:
 *                 name          = census.name
 *                 url           = census.feedUrl        (unique key)
 *                 homepage      = census.homepage
 *                 active        = false   ← legal gate; owner enables manually
 *                 excerptPolicy = 'link-only'
 *                 defaultCategory = categories doc whose slug === census.category
 *                 pollMinutes   = 30
 *
 * Category resolution: the census already uses our FINAL slugs (incl.
 * 'international', post rename-externe-international). We resolve the
 * relationship by slug → doc id. If a census slug has no matching category
 * doc, we LOG A WARNING and SKIP that feed (never create a category, never
 * attach a dangling rel).
 *
 * This NEVER enables a feed and NEVER downloads anything (image policy is a
 * fetch/ingest concern, not a feed-registry concern).
 *
 * Dedup note — the 5 starter feeds seeded by scripts/seed/baseline.mjs
 * (fixtures.ts `seedFeeds`: Digi24, HotNews, G4Media, Agerpres, Libertatea)
 * MAY already exist. Four of them share a URL with a census entry (Digi24
 * https://www.digi24.ro/rss, HotNews https://hotnews.ro/feed, G4Media
 * https://www.g4media.ro/feed, Libertatea https://www.libertatea.ro/feed) and
 * are therefore treated as EXISTING here (counted as `existing`, active state
 * untouched). Agerpres (https://www.agerpres.ro/rss) is NOT in the census, so
 * this script never touches it. Dedup is by `url` — the same unique key the
 * `feeds.url` index enforces — so re-running is safe and creates no duplicates.
 *
 * Read-mostly: the only writes are `payload.create` for genuinely new feeds.
 * Safe to run against prod without a backup (no updates, no deletes), but the
 * project convention is to back up before any data mutation:
 *   scripts/db-backup.sh
 */
import { getPayload } from 'payload'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import configPromise from '../../src/payload.config.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CENSUS_PATH = resolve(__dirname, '../seed/rss-census.json')

const log = (msg) => console.log(`[load-census] ${msg}`)
const warn = (msg) => console.warn(`[load-census] ATENȚIE: ${msg}`)

const payload = await getPayload({ config: configPromise })

let exitCode = 0

try {
  // --- read the vetted census ------------------------------------------------
  const raw = await readFile(CENSUS_PATH, 'utf8')
  const census = JSON.parse(raw)
  if (!Array.isArray(census)) {
    throw new Error(`rss-census.json nu este un array (am primit ${typeof census})`)
  }
  log(`census încărcat: ${census.length} surse din ${CENSUS_PATH}`)

  // --- resolve category slug → id (once) -------------------------------------
  const { docs: categoryDocs } = await payload.find({
    collection: 'categories',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const categoryIdBySlug = new Map(categoryDocs.map((c) => [c.slug, c.id]))
  log(`categorii disponibile: ${[...categoryIdBySlug.keys()].sort().join(', ')}`)

  const tally = { created: 0, existing: 0, recategorized: 0, skipped: 0 }
  // Per-category count of feeds we CREATED this run (keyed by census slug).
  const perCategoryCreated = {}

  for (const feed of census) {
    const { name, homepage, feedUrl, category } = feed

    // Defensive: a census entry missing its URL cannot be keyed — skip it.
    if (typeof feedUrl !== 'string' || !feedUrl.trim()) {
      warn(`sursă fără feedUrl (name='${name ?? '?'}') — o sar`)
      tally.skipped += 1
      continue
    }

    // Resolve the category relationship by slug. No doc → warn + skip.
    const categoryId = categoryIdBySlug.get(category)
    if (categoryId === undefined) {
      warn(
        `feed '${name}' (${feedUrl}): nicio categorie cu slug='${category}' — ` +
          `o sar (nu creez categorii, nu atașez relații suspendate).`,
      )
      tally.skipped += 1
      continue
    }

    // Upsert keyed by url. If it exists, leave it (and its active state) alone.
    const { docs: existingDocs } = await payload.find({
      collection: 'feeds',
      where: { url: { equals: feedUrl } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existingDocs.length > 0) {
      tally.existing += 1
      const existing = existingDocs[0]
      // Reconcile ONLY the category to the census (authoritative mapping);
      // `active` and everything else stay exactly as the owner left them.
      // depth:0 above returns defaultCategory as a bare id (or null).
      const currentCategoryId =
        existing.defaultCategory && typeof existing.defaultCategory === 'object'
          ? existing.defaultCategory.id
          : (existing.defaultCategory ?? null)
      if (currentCategoryId !== categoryId) {
        await payload.update({
          collection: 'feeds',
          id: existing.id,
          data: { defaultCategory: categoryId },
          depth: 0,
          overrideAccess: true,
        })
        tally.recategorized += 1
        log(
          `există deja (stare 'active' neatinsă) — categorie corectată → '${category}': ${feedUrl}`,
        )
      } else {
        log(`există deja (stare 'active' neatinsă): ${feedUrl}`)
      }
      continue
    }

    await payload.create({
      collection: 'feeds',
      data: {
        name,
        url: feedUrl,
        homepage,
        active: false, // legal gate — owner enables after T&C check
        excerptPolicy: 'link-only',
        defaultCategory: categoryId,
        pollMinutes: 30,
      },
      depth: 0,
      overrideAccess: true,
    })
    tally.created += 1
    perCategoryCreated[category] = (perCategoryCreated[category] ?? 0) + 1
    log(`creat (inactiv, link-only, categorie='${category}'): ${name} — ${feedUrl}`)
  }

  // --- summary ---------------------------------------------------------------
  log(
    `gata — creat: ${tally.created}, existente: ${tally.existing} ` +
      `(recategorisite: ${tally.recategorized}), ` +
      `sărite: ${tally.skipped} (din ${census.length} surse în census)`,
  )

  const perCatEntries = Object.entries(perCategoryCreated).sort(([a], [b]) => a.localeCompare(b))
  if (perCatEntries.length === 0) {
    log('feeduri create pe categorie: (niciunul nou)')
  } else {
    log('feeduri create pe categorie:')
    for (const [slug, count] of perCatEntries) {
      log(`  ${slug}: ${count}`)
    }
  }
} catch (err) {
  warn(`eroare fatală: ${err?.message ?? err}`)
  exitCode = 1
} finally {
  await payload.destroy()
}

process.exit(exitCode)
