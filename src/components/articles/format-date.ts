/**
 * Deterministic Romanian date formatting for server components.
 *
 * Uses Intl.DateTimeFormat with an explicit Europe/Bucharest time zone so the
 * output is identical on every build machine (zero hydration/SSG drift).
 *
 * Feed/card meta (design direction v2 §2.2 / v1 §4.6): items published in the
 * last 24 h get a RELATIVE label („acum 3 ore”, „acum 20 de minute”); older
 * ones the absolute „6 iul. 2026”. Every consumer renders the label inside a
 * <time dateTime={iso}> wrapper, and the feed routes are force-dynamic, so
 * the server-rendered relative label is computed per request.
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

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Romanian cardinal + noun: 1 uses the article form passed in („un minut”,
 * „o oră”); 2–19 take the bare plural („3 ore”); 20+ take „de” + plural
 * („20 de minute”). Under 24 h the counts stay ≤ 59, so the ≥20 rule is all
 * the „de” grammar we need.
 */
function roCount(n: number, one: string, many: string): string {
  if (n === 1) return one
  return n >= 20 ? `${n} de ${many}` : `${n} ${many}`
}

/**
 * Feed/card meta label: relative under 24 h, absolute („6 iul. 2026”) beyond.
 * `now` is injectable for tests; future-dated items fall back to absolute.
 */
export function formatFeedDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const diff = now.getTime() - date.getTime()
  if (Number.isFinite(diff) && diff >= 0 && diff < DAY_MS) {
    if (diff < MINUTE_MS) return 'chiar acum'
    if (diff < HOUR_MS) return `acum ${roCount(Math.floor(diff / MINUTE_MS), 'un minut', 'minute')}`
    return `acum ${roCount(Math.floor(diff / HOUR_MS), 'o oră', 'ore')}`
  }
  return feedDateFormat.format(date)
}

export function formatArticleDate(iso: string): string {
  const date = new Date(iso)
  return `${articleDayFormat.format(date)}, ${articleTimeFormat.format(date)}`
}
