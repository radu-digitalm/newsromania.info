/**
 * Baseline seed (architecture.md §8) — idempotent, safe to re-run.
 *
 * Run from the project root with Payload's standalone-script runner
 * (handles TypeScript imports + env loading):
 *
 *   npx payload run scripts/seed/baseline.mjs
 *
 * Creates (find-first, create-if-missing — never duplicates):
 *   - the 8 canonical categories (src/config/site.ts order)
 *   - the admin user (PAYLOAD_ADMIN_EMAIL / PAYLOAD_ADMIN_PASSWORD)
 *   - the „Redacția NewsRomania” author user (random password, never printed)
 *   - site-config global defaults (arch §3)
 *   - 6 evergreen original articles (published, byline: Redacția)
 *   - the 2 freshest aggregated fixtures (fictional example.org publishers,
 *     seeded archived:true so they never surface on the public feed)
 *   - 5 starter Romanian RSS feeds — all active:false + link-only until the
 *     owner confirms each publisher's T&Cs (legal gate, PROJECT_BRIEF 0.1)
 *
 * SECRETS: this script reads process.env only and NEVER prints env values.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'

// Loaded through payload run's tsx runtime, so .ts imports work directly.
import configPromise from '../../src/payload.config.ts'
import { siteConfig } from '../../src/config/site.ts'
import { seedAggregatedItems, seedFeeds, seedOriginalArticles } from './fixtures.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '..', '..')

/**
 * Fallback .env loader for plain `node` invocations (`payload run` already
 * loads env). Fills ONLY missing keys and never logs a single value.
 */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim()
    if (!key || process.env[key] !== undefined) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadDotEnv(path.join(projectRoot, '.env'))

for (const required of ['DATABASE_URL', 'PAYLOAD_SECRET']) {
  if (!process.env[required]) {
    console.error(`[seed] Variabila de mediu lipsește: ${required}`)
    process.exit(1)
  }
}

/** string[] paragraphs → minimal valid Lexical editor state. */
function toLexical(paragraphs) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: [
          {
            type: 'text',
            text,
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
        ],
      })),
    },
  }
}

const payload = await getPayload({ config: configPromise })

const result = { created: {}, skipped: {} }
function tally(bucket, collection) {
  result[bucket][collection] = (result[bucket][collection] ?? 0) + 1
}

async function findFirst(collection, where) {
  const { docs } = await payload.find({ collection, where, limit: 1, depth: 0 })
  return docs[0]
}

