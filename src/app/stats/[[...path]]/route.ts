/**
 * /stats/* — same-origin reverse proxy to the self-hosted Umami container
 * (PROJECT_BRIEF §7: first-party, cookieless analytics; no third-party host,
 * no CMP needed).
 *
 * WHY A ROUTE HANDLER AND NOT A next.config REWRITE
 * -------------------------------------------------
 * Umami's dashboard is a Next.js **standalone** build with `basePath` baked in
 * as "" at BUILD time. The compose entrypoint shim (deploy/umami/basepath-
 * entrypoint.sh) patches `basePath`/`assetPrefix` → "/stats" in the shipped
 * `server.js`, which correctly re-prefixes the `<link>`/`<script src>` HTML
 * tags. BUT Next.js also emits its client-runtime chunk list in TWO places that
 * the assetPrefix patch does NOT reach, because those paths were frozen into
 * compiled artifacts at Umami's build time:
 *   1. the 7 async webpack runtime `<script src="/_next/static/chunks/…">` tags
 *   2. the RSC Flight payload (`self.__next_f.push([…])`) module chunk lists
 * Both come out ROOT-absolute (`/_next/…`, no `/stats` prefix). Served under
 * our `/stats` mount they hit the MAIN app at `/_next/*` and 404 — so Umami's
 * React app never boots and the owner sees a blank white page / infinite
 * spinner. A `next.config` rewrite cannot fix this: it forwards the request but
 * cannot transform the RESPONSE body.
 *
 * WHAT THIS PROXY DOES
 * --------------------
 * Forwards every `/stats/*` request (all methods, body, headers, cookies) to
 * the internal Umami service, then — for the two body types that carry the
 * poisoned refs (`text/html` for the document, `text/x-component` for the RSC
 * Flight payload) — rewrites every root-absolute `/_next/` to `/stats/_next/`
 * so the chunks resolve under our mount and the dashboard hydrates. Every other
 * content type (JS/CSS assets, `script.js`, `/api/send`, `/api/heartbeat`
 * JSON) streams through byte-for-byte untouched.
 *
 * The already-correct `/stats/_next/…` refs are left alone (the rewrite only
 * matches `/_next/` NOT already preceded by `stats`), so it is idempotent and
 * safe to re-run over a partially-prefixed document.
 *
 * PAIRED CHANGES (keep in lockstep):
 *   - deploy/umami/basepath-entrypoint.sh patches server.js basePath/assetPrefix
 *     → /stats (fixes the static HTML tags; this proxy fixes what it can't reach).
 *   - compose.yaml umami: serves under /stats; heartbeat healthcheck at
 *     /stats/api/heartbeat. This proxy targets `${UMAMI_INTERNAL_URL}/stats/…`.
 *   - next.config.ts NO LONGER rewrites /stats (this handler owns it).
 */

// Node runtime: we buffer + string-rewrite HTML/RSC bodies and stream the rest;
// force-dynamic because every request is a live proxy (never prerendered/cached).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UMAMI_ORIGIN = process.env.UMAMI_INTERNAL_URL ?? 'http://umami:3000'

// Body content types that embed Umami's root-absolute /_next chunk refs and
// therefore need the prefix rewrite. Everything else is passed through as-is.
const REWRITE_CONTENT_TYPES = ['text/html', 'text/x-component']

// Hop-by-hop / recomputed headers we must NOT copy verbatim from the upstream
// response (length changes after rewrite; encoding/connection are per-hop).
const STRIP_RESPONSE_HEADERS = new Set([
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive',
])

// Request headers we must not forward upstream: `host` would leak our public
// host into Umami's router, and we set `accept-encoding` ourselves so we never
// receive a compressed HTML/RSC body we'd have to decompress before rewriting.
const STRIP_REQUEST_HEADERS = new Set(['host', 'accept-encoding', 'connection'])

/**
 * Root-absolute `/_next/` → `/stats/_next/`, but ONLY when not already prefixed
 * (negative lookbehind on `stats`). Covers both quoted string literals in the
 * Flight payload and `src="/_next/…"` HTML attributes.
 */
function rewriteNextPaths(body: string): string {
  return body.replace(/(?<!stats)\/_next\//g, '/stats/_next/')
}

async function proxy(request: Request, path: string[] | undefined): Promise<Response> {
  const incoming = new URL(request.url)
  // Reconstruct the upstream path under Umami's /stats basePath. `path` is the
  // catch-all segments AFTER /stats (undefined for the /stats index itself).
  const suffix = path && path.length > 0 ? `/${path.join('/')}` : ''
  const target = `${UMAMI_ORIGIN}/stats${suffix}${incoming.search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value)
  })
  // Force identity so the rewrite never has to touch a gzip/br body.
  headers.set('accept-encoding', 'identity')

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual', // forward Umami's 3xx (e.g. /stats/ → 308) to the browser
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

  const contentType = upstream.headers.get('content-type') ?? ''
  const needsRewrite = REWRITE_CONTENT_TYPES.some((t) => contentType.includes(t))

  if (needsRewrite) {
    const rewritten = rewriteNextPaths(await upstream.text())
    return new Response(rewritten, { status: upstream.status, headers: outHeaders })
  }

  // Assets, script.js, /api/*, JSON, redirects: stream through untouched.
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
}

type Ctx = { params: Promise<{ path?: string[] }> }

async function handle(request: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params
  return proxy(request, path)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const HEAD = handle
export const OPTIONS = handle
