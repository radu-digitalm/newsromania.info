/**
 * One-time helper — turn a SHORT-lived Facebook user token into a LONG-lived,
 * non-expiring PAGE access token, and print the Page ID + Page token to paste
 * into .env (FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN).
 *
 * ⚠️ RUN THIS YOURSELF (owner) — it PRINTS A SECRET. Do not paste the output in
 * chat or commit it. A Page token derived from a long-lived user token does not
 * expire (as long as you stay a page admin and don't reset your password).
 *
 * Prereqs (from developers.facebook.com):
 *   - FB_APP_ID + FB_APP_SECRET (your app's Basic Settings)
 *   - a short-lived USER token with pages_manage_posts + pages_read_engagement
 *     (Graph API Explorer → Generate Access Token, select the NewsRomania page)
 *
 * Usage:
 *   FB_APP_ID=... FB_APP_SECRET=... node scripts/facebook-longlived-token.mjs <SHORT_USER_TOKEN> [pageNameOrId]
 *
 * If [pageNameOrId] is omitted and you admin exactly one page, it's picked
 * automatically; otherwise it lists your pages so you can re-run with the id.
 */
const VERSION = process.env.FB_GRAPH_VERSION?.match(/^v\d+\.\d+$/)
  ? process.env.FB_GRAPH_VERSION
  : 'v21.0'
const GRAPH = `https://graph.facebook.com/${VERSION}`

async function getJson(url) {
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  }
  return json
}

async function main() {
  const shortToken = process.argv[2]
  const wantPage = process.argv[3]
  const appId = process.env.FB_APP_ID
  const appSecret = process.env.FB_APP_SECRET
  if (!shortToken || !appId || !appSecret) {
    console.error(
      'Usage: FB_APP_ID=... FB_APP_SECRET=... node scripts/facebook-longlived-token.mjs <SHORT_USER_TOKEN> [pageNameOrId]',
    )
    process.exit(1)
  }

  // 1) short user token -> long-lived (~60d) user token
  const longUser = await getJson(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`,
  )
  const longUserToken = longUser.access_token
  if (!longUserToken) throw new Error('nu am primit un token de utilizator long-lived')

  // 2) page tokens (derived from a long-lived user token → non-expiring)
  const accounts = await getJson(
    `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(longUserToken)}`,
  )
  const pages = accounts.data ?? []
  if (pages.length === 0) throw new Error('nicio pagină administrată de acest cont')

  let page
  if (wantPage) {
    const q = String(wantPage).toLowerCase()
    page = pages.find((p) => p.id === wantPage || p.name?.toLowerCase().includes(q))
  } else if (pages.length === 1) {
    page = pages[0]
  }

  if (!page) {
    console.error('Mai multe pagini — reia cu id-ul dorit ca al doilea argument:')
    for (const p of pages) console.error(`  ${p.id}  ${p.name}`)
    process.exit(2)
  }

  console.log('\n=== Adaugă în .env (SECRET — nu partaja / nu comite) ===')
  console.log(`FB_PAGE_ID=${page.id}`)
  console.log(`FB_PAGE_ACCESS_TOKEN=${page.access_token}`)
  console.log(`\n(pagina: ${page.name})`)
}

main().catch((err) => {
  console.error('Eroare:', err instanceof Error ? err.message : err)
  process.exit(1)
})
