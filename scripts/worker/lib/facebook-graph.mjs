/**
 * Facebook Graph API client — automated NewsRomania PAGE posting.
 *
 * OWNER DECISION 2026-07 (revises the earlier "no Meta API posting" rule): the
 * page's hourly impact post is published via the official Graph API. This is the
 * sanctioned, ban-safe path for a page you own. GROUPS are NOT handled here —
 * Meta shut down publishing to groups via the Graph API (Apr 2024), so the group
 * fan-out stays manual/browser (docs/facebook-posting-agent-prompt.md, local).
 *
 * Two calls per story (link-in-comment keeps reach high — FB throttles link
 * posts): (1) a PHOTO post on the page from the article's public image URL,
 * (2) the article link as the FIRST comment. The long-lived PAGE access token
 * comes from .env (FB_PAGE_ACCESS_TOKEN) — see docs/facebook-graph-setup.md.
 * Nothing here stores or logs the token.
 */

const GRAPH = 'https://graph.facebook.com'
const DEFAULT_VERSION = 'v21.0'
const TIMEOUT_MS = 20_000

/** Graph API version (FB_GRAPH_VERSION, e.g. "v21.0"); falls back to a default. */
export function graphVersion() {
  const v = (process.env.FB_GRAPH_VERSION ?? '').trim()
  return /^v\d+\.\d+$/.test(v) ? v : DEFAULT_VERSION
}

/**
 * The page-post body: the headline, then the pointer line. Pure — unit-tested.
 * The article link deliberately goes in the FIRST COMMENT, never here.
 * @param {string} title
 * @returns {string}
 */
export function buildPageMessage(title) {
  const t = typeof title === 'string' ? title.trim() : ''
  return `${t}\n\n👉 Link în primul comentariu.`
}

/** POST form-encoded params to a Graph edge; throws a readable error on failure. */
async function graphPost(path, params, { timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${GRAPH}/${graphVersion()}/${path}`, {
      method: 'POST',
      body: new URLSearchParams(params),
      signal: controller.signal,
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text.slice(0, 300) }
    }
    if (!res.ok || json.error) {
      const err = json.error ?? {}
      const bits = [err.message ?? `HTTP ${res.status}`]
      if (err.code) bits.push(`code ${err.code}`)
      if (err.error_subcode) bits.push(`subcode ${err.error_subcode}`)
      throw new Error(`Graph ${path}: ${bits.join(', ')}`)
    }
    return json
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Graph ${path}: timeout după ${timeoutMs / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Create a PHOTO post on the page from a PUBLIC image URL (Facebook fetches it,
 * so it must be reachable). Returns the feed post id to comment on.
 * @returns {Promise<{ postId: string, photoId: string }>}
 */
export async function createPhotoPost({ pageId, accessToken, imageUrl, message }) {
  if (!pageId || !accessToken) throw new Error('pageId + accessToken necesare')
  if (!imageUrl) throw new Error('imageUrl necesar pentru postarea foto')
  const json = await graphPost(`${encodeURIComponent(pageId)}/photos`, {
    url: imageUrl,
    message,
    published: 'true',
    access_token: accessToken,
  })
  // /photos returns { id: <photoId>, post_id: "<pageId>_<storyId>" }. Comment on
  // post_id (the feed story), not the raw photo id.
  return { postId: json.post_id ?? json.id, photoId: json.id }
}

/** Add a comment (the article link) to a post. Returns the comment id. */
export async function addComment({ postId, accessToken, message }) {
  if (!postId || !accessToken) throw new Error('postId + accessToken necesare')
  const json = await graphPost(`${encodeURIComponent(postId)}/comments`, {
    message,
    access_token: accessToken,
  })
  return json.id
}
