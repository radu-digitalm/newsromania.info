/**
 * House-catalog category bias (owner fix round — products chosen "based on
 * cookies + content").
 *
 * The house Amazon catalog tags each product with the marketplace DEPARTMENT it
 * came from ("High-Tech", "Kamera & Foto", "Health & Personal Care", …). The
 * site's own taxonomy is a fixed set of 8 slugs (src/config/site.ts). This pure
 * module maps a site-category slug → the department substrings a house product's
 * `category` may contain, so the house selector can BIAS which product a slot
 * shows toward the visitor's CDP top-interest (consent-gated, priority 1) or the
 * page/article category (priority 2).
 *
 * Deliberately permissive: only the slugs with a real product department are
 * mapped. A slug with no mapping (politics, culture, …) or a product whose
 * department matches nothing simply is not biased — every product stays
 * eligible, so variety is never reduced, only re-ordered.
 *
 * Pure (no I/O) — unit-testable and safe to import anywhere (engine + client
 * bundle both stay clean; this is server-path only in practice).
 */

/** site-category slug → lowercase department substrings to match a product `category`. */
const CATEGORY_DEPARTMENTS: Readonly<Record<string, readonly string[]>> = {
  // Tech, computing, photography, electronics across all three markets.
  tehnologie: [
    'high-tech',
    'informatique',
    'computer',
    'zubehör',
    'accessories',
    'kamera',
    'foto',
    'photo',
    'electronics',
  ],
  // Health, hygiene, personal care, drugstore, beauty.
  sanatate: ['health', 'personal care', 'hygiène', 'santé', 'drogerie', 'körperpflege', 'beauty'],
  // Business/finance leans to office & computing inventory in this catalog.
  economie: ['computer', 'informatique', 'zubehör', 'accessories'],
  // international readers skew travel/tech gadgets.
  international: ['high-tech', 'informatique', 'electronics', 'computer'],
  // actualitate / politica / sport / cultura have no dedicated product
  // department here → no bias (all products eligible, pure rotation).
}

/**
 * Does a house product's `category` match ANY department mapped to the given
 * site-category slug? Unmapped slug / product without a category ⇒ false (no
 * bias for it), which the selector treats as "everything eligible".
 */
export function productMatchesCategory(
  productCategory: string | undefined,
  siteSlug: string | null | undefined,
): boolean {
  if (!productCategory || !siteSlug) return false
  const departments = CATEGORY_DEPARTMENTS[siteSlug]
  if (!departments || departments.length === 0) return false
  const haystack = productCategory.toLowerCase()
  return departments.some((needle) => haystack.includes(needle))
}

/** True when the slug has a department mapping (so biasing by it is meaningful). */
export function hasCategoryBias(siteSlug: string | null | undefined): boolean {
  return typeof siteSlug === 'string' && (CATEGORY_DEPARTMENTS[siteSlug]?.length ?? 0) > 0
}
