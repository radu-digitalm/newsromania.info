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
 *   npx payload run scripts/worker/social.mjs -- --impact      (hourly FB post)
 *
 * TWO MODES (dispatched in main()):
 *   • queue (default) — the 3×/day caption queue below (facebook/twitter/
 *     instagram on the site-config posting schedule).
 *   • impact (--impact or SOCIAL_MODE=impact, PROJECT_BRIEF §9b) — pick the
 *     single most impactful story of the LAST HOUR (scripts/worker/lib/
 *     impact.mjs) and enqueue ONE Facebook post for the NewsRomania PAGE plus
 *     the (up to 5) member GROUPS from SOCIAL_FB_GROUPS. One row per target,
 *     idempotent per story-per-target-per-hour, scheduledFor = now (due),
 *     status 'queued'. The live posting is Claude in Chrome (see
 *     docs/facebook-hourly-runbook.md) — nothing is posted headlessly.
 *   The hourly timer (newsromania-social.timer) runs BOTH: impact, then queue.
 *
 * Pipeline per run (queue mode):
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
 *   5. imageUrl = the SAME image the site shows for the story, always
 *      absolute: originals use their uploaded featuredImage; aggregated items
 *      hotlink the publisher's own image URL (item.imageUrl). If a story has
 *      no real image, the card falls back to the SITE-LEVEL brand card
 *      /og-default.png (IMAGE POLICY: "Keep OG default for social cards — that
 *      is site-level, not a per-post placeholder"). We NEVER attach a branded
 *      per-CATEGORY placeholder, and every social post carries a card image
 *      (text-only posts get far less reach).
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
  fbTargets,
  hourStamp,
  idempotencyKey,
  impactRefId,
  parseFbGroups,
  parseSchedule,
  selectStories,
  storyUrl,
} from './lib/social-plan.mjs'
import { countClusters, selectImpactStory, sourceTier, ORIGINAL_TIER } from './lib/impact.mjs'

const RUN_CAP_MS = 8 * 60 * 1000 // timer fires hourly; systemd cuts at 10 min
const CANDIDATE_WINDOW_HOURS = 24
const CANDIDATE_FETCH_LIMIT = 200
const REFID_LOOKUP_BATCH = 80
const OCCUPIED_LOOKUP_LIMIT = 1000

// Impact-of-the-hour (PROJECT_BRIEF §9b): the clustering window the ingest
// worker uses (48h) bounds how many outlets can share a cluster; we count
// cross-source coverage across that same window.
const IMPACT_CLUSTER_WINDOW_HOURS = 48
const IMPACT_CLUSTER_FETCH_LIMIT = 500

const SITE_URL = siteConfig.url.replace(/\/+$/, '')

const startedAt = Date.now()
const timeUp = () => Date.now() - startedAt >= RUN_CAP_MS

const errMsg = (err) => (err instanceof Error ? err.message : String(err))

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run') || /^(1|true)$/i.test(process.env.SOCIAL_DRY_RUN ?? '')
  // Two modes share this worker: the default 3×/day caption queue, and the
  // hourly Facebook "impact of the hour" fan-out (--impact / SOCIAL_MODE=impact).
  const mode =
    argv.includes('--impact') || /^impact$/i.test(process.env.SOCIAL_MODE ?? '')
      ? 'impact'
      : 'queue'
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
  return { dryRun, limit, mode }
}

/** Absolute URL for a possibly-relative Payload media path. */
function absoluteUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

/**
 * Site-level brand card used when a story has no per-post photo — the same
 * /og-default.png the app serves as its default Open Graph image. NOT a
 * per-category placeholder; keeps every social post carrying a card image.
 */
const OG_DEFAULT_IMAGE = absoluteUrl('/og-default.png')

/**
 * Featured image of an original (depth-1 populated), else null — a story with
 * no real photo is posted WITHOUT an image (no branded placeholder fallback).
 */
function originalImageUrl(doc) {
  const media = doc.featuredImage
  if (media && typeof media === 'object' && typeof media.url === 'string' && media.url.length > 0) {
    return absoluteUrl(media.url)
  }
  return null
}

/**
 * The publisher's own image URL for an aggregated item (item.imageUrl — the
 * same hotlink the site displays), else null. Aggregated images are ALWAYS a
 * hotlink to the source; never a downloaded copy, never a placeholder.
 */
