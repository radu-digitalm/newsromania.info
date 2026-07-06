/**
 * Deterministic Romanian date formatting for server components.
 *
 * Uses Intl.DateTimeFormat with an explicit Europe/Bucharest time zone so the
 * output is identical on every build machine (zero hydration/SSG drift).
 * Relative labels („acum 3 ore") arrive with the live RSS pipeline (step 5) —
 * statically generated mock pages must render identically on every build.
 */

/** Feed / card style: „6 iul. 2026" */
const feedDateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Bucharest',
})

/** Article page style: „6 iulie 2026, 14:30" — date and time joined manually,
 * because ro-RO's combined format inserts „la" instead of the comma from the
 * design direction (§4.6). */
const articleDayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Bucharest',
})

const articleTimeFormat = new Intl.DateTimeFormat('ro-RO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Bucharest',
})

export function formatFeedDate(iso: string): string {
  return feedDateFormat.format(new Date(iso))
}

export function formatArticleDate(iso: string): string {
  const date = new Date(iso)
  return `${articleDayFormat.format(date)}, ${articleTimeFormat.format(date)}`
}