try {
  // ---------------------------------------------------------------- categories
  const categoryIdBySlug = {}
  for (const { slug, name } of siteConfig.categories) {
    let doc = await findFirst('categories', { slug: { equals: slug } })
    if (doc) {
      tally('skipped', 'categories')
    } else {
      doc = await payload.create({ collection: 'categories', data: { name, slug } })
      tally('created', 'categories')
    }
    categoryIdBySlug[slug] = doc.id
  }

  // --------------------------------------------------------------------- users
  const adminEmail = process.env.PAYLOAD_ADMIN_EMAIL
  const adminPassword = process.env.PAYLOAD_ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) {
    console.error('[seed] PAYLOAD_ADMIN_EMAIL / PAYLOAD_ADMIN_PASSWORD lipsesc din mediu.')
    process.exit(1)
  }

  let adminUser = await findFirst('users', { email: { equals: adminEmail } })
  if (adminUser) {
    tally('skipped', 'users')
  } else {
    adminUser = await payload.create({
      collection: 'users',
      data: {
        name: 'Administrator',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
      },
    })
    tally('created', 'users')
  }

  const redactiaEmail = 'redactia@newsromania.info'
  let redactiaUser = await findFirst('users', { email: { equals: redactiaEmail } })
  if (redactiaUser) {
    tally('skipped', 'users')
  } else {
    redactiaUser = await payload.create({
      collection: 'users',
      data: {
        name: 'Redacția NewsRomania',
        email: redactiaEmail,
        // Random, never printed/stored elsewhere — an admin can reset it
        // from the Payload admin if this account ever needs to log in.
        password: crypto.randomBytes(24).toString('base64url'),
        role: 'author',
      },
    })
    tally('created', 'users')
  }

  // -------------------------------------------------------- site-config global
  // Sentinel: findGlobal applies field defaults even when the global was never
  // saved, so the only reliable "already seeded" marker is the row id/createdAt
  // that appears once the global exists in the DB. A re-run therefore never
  // overwrites values the owner may have tuned in the admin.
  const existingConfig = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  if (existingConfig?.id != null || existingConfig?.createdAt != null) {
    result.skipped['site-config'] = 1
  } else {
    await payload.updateGlobal({
      slug: 'site-config',
      data: {
        adNetworks: {
          adSensePublisherId:
            process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID ?? 'ca-pub-8098077913729716',
          adUnitIds: [],
          // Per-marketplace tags from the owner's Amazon Associates OneLink
          // ("Tracking ID preferences", primary store newsr01-21). Each
          // partnerTag MUST match its marketplace.
          amazonPartnerTags: [
            { marketplace: 'www.amazon.co.uk', tag: 'newsr01-21' },
            { marketplace: 'www.amazon.de', tag: 'newsromaniade-21' },
            { marketplace: 'www.amazon.es', tag: 'newsromaniaes-21' },
            { marketplace: 'www.amazon.fr', tag: 'newsromaniafr-21' },
            { marketplace: 'www.amazon.it', tag: 'newsromaniait-21' },
            { marketplace: 'www.amazon.com', tag: 'newsromaniaus-20' },
          ],
        },
        // Country → region/adSet mapping consumed by resolveGeo(); unmatched
        // countries degrade to region/adSet 'default'.
        localeRules: [
          { country: 'GB', region: 'UK', adSet: 'UK' },
          { country: 'RO', region: 'RO', adSet: 'RO' },
        ],
        // v2.2 owner decision: an ad block between max 3 news — every 3rd
        // post for ALL regions (still owner-tunable per region in admin).
        adFrequency: [
          { region: 'UK', everyNth: 3 },
          { region: 'RO', everyNth: 3 },
          { region: 'default', everyNth: 3 },
        ],
        behaviouralTargeting: { enabled: true, requiresConsent: true },
        socialPlatforms: {
          postingSchedule: [
            { time: '09:00' },
            { time: '13:00' },
            { time: '18:00' },
            { time: '21:00' },
          ],
        },
        gdpr: { consentVersion: 1, cookieRetentionDays: 180 },
        cdp: { retentionDays: 365 },
        editorial: { seoLanguage: 'ro', minWordCount: 300, blockPublishOnRed: false },
        aggregation: { itemTtlDays: 14, frontPageMaxAgeHours: 72, maxSummariesPerRun: 40 },
      },
    })
    result.created['site-config'] = 1
  }

  // ------------------------------------------------------------------ articles
  // featuredImage intentionally SKIPPED (no media import in the baseline —
  // the frontend's category placeholder fallback renders instead).
  for (const article of seedOriginalArticles) {
    const existing = await findFirst('articles', { slug: { equals: article.slug } })
    if (existing) {
      tally('skipped', 'articles')
      continue
    }
    await payload.create({
      collection: 'articles',
      data: {
        title: article.title,
        slug: article.slug,
        category: categoryIdBySlug[article.category.slug],
        author: redactiaUser.id,
        excerpt: article.excerpt,
        body: toLexical(article.body),
        _status: 'published',
        // Preserve the fixture date both as the explicit publish date (feed
        // ordering, byline, JSON-LD) and as createdAt (legacy fallback).
        publishedAt: article.publishedAt,
        createdAt: article.publishedAt,
      },
      depth: 0,
    })
    tally('created', 'articles')
  }

  // ---------------------------------------------------------- aggregated-items
  // Only the freshest TWO fixtures (fixtures.ts is sorted newest-first).
  for (const item of seedAggregatedItems.slice(0, 2)) {
    const existing = await findFirst('aggregated-items', { guid: { equals: item.sourceUrl } })
    if (existing) {
      tally('skipped', 'aggregated-items')
      continue
    }
    await payload.create({
      collection: 'aggregated-items',
      data: {
        title: item.title,
        slug: item.slug,
        guid: item.sourceUrl,
        sourceUrl: item.sourceUrl,
        sourceName: item.source.name,
        sourceHomepage: item.source.url,
        excerpt: item.excerpt,
        linkOnly: false,
        category: categoryIdBySlug[item.category.slug],
        imageUrl: '',
        imageAllowed: false,
        publishedAt: item.publishedAt,
        // Fixture publishers are FICTIONAL (example.org) by design — seed them
        // archived so demo rows never surface on a production feed. They still
        // exercise the aggregated rendering path in /admin and previews.
        archived: true,
      },
      depth: 0,
    })
    tally('created', 'aggregated-items')
  }

  // --------------------------------------------------------------------- feeds
  // Shipped DISABLED + link-only until the owner confirms each publisher's
  // excerpt/T&C policy (PROJECT_BRIEF 0.1). See scripts/seed/README.md.
  for (const feed of seedFeeds) {
    const existing = await findFirst('feeds', { url: { equals: feed.url } })
    if (existing) {
      tally('skipped', 'feeds')
      continue
    }
    await payload.create({
      collection: 'feeds',
      data: {
        name: feed.name,
        url: feed.url,
        homepage: feed.homepage,
        active: false,
        excerptPolicy: 'link-only',
        defaultCategory: categoryIdBySlug[feed.defaultCategorySlug],
        pollMinutes: 30,
      },
      depth: 0,
    })
    tally('created', 'feeds')
  }

  // ------------------------------------------------------------------- summary
  const counts = {}
  for (const collection of ['users', 'categories', 'articles', 'aggregated-items', 'feeds']) {
    const { totalDocs } = await payload.count({ collection })
    counts[collection] = totalDocs
  }

  console.log('[seed] create:', JSON.stringify(result.created))
  console.log('[seed] existente (sărite):', JSON.stringify(result.skipped))
  console.log('[seed] total documente:', JSON.stringify(counts))
  console.log('[seed] Gata — rularea repetată nu creează duplicate.')
} finally {
  await payload.destroy()
}

process.exit(0)
