/**
 * /stats/* — same-origin FIRST-PARTY tracking proxy to the self-hosted Umami
 * container (PROJECT_BRIEF §7: cookieless analytics, no third-party host, no CMP
 * needed), PLUS a redirect for dashboard visits.
 *
 * ARCHITECTURE (owner fix round 2)
 * --------------------------------
 * Umami serves at its container ROOT (basePath ""). We do NOT run it under a
 * /stats subpath: the stock standalone image bakes a "/_next" publicPath into a
 * Turbopack runtime chunk at BUILD time that no boot-time shim or response-body
 * rewrite can reach, so under a subpath the dashboard SPA boots but then hangs
 * on a spinner (the login chunk 404s). The DASHBOARD therefore lives at its own
 * root on the dedicated subdomain `stats.newsromania.info`, where the baked
 * root-absolute paths are correct and the UI loads fully.
 *
 * This route keeps TRACKING first-party and same-origin so it needs no external
 * DNS and works even before the dashboard subdomain is set up:
 *   - `/stats/script.js`  → proxied to Umami root `/script.js`
 *   - `/stats/api/*`      → proxied to Umami root `/api/*` (collector: /api/send,
 *                           /api/config, /api/heartbeat)
 * The tracker is told to POST to `/stats/api/send` via `data-host-url` on the
 * <script> tag (see components/analytics/UmamiScript.tsx).
 *
 * Any OTHER `/stats/*` request is a human trying to open the dashboard on the
 * main domain — we 307-redirect them to the subdomain (root-served Umami). No
 * HTML/RSC body rewriting is needed anymore (tracking endpoints are JS/JSON, not
 * chunk-referencing HTML), so this handler never buffers a document.
 */

// Node runtime: live proxy, never prerendered/cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UMAMI_ORIGIN = process.env.UMAMI_INTERNAL_URL ?? 'http://umami:3000'
const DASHBOARD_URL = process.env.UMAMI_DASHBOARD_URL ?? 'https://stats.newsromania.info'

// Recomputed / hop-by-hop response headers we must not copy verbatim upstream.
const STRIP_RESPONSE_HEADERS = new Set(['transfer-encoding', 'connection', 'keep-alive'])
// Request headers we must not forward: `host` would leak our public host into
// Umami's router; `connection` is hop-by-hop.
const STRIP_REQUEST_HEADERS = new Set(['host', 'connection'])

/**
 * Only the tracker script + collector API are proxied first-party. Everything
 * else (the dashboard UI) is redirected to the subdomain.
 */
function isTrackingSegment(seg0: string | undefined): boolean {
  return seg0 === 'script.js' || seg0 === 'api'
}

async function proxyTracking(request: Request, path: string[]): Promise<Response> {
  const incoming = new URL(request.url)
  const target = `${UMAMI_ORIGIN}/${path.join('/')}${incoming.search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value)
  })

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    })
  } catch (error) {
    console.error('[stats-proxy] upstream fetch failed:', error)
    return new Response('Analytics indisponibil momentan.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  const outHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) outHeaders.set(key, value)
  })
  // Stream the tracker script / collector response through untouched.
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
}

type Ctx = { params: Promise<{ path?: string[] }> }

async function handle(request: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params
  if (path && path.length > 0 && isTrackingSegment(path[0])) {
    return proxyTracking(request, path)
  }
  // Human dashboard visit on the main domain → the root-served subdomain.
  const incoming = new URL(request.url)
  const suffix = path && path.length > 0 ? `/${path.join('/')}` : ''
  return Response.redirect(`${DASHBOARD_URL}${suffix}${incoming.search}`, 307)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const HEAD = handle
export const OPTIONS = handle
