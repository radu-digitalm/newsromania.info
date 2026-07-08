/**
 * Self-hosted Umami tracker (PROJECT_BRIEF §7) — cookieless, GDPR-friendly,
 * CONSENT-FREE.
 *
 * Umami sets NO cookies and stores NO personal data (it hashes IP+UA+day into
 * an ephemeral, non-reversible session salt that rotates daily), so under
 * GDPR/ePrivacy it needs no consent banner and is mounted unconditionally —
 * unlike the first-party CDP beacon, which stores a persistent visitor id and
 * is therefore gated on Google's CMP consent (see components/cdp/*).
 *
 * SAME-ORIGIN: the script is served from `/stats/script.js` and posts to
 * `/stats/api/send`, both proxied by the next.config `rewrites()` to the
 * internal `umami` compose service (which itself runs under BASE_PATH=/stats).
 * Nothing here talks to a third-party host, so the strict CSP and first-party
 * model hold and no external DNS is needed.
 *
 * WEBSITE ID — read at RUNTIME from the server env var `UMAMI_WEBSITE_ID`.
 * This is deliberately NOT a `NEXT_PUBLIC_*` var: those are inlined into the
 * client bundle at BUILD time, so an owner editing `.env` on the server would
 * see NO effect until the app image is rebuilt (the exact confusion the owner
 * hit). This is a server component, so `process.env.UMAMI_WEBSITE_ID` is read
 * when the layout renders — the owner can set/change the id and just RESTART
 * the app (no rebuild). The id is public anyway (it appears verbatim in the
 * page HTML as `data-website-id`), so reading it at server runtime is safe.
 *
 * With no id set we render nothing (no broken request), so the site works
 * before Umami is configured (docs/operations.md §11). INTEGRATE auto-creates
 * the "newsromania.info" website in Umami and sets UMAMI_WEBSITE_ID.
 *
 * A plain `<script defer>` (not next/script) is used so the tag is emitted
 * server-side straight into the HTML with the runtime-read id — no client
 * round-trip and no build-time inlining.
 */
export function UmamiScript() {
  const websiteId = process.env.UMAMI_WEBSITE_ID
  if (!websiteId) {
    return null
  }
  return <script defer src="/stats/script.js" data-website-id={websiteId} />
}
