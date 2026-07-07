/**
 * newsromania-social — social posting queue worker (architecture.md §7,
 * PROJECT_BRIEF §9). Runs hourly via newsromania-social.timer; the queue is
 * EXECUTED manually with Claude in Chrome (docs/social-posting-runbook.md) —
 * NO Meta/X APIs anywhere in the codebase.
 *
 * Run from the project root (payload run loads .env + TypeScript). NOTE:
 * `payload run` only forwards script args after a `--` separator:
 *
 *   npx payload run scripts/worker/social.mjs
 *   npx payload run scripts/worker/social.mjs -- --dry-run
 *   npx payload run scripts/worker/social.mjs -- --limit 1
 *   SOCIAL_DRY_RUN=1 npx payload run scripts/worker/social.mjs
 *
 * Pipeline per run:
 *   1. Candidates = PUBLISHED original articles + non-archived aggregated
 *      items from the last 24 h. Priority: originals first (newest first),
 *      then aggregated with an AI excerpt, then link-only aggregated.
 *   2. Idempotency: stories that already have a social-queue entry for every
 *      platform are skipped (key = contentType + refId + platform).
 *   3. Captions via writeCaptions() from src/lib/llm.ts — ONE call per story
 *      covers facebook/twitter/instagram; hard cap 15 stories per run
 *      (CAPTION_BUDGET_PER_RUN) to bound LLM spend.
 *   4. link = OUR site URL (/stiri/<slug>) for both content types — social
 *      traffic lands on newsromania.info, never directly at the publisher.
 *   5. imageUrl = featured image (originals) or the category placeholder,
 *      always absolute. Aggregated items deliberately get the placeholder:
 *      publisher RSS thumbnails are licensed for on-site display at most,
 *      re-uploading them to social accounts is extra exposure (brief §0.2).
 *   6. scheduledFor = next FREE slot from site-config
 *      socialPlatforms.postingSchedule — strictly in the future, max 1 story
 *      per slot per platform, stories spread across consecutive slots.
 *   7. status 'queued' — an editor reviews in /admin and flips to 'approved';
 *      Claude in Chrome posts and flips to 'posted' (+ postedAt).
 */

import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { siteConfig } from '../../src/config/site.ts'
import { writeCaptions } from '../../src/lib/llm.ts'
import {
  CAPTION_BUDGET_PER_RUN,
  PLATFORMS,
  createSlotAllocator,
  idempotencyKey,
  parseSchedule,
  placeholderImageUrl,
  selectStories,
  storyUrl,
} from './lib/social-plan.mjs'

const RUN_CAP_MS = 8 * 60 * 1000 // timer fires hourly; systemd cuts at 10 min
const CANDIDATE_WINDOW_HOURS = 24
const CANDIDATE_FETCH_LIMIT = 200
const REFID_LOOKUP_BATCH = 80
const OCCUPIED_LOOKUP_LIMIT = 1000

const SITE_URL = siteConfig.url.replace(/\/+$/, '')
const KNOWN_CATEGORY_SLUGS = new Set(siteConfig.categories.map((c) => c.slug))

const startedAt = Date.now()
const timeUp = () => Date.now() - startedAt >= RUN_CAP_MS

const errMsg = (err) => (err instanceof Error ? err.message : String(err))

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run') || /^(1|true)$/i.test(process.env.SOCIAL_DRY_RUN ?? '')
  let limit = CAPTION_BUDGET_PER_RUN
  const idx = argv.indexOf('--limit')
  const raw = idx !== -1 ? argv[idx + 1] : process.env.SOCIAL_LIMIT
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('--limit necesită un întreg pozitiv')
    }
    limit = Math.min(parsed, CAPTION_BUDGET_PER_RUN)
  }
  return { dryRun, limit }
}

function categorySlugOf(doc) {
  return doc.category && typeof doc.category === 'object' ? (doc.category.slug ?? null) : null
}

/** Absolute URL for a possibly-relative Payload media path. */
function absoluteUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

/** Featured image of an original (depth-1 populated), else placeholder. */
function originalImageUrl(doc, categorySlug) {
  const media = doc.featuredImage
  if (media && typeof media === 'object' && typeof media.url === 'string' && media.url.length > 0) {
    return absoluteUrl(media.url)
  }
  return placeholderImageUrl(SITE_URL, categorySlug, KNOWN_CATEGORY_SLUGS)
}

