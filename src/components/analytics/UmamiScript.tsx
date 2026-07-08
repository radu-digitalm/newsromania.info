import Script from 'next/script'

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
 * internal `umami` compose service. Nothing here talks to a third-party host,
 * so the strict CSP and first-party model hold and no external DNS is needed.
 *
 * `data-website-id` comes from NEXT_PUBLIC_UMAMI_WEBSITE_ID — BLANK until the
 * owner creates the site in the Umami admin and copies the id into .env
 * (docs/operations.md §11). With no id we render nothing (no broken request),
 * so the site works before Umami is configured.
 */
export function UmamiScript() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  if (!websiteId) {
    return null
  }
  return (
    <Script
      src="/stats/script.js"
      data-website-id={websiteId}
      // afterInteractive is enough for analytics; keeps it off the critical path.
      strategy="afterInteractive"
    />
  )
}
