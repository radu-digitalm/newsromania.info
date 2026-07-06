/**
 * Contextual & behavioural keyword resolution for the ad engine
 * (architecture.md §4, PROJECT_BRIEF §6.2/§6.3).
 *
 * Pure module — no I/O, no Payload, no Redis — so the engine's keyword logic
 * is unit-testable and safe to import anywhere.
 *
 * GDPR line (PROJECT_BRIEF §8): category-derived keywords are CONTEXTUAL
 * targeting (they describe the page, not the person) and are allowed without
 * consent. Profile-derived keywords are BEHAVIOURAL and are blended in ONLY
 * when the visitor explicitly accepted (engine gates this — see
 * blendKeywords() callers).
 */

/**
 * Static contextual keyword map for the 8 canonical categories
 * (src/config/site.ts) — Romanian product-search phrases fed to the Amazon
 * Creators API `searchItems` (marketplace-appropriate generic terms; there is
 * no amazon.ro, so RO visitors search these on amazon.de).
 */
export const CATEGORY_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  actualitate: ['cărți bestseller', 'espressor de cafea', 'lanternă de urgență'],
  politica: ['cărți de istorie', 'biografii politice', 'cărți de politică'],
  economie: ['cărți finanțe personale', 'accesorii de birou', 'calculator de birou'],
  externe: ['ghiduri de călătorie', 'accesorii de voiaj', 'adaptor priză universal'],
  sport: ['echipament sport', 'încălțăminte de alergare', 'accesorii fitness'],
  sanatate: ['vitamine și suplimente', 'tensiometru', 'aparat de masaj'],
  tehnologie: ['gadgeturi', 'laptop', 'telefon'],
  cultura: ['cărți de literatură', 'albume de artă', 'viniluri'],
}

/** Blended keyword lists are capped — Amazon search needs few, strong terms. */
export const MAX_KEYWORDS = 6

/** How many top profile interests contribute keywords when consented. */
export const TOP_INTERESTS = 2

/**
 * Contextual keywords for a category page/article — allowed WITHOUT consent
 * (they derive from the content, not the visitor). Unknown/missing category
 * resolves to [] (⇒ no Amazon decision for that placement).
 */
export function contextualKeywords(categorySlug?: string | null): string[] {
  if (!categorySlug) return []
  return [...(CATEGORY_KEYWORDS[categorySlug] ?? [])]
}

/**
 * Top-N interest category slugs from a CDP profile's `{slug: weight}` map,
 * highest weight first. Ties break alphabetically for determinism. Slugs
 * without a keyword set are skipped (they contribute nothing).
 */
export function topInterests(
  interests: Record<string, number> | null | undefined,
  limit: number = TOP_INTERESTS,
): string[] {
  if (!interests) return []
  return Object.entries(interests)
    .filter(([slug, weight]) => Number.isFinite(weight) && weight > 0 && slug in CATEGORY_KEYWORDS)
    .sort(([slugA, weightA], [slugB, weightB]) => weightB - weightA || slugA.localeCompare(slugB))
    .slice(0, limit)
    .map(([slug]) => slug)
}

/**
 * Behavioural blend (consent === 'accepted' ONLY — the engine enforces the
 * gate): current category's keywords FIRST, then the top-2 profile interests'
 * keyword sets, de-duplicated, capped at MAX_KEYWORDS. Without a profile this
 * degrades to contextualKeywords().
 */
export function blendKeywords({
  categorySlug,
  interests,
}: {
  categorySlug?: string | null
  interests?: Record<string, number> | null
}): string[] {
  const blended: string[] = [...contextualKeywords(categorySlug)]
  for (const slug of topInterests(interests)) {
    if (slug === categorySlug) continue // already first, don't re-append
    blended.push(...contextualKeywords(slug))
  }
  return [...new Set(blended)].slice(0, MAX_KEYWORDS)
}