/**
 * Candidate stories from the last 24h, in posting-priority order:
 * originals (newest first) → aggregated with excerpt → link-only aggregated.
 */
async function loadCandidates(payload, sinceIso) {
  const [articles, aggregated] = await Promise.all([
    payload.find({
      collection: 'articles',
      where: {
        and: [
          { _status: { equals: 'published' } },
          // publishedAt is stamped on the draft→published transition (Articles
          // beforeChange hook) — the same publish notion the frontend feed
          // uses (src/lib/content.ts), so scheduled publishes enter the 24h
          // window when they actually go live, not when the draft was created.
          { publishedAt: { greater_than_equal: sinceIso } },
        ],
      },
      sort: '-publishedAt',
      limit: CANDIDATE_FETCH_LIMIT,
      depth: 1,
      draft: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'aggregated-items',
      where: {
        and: [
          { archived: { not_equals: true } },
          { publishedAt: { greater_than_equal: sinceIso } },
        ],
      },
      sort: '-publishedAt',
      limit: CANDIDATE_FETCH_LIMIT,
      depth: 1,
      overrideAccess: true,
    }),
  ])

  const originals = articles.docs.map((doc) => {
    const categorySlug = categorySlugOf(doc)
    return {
      contentType: 'original',
      refId: String(doc.id),
      title: doc.title,
      excerpt:
        typeof doc.excerpt === 'string' && doc.excerpt.trim() ? doc.excerpt.trim() : doc.title,
      link: storyUrl(SITE_URL, doc.slug),
      imageUrl: originalImageUrl(doc, categorySlug),
    }
  })

  const aggregatedStories = aggregated.docs
    .map((doc) => {
      const categorySlug = categorySlugOf(doc)
      const hasExcerpt = typeof doc.excerpt === 'string' && doc.excerpt.trim().length > 0
      return {
        contentType: 'aggregated',
        refId: String(doc.id),
        title: doc.title,
        excerpt: hasExcerpt ? doc.excerpt.trim() : doc.title,
        link: storyUrl(SITE_URL, doc.slug),
        // Placeholder by design — see the header comment (legal gate 0.2).
        imageUrl: placeholderImageUrl(SITE_URL, categorySlug, KNOWN_CATEGORY_SLUGS),
        hasExcerpt,
      }
    })
    // „top aggregated” (arch §7): summarized stories before link-only ones,
    // newest first inside each group (the find() above is already -publishedAt).
    .sort((a, b) => Number(b.hasExcerpt) - Number(a.hasExcerpt))

  return [...originals, ...aggregatedStories]
}