function aggregatedImageUrl(doc) {
  const raw = doc.imageUrl
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return absoluteUrl(raw.trim())
  }
  return null
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
    return {
      contentType: 'original',
      refId: String(doc.id),
      title: doc.title,
      excerpt:
        typeof doc.excerpt === 'string' && doc.excerpt.trim() ? doc.excerpt.trim() : doc.title,
      link: storyUrl(SITE_URL, doc.slug),
      imageUrl: originalImageUrl(doc) ?? OG_DEFAULT_IMAGE,
    }
  })

  const aggregatedStories = aggregated.docs
    .map((doc) => {
      const hasExcerpt = typeof doc.excerpt === 'string' && doc.excerpt.trim().length > 0
      return {
        contentType: 'aggregated',
        refId: String(doc.id),
        title: doc.title,
        excerpt: hasExcerpt ? doc.excerpt.trim() : doc.title,
        link: storyUrl(SITE_URL, doc.slug),
        // Publisher's own image (hotlink), else the site brand card — never a
        // per-category placeholder.
        imageUrl: aggregatedImageUrl(doc) ?? OG_DEFAULT_IMAGE,
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

// ---------------------------------------------------------------------------
// Impact-of-the-hour mode (PROJECT_BRIEF §9b)
// ---------------------------------------------------------------------------

/**
 * Load candidates for the impact selector: originals + aggregated items across
 * the 48h clustering window (so we can COUNT cross-source cluster sizes), each
 * normalized to the shape impact.mjs expects. The selector itself filters down
 * to the last hour; the wider window only feeds the cluster-size counts.
 */
async function loadImpactCandidates(payload, now) {
  const clusterSinceIso = new Date(
    now.getTime() - IMPACT_CLUSTER_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString()

  const [articles, aggregated] = await Promise.all([
    payload.find({
      collection: 'articles',
      where: {
        and: [
          { _status: { equals: 'published' } },
          { publishedAt: { greater_than_equal: clusterSinceIso } },
        ],
      },
      sort: '-publishedAt',
      limit: IMPACT_CLUSTER_FETCH_LIMIT,
      depth: 1,
      draft: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'aggregated-items',
      where: {
        and: [
          { archived: { not_equals: true } },
          { publishedAt: { greater_than_equal: clusterSinceIso } },
        ],
      },
      sort: '-publishedAt',
      limit: IMPACT_CLUSTER_FETCH_LIMIT,
      depth: 1,
      overrideAccess: true,
    }),
  ])

  // Cross-source cluster size is counted over aggregated items only (originals
  // are singletons — one redaction, no "many outlets" signal).
  const clusterCounts = countClusters(
    aggregated.docs.map((doc) => ({ clusterKey: doc.clusterKey })),
  )

  const candidates = []

  for (const doc of articles.docs) {
    const image = originalImageUrl(doc)
    candidates.push({
      contentType: 'original',
      refId: String(doc.id),
      title: doc.title,
      excerpt:
        typeof doc.excerpt === 'string' && doc.excerpt.trim() ? doc.excerpt.trim() : doc.title,
      link: storyUrl(SITE_URL, doc.slug),
      imageUrl: image ?? OG_DEFAULT_IMAGE,
      hasImage: image !== null,
      publishedAt: doc.publishedAt,
      clusterKey: null,
      clusterSize: 1,
      tier: ORIGINAL_TIER,
    })
  }

  for (const doc of aggregated.docs) {
    const image = aggregatedImageUrl(doc)
    const key =
      typeof doc.clusterKey === 'string' && doc.clusterKey.trim() ? doc.clusterKey.trim() : ''
    const hasExcerpt = typeof doc.excerpt === 'string' && doc.excerpt.trim().length > 0
    candidates.push({
      contentType: 'aggregated',
      refId: String(doc.id),
      title: doc.title,
      excerpt: hasExcerpt ? doc.excerpt.trim() : doc.title,
      link: storyUrl(SITE_URL, doc.slug),
      imageUrl: image ?? OG_DEFAULT_IMAGE,
      hasImage: image !== null,
      publishedAt: doc.publishedAt,
      clusterKey: key || null,
      clusterSize: key ? (clusterCounts.get(key) ?? 1) : 1,
      tier: sourceTier(doc.sourceName),
    })
  }

  return candidates
}

/** Which impact refIds already exist (this-hour idempotency), batched. */
async function loadExistingImpactRefIds(payload, refIds) {
  const present = new Set()
  const unique = [...new Set(refIds)]
  for (let i = 0; i < unique.length; i += REFID_LOOKUP_BATCH) {
    const chunk = unique.slice(i, i + REFID_LOOKUP_BATCH)
    const res = await payload.find({
      collection: 'social-queue',
      where: { refId: { in: chunk } },
      limit: chunk.length * 2,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of res.docs) present.add(doc.refId)
  }
  return present
}

async function runImpactMode({ payload, now, dryRun, globalConfig }) {
  const pageUrl = (globalConfig?.socialPlatforms?.pageUrls ?? []).find(
    (p) => p?.platform === 'facebook',
  )?.url
  const groupUrls = parseFbGroups(process.env.SOCIAL_FB_GROUPS)
  const targets = fbTargets(pageUrl, groupUrls)
  const stamp = hourStamp(now)

  if (groupUrls.length === 0) {
    console.warn(
      '[social:impact] SOCIAL_FB_GROUPS necompletat — se pune în coadă doar PAGINA; ' +
        'grupurile rămân în așteptare (owner completează cele 5 URL-uri de grup).',
    )
  } else {
    console.log(`[social:impact] ținte Facebook: pagină + ${groupUrls.length} grup(uri)`)
  }
  if (!pageUrl) {
    console.warn(
      '[social:impact] URL pagină Facebook lipsă din site-config (Rețele sociale → ' +
        'Pagini oficiale) — rândul „page” este pus în coadă, dar postarea are nevoie de URL.',
    )
  }

  const candidates = await loadImpactCandidates(payload, now)
  const pick = selectImpactStory(candidates, { nowMs: now.getTime() })
  if (!pick) {
    console.log('[social:impact] niciun candidat (nicio știre recentă) — nimic de pus în coadă.')
    return
  }
  const { story, score, reason } = pick
  console.log(
    `[social:impact] impactul orei (${reason}, scor ${score.toFixed(1)}, cluster ` +
      `${story.clusterSize}, tier ${story.tier}, imagine ${story.hasImage ? 'da' : 'nu'}): ` +
      `[${story.contentType}] „${story.title.slice(0, 70)}”`,
  )

  const refIds = targets.map((t) => impactRefId(story, stamp, t.slug))
  const existing = dryRun ? new Set() : await loadExistingImpactRefIds(payload, refIds)

  let caption = `[probă] ${story.title}\n\n${story.link}`
  if (!dryRun) {
    try {
      const captions = await writeCaptions({
        title: story.title,
        excerpt: story.excerpt,
        url: story.link,
        type: story.contentType,
      })
      caption = captions.facebook || `${story.title}\n\n${story.link}`
    } catch (err) {
      console.warn(`[social:impact] descriere eșuată: ${errMsg(err)} — se reia la ora următoare`)
      return // no rows written yet → next hour retries cleanly
    }
  }

  let created = 0
  let skipped = 0
  for (const target of targets) {
    const refId = impactRefId(story, stamp, target.slug)
    if (existing.has(refId)) {
      skipped += 1
      continue
    }
    if (dryRun) {
      console.log(
        `[social:impact]   ~ facebook/${target.slug} (${target.url ?? 'URL în așteptare'}) @ ${now.toISOString()}`,
      )
      created += 1
      continue
    }
    try {
      await payload.create({
        collection: 'social-queue',
        data: {
          contentType: story.contentType,
          refId,
          platform: 'facebook',
          caption,
          ...(story.imageUrl ? { imageUrl: story.imageUrl } : {}),
          link: story.link,
          // Posted this hour (supervised, human-paced per the runbook) — not a
          // future slot; the queue row is "due now".
          scheduledFor: now.toISOString(),
          status: 'queued',
        },
        depth: 0,
        overrideAccess: true,
      })
      created += 1
      console.log(
        `[social:impact]   + facebook/${target.slug} (${target.url ?? 'URL în așteptare'})`,
      )
    } catch (err) {
      console.warn(`[social:impact]   rând eșuat (${target.slug}): ${errMsg(err)}`)
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[social:impact] gata în ${seconds}s — rânduri create: ${created}, deja existente: ${skipped}` +
      (dryRun ? ' (probă — nimic scris)' : ''),
  )
}

async function runQueueMode({ payload, now, dryRun, limit, globalConfig }) {
  const sinceIso = new Date(now.getTime() - CANDIDATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
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
            // Omitted entirely when the story has no real image — never a
            // branded placeholder fallback (IMAGE POLICY).
            ...(story.imageUrl ? { imageUrl: story.imageUrl } : {}),
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

async function main() {
  const { dryRun, limit, mode } = parseArgs(process.argv.slice(2))
  const payload = await getPayload({ config: configPromise })
  const now = new Date()
  const globalConfig = await payload.findGlobal({ slug: 'site-config', depth: 0 })

  if (mode === 'impact') {
    console.log(
      '[social] mod: IMPACTUL OREI (Facebook: pagină + grupuri)' +
        (dryRun ? ' — RULARE DE PROBĂ (fără LLM, fără scrieri)' : ''),
    )
    await runImpactMode({ payload, now, dryRun, globalConfig })
    return
  }
  await runQueueMode({ payload, now, dryRun, limit, globalConfig })
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
