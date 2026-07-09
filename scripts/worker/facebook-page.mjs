/**
 * newsromania-facebook — hourly automated Facebook PAGE post via the Graph API
 * (owner decision 2026-07; see scripts/worker/lib/facebook-graph.mjs). Picks the
 * impact-of-the-hour story NOT yet posted, publishes it as a PHOTO to the page,
 * then adds the article link as the FIRST comment. GROUPS are separate
 * (manual/browser — the Graph API can't post to groups since Apr 2024).
 *
 * DORMANT until FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN are set (exit 0, no-op) — so it
 * ships live but does nothing until the owner adds the token. `--dry-run` logs
 * the intended post WITHOUT calling the Graph API (safe to run anytime).
 *
 *   npx payload run scripts/worker/facebook-page.mjs
 *   npx payload run scripts/worker/facebook-page.mjs -- --dry-run
 */
import { getPayload } from 'payload'

import configPromise from '../../src/payload.config.ts'
import { getRedis, rkey } from '../../src/lib/redis.ts'
import { addComment, buildPageMessage, createPhotoPost } from './lib/facebook-graph.mjs'
import { countClusters, ORIGINAL_TIER, selectImpactStory, sourceTier } from './lib/impact.mjs'
import { storyUrl } from './lib/social-plan.mjs'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://newsromania.info').replace(
  /\/+$/,
  '',
)
const OG_DEFAULT_IMAGE = `${SITE_URL}/og-default.png`
const CLUSTER_WINDOW_HOURS = 48
const FETCH_LIMIT = 400
/** Per-story dedup keys expire after 4 days (> the 48h candidate window, so a
 * story that ages out can't be re-selected anyway — the TTL just tidies up). */
const POSTED_TTL_SEC = 4 * 24 * 3600

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run') || /^(1|true)$/i.test(process.env.FB_DRY_RUN ?? '')

const errMsg = (e) => (e instanceof Error ? e.message : String(e))
const postedKey = (refId) => rkey('fbpage', 'posted', refId)

/** Impact candidates over the 48h cluster window, normalized for selectImpactStory. */
async function loadCandidates(payload, now) {
  const sinceIso = new Date(now.getTime() - CLUSTER_WINDOW_HOURS * 3600_000).toISOString()
  const [articles, aggregated] = await Promise.all([
    payload.find({
      collection: 'articles',
      where: {
        and: [
          { _status: { equals: 'published' } },
          { publishedAt: { greater_than_equal: sinceIso } },
        ],
      },
      sort: '-publishedAt',
      limit: FETCH_LIMIT,
      depth: 0,
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
      limit: FETCH_LIMIT,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const clusterCounts = countClusters(aggregated.docs.map((d) => ({ clusterKey: d.clusterKey })))
  const candidates = []

  for (const doc of articles.docs) {
    if (!doc.slug || !doc.title) continue
    candidates.push({
      contentType: 'original',
      refId: `original:${doc.id}`,
      title: doc.title,
      link: storyUrl(SITE_URL, doc.slug),
      publishedAt: doc.publishedAt,
      clusterKey: null,
      clusterSize: 1,
      tier: ORIGINAL_TIER,
      hasImage: true,
      imageHint: null,
    })
  }

  for (const doc of aggregated.docs) {
    if (!doc.slug || !doc.title) continue
    const key =
      typeof doc.clusterKey === 'string' && doc.clusterKey.trim() ? doc.clusterKey.trim() : ''
    const hasImage = typeof doc.imageUrl === 'string' && /^https?:\/\//i.test(doc.imageUrl)
    candidates.push({
      contentType: 'aggregated',
      refId: `aggregated:${doc.id}`,
      title: doc.title,
      link: storyUrl(SITE_URL, doc.slug),
      publishedAt: doc.publishedAt,
      clusterKey: key || null,
      clusterSize: key ? (clusterCounts.get(key) ?? 1) : 1,
      tier: sourceTier(doc.sourceName),
      hasImage,
      imageHint: hasImage ? doc.imageUrl.trim() : null,
    })
  }
  return candidates
}

/** The story's og:image (canonical share image), falling back to the brand card. */
async function resolvePhoto(story) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(story.link, {
      signal: controller.signal,
      headers: { 'user-agent': 'newsromania-bot/1.0 (+https://newsromania.info)' },
    })
    clearTimeout(timer)
    if (res.ok) {
      const html = await res.text()
      const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      if (m && /^https?:\/\//i.test(m[1])) return m[1]
    }
  } catch {
    /* fall through to hints below */
  }
  return story.imageHint || OG_DEFAULT_IMAGE
}

/** Best UNPOSTED impact story (skips ones already posted to the page). */
async function pickStory(redis, candidates, nowMs) {
  let pool = candidates
  while (pool.length > 0) {
    const sel = selectImpactStory(pool, { nowMs })
    if (!sel) return null
    let already = false
    try {
      already = (await redis.exists(postedKey(sel.story.refId))) === 1
    } catch {
      already = false // Redis down → don't block posting; TTL dedup is best-effort
    }
    if (!already) return sel
    pool = pool.filter((c) => c.refId !== sel.story.refId)
  }
  return null
}

async function main() {
  const pageId = (process.env.FB_PAGE_ID ?? '').trim()
  const token = (process.env.FB_PAGE_ACCESS_TOKEN ?? '').trim()
  if (!DRY_RUN && (!pageId || !token)) {
    console.log('[fb-page] FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN nesetate — dorm (nimic de postat).')
    return
  }

  const payload = await getPayload({ config: configPromise })
  const redis = getRedis()
  const now = new Date()

  const candidates = await loadCandidates(payload, now)
  const selection = await pickStory(redis, candidates, now.getTime())
  if (!selection) {
    console.log('[fb-page] niciun candidat nou de postat.')
    return
  }

  const story = selection.story
  const message = buildPageMessage(story.title)
  const imageUrl = await resolvePhoto(story)

  console.log(
    `[fb-page] ales (${selection.reason}, scor ${selection.score}): „${story.title.slice(0, 80)}”`,
  )
  console.log(`[fb-page]   foto: ${imageUrl}`)
  console.log(`[fb-page]   link (primul comentariu): ${story.link}`)

  if (DRY_RUN) {
    console.log('[fb-page] --dry-run — NU se postează. Corpul postării ar fi:')
    console.log(
      message
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n'),
    )
    return
  }

  const { postId } = await createPhotoPost({ pageId, accessToken: token, imageUrl, message })
  console.log(`[fb-page]   ✓ postare foto creată: ${postId}`)

  try {
    const commentId = await addComment({ postId, accessToken: token, message: story.link })
    console.log(`[fb-page]   ✓ link în primul comentariu: ${commentId}`)
  } catch (err) {
    console.warn(`[fb-page]   comentariul a eșuat (postarea rămâne publicată): ${errMsg(err)}`)
  }

  try {
    await redis.set(postedKey(story.refId), '1', 'EX', POSTED_TTL_SEC)
  } catch (err) {
    console.warn(`[fb-page] nu am putut marca postat: ${errMsg(err)}`)
  }
  console.log('[fb-page] gata.')
}

try {
  await main()
} catch (err) {
  console.error(`[fb-page] eroare fatală: ${errMsg(err)}`)
  process.exitCode = 1
}
await new Promise((resolve) => process.stdout.write('', resolve))
process.exit(process.exitCode ?? 0)