/** Which idempotency keys already exist, batched on the indexed refId. */
async function loadExistingKeys(payload, candidates) {
  const keys = new Set()
  const refIds = [...new Set(candidates.map((c) => c.refId))]
  for (let i = 0; i < refIds.length; i += REFID_LOOKUP_BATCH) {
    const chunk = refIds.slice(i, i + REFID_LOOKUP_BATCH)
    const res = await payload.find({
      collection: 'social-queue',
      where: { refId: { in: chunk } },
      // One story can have at most PLATFORMS.length entries per contentType.
      limit: chunk.length * PLATFORMS.length * 2,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of res.docs) {
      keys.add(idempotencyKey(doc.contentType, doc.refId, doc.platform))
    }
  }
  return keys
}

/**
 * Future slots already taken, per platform (queued/approved/posted entries;
 * 'skipped' ones will never be posted, so their slot is free again).
 * @returns {Map<string, Set<number>>} platform → Set of epoch-ms
 */
async function loadOccupiedSlots(payload, nowIso) {
  const res = await payload.find({
    collection: 'social-queue',
    where: {
      and: [
        { scheduledFor: { greater_than_equal: nowIso } },
        { status: { not_equals: 'skipped' } },
      ],
    },
    sort: 'scheduledFor',
    limit: OCCUPIED_LOOKUP_LIMIT,
    depth: 0,
    overrideAccess: true,
  })
  const occupied = new Map()
  for (const doc of res.docs) {
    if (!doc.platform || !doc.scheduledFor) continue
    const ms = Date.parse(doc.scheduledFor)
    if (Number.isNaN(ms)) continue
    if (!occupied.has(doc.platform)) occupied.set(doc.platform, new Set())
    occupied.get(doc.platform).add(ms)
  }
  return occupied
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2))
  const payload = await getPayload({ config: configPromise })
  const now = new Date()
  const sinceIso = new Date(now.getTime() - CANDIDATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const globalConfig = await payload.findGlobal({ slug: 'site-config', depth: 0 })
  const times = parseSchedule(globalConfig?.socialPlatforms?.postingSchedule)
  console.log(
    `[social] program de postare: ${times.map((t) => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`).join(', ')}` +
      (dryRun ? ' — RULARE DE PROBĂ (fără LLM, fără scrieri)' : ''),
  )

  const candidates = await loadCandidates(payload, sinceIso)
  const existingKeys = await loadExistingKeys(payload, candidates)
  const selected = selectStories(candidates, { existingKeys, budget: limit })
  console.log(
    `[social] candidați (24h): ${candidates.length}, de programat: ${selected.length} ` +
      `(buget rezumate: ${limit}/rulare)`,
  )

  const occupied = await loadOccupiedSlots(payload, now.toISOString())
  const allocator = createSlotAllocator({ times, now, occupied })

  const totals = { stories: 0, entries: 0, captionCalls: 0, failed: 0 }

  for (const { story, missing } of selected) {
    if (timeUp()) {
      console.warn('[social] limită de timp atinsă — poveștile rămase la rularea următoare')
      break
    }

    let captions = null
    if (dryRun) {
      captions = Object.fromEntries(PLATFORMS.map((p) => [p, `[probă] ${story.title}`]))
    } else {
      totals.captionCalls += 1
      try {
        captions = await writeCaptions({
          title: story.title,
          excerpt: story.excerpt,
          url: story.link,
          type: story.contentType,
        })
      } catch (err) {
        totals.failed += 1
        console.warn(`[social] descrieri eșuate („${story.title.slice(0, 60)}”): ${errMsg(err)}`)
        continue // reîncercat la rularea următoare (nu există încă intrări)
      }
    }

    for (const platform of missing) {
      const slot = allocator.next(platform)
      if (dryRun) {
        console.log(
          `[social]   ~ ${platform} @ ${slot.toISOString()} ← [${story.contentType}] „${story.title.slice(0, 60)}”`,
        )
        totals.entries += 1
        continue
      }
      try {
        await payload.create({
          collection: 'social-queue',
          data: {
            contentType: story.contentType,
            refId: story.refId,
            platform,
            caption: captions[platform] ?? story.title,
            imageUrl: story.imageUrl,
            link: story.link,
            scheduledFor: slot.toISOString(),
            status: 'queued',
          },
          depth: 0,
          overrideAccess: true,
        })
        totals.entries += 1
        console.log(
          `[social]   + ${platform} @ ${slot.toISOString()} ← [${story.contentType}] „${story.title.slice(0, 60)}”`,
        )
      } catch (err) {
        totals.failed += 1
        console.warn(`[social]   intrare eșuată (${platform}): ${errMsg(err)}`)
      }
    }
    totals.stories += 1
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[social] gata în ${seconds}s — povești: ${totals.stories}, intrări create: ${totals.entries}, ` +
      `apeluri LLM: ${totals.captionCalls}, eșecuri: ${totals.failed}` +
      (dryRun ? ' (probă — nimic scris)' : ''),
  )
}

// Top-level await: `payload run` importă modulul și iese imediat ce importul
// se încheie — fără await, rularea s-ar termina înainte de orice procesare.
try {
  await main()
} catch (err) {
  console.error(`[social] eroare fatală: ${errMsg(err)}`)
  process.exitCode = 1
}
// Ieșire ordonată: golește stdout (pipe-urile pierd scrierile la exit dur),
// apoi închide procesul chiar dacă pool-ul DB/Redis ține event-loop-ul viu.
await new Promise((resolve) => process.stdout.write('', resolve))
process.exit(process.exitCode ?? 0)
