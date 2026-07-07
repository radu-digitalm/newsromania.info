/**
 * Verificări legate de cuvântul-cheie (PROJECT_BRIEF §20.1 — Keyword/on-page).
 * Toate potrivirile sunt insensibile la diacritice și majuscule (romanian.ts).
 */
import { containsPhrase, countOccurrences, paragraphs } from '../romanian'
import type { SeoAnalyzerInput, SeoCheck } from '../types'

/** Praguri de densitate (% apariții / număr de cuvinte). */
const DENSITY_MIN = 0.5
const DENSITY_MAX = 2.5
const DENSITY_STUFFING = 3

function formatPercent(value: number): string {
  // Format românesc: virgulă zecimală.
  return `${value.toFixed(1).replace('.', ',')}%`
}

export function keywordChecks(input: SeoAnalyzerInput): SeoCheck[] {
  const keyword = input.focusKeyword.trim()
  const hasKeyword = keyword.length > 0

  const firstParagraph = paragraphs(input.bodyText)[0] ?? ''
  const inMetaTitle = hasKeyword && containsPhrase(input.metaTitle, keyword)
  const inMetaDescription = hasKeyword && containsPhrase(input.metaDescription, keyword)
  const inSlug = hasKeyword && containsPhrase(input.slug.replace(/-/g, ' '), keyword)
  const inTitle = hasKeyword && containsPhrase(input.title, keyword)
  const inFirstParagraph = hasKeyword && containsPhrase(firstParagraph, keyword)
  const inSubheadings = hasKeyword && input.headings.some((h) => containsPhrase(h, keyword))
  const bodyOccurrences = hasKeyword ? countOccurrences(input.bodyText, keyword) : 0

  const foundAnywhere =
    inMetaTitle ||
    inMetaDescription ||
    inSlug ||
    inTitle ||
    inFirstParagraph ||
    inSubheadings ||
    bodyOccurrences > 0

  const checks: SeoCheck[] = []

  // CRITIC (architecture: „keyword missing everywhere” ⇒ roșu).
  checks.push({
    id: 'keyword-presence',
    label: 'Cuvânt-cheie principal',
    ...(!hasKeyword
      ? {
          status: 'fail' as const,
          detail: 'Setează un cuvânt-cheie principal — fără el analiza on-page nu are reper.',
        }
      : !foundAnywhere
        ? {
            status: 'fail' as const,
            detail: `Cuvântul-cheie „${keyword}” nu apare nicăieri: nici în titlu, slug, meta sau conținut.`,
          }
        : {
            status: 'pass' as const,
            detail: `Cuvântul-cheie „${keyword}” este setat și folosit în conținut.`,
          }),
  })

  const missingKeywordDetail = 'Setează mai întâi cuvântul-cheie principal.'

  checks.push({
    id: 'keyword-in-meta-title',
    label: 'Cuvânt-cheie în meta titlu',
    status: !hasKeyword ? 'warn' : inMetaTitle ? 'pass' : 'fail',
    detail: !hasKeyword
      ? missingKeywordDetail
      : inMetaTitle
        ? 'Meta titlul conține cuvântul-cheie.'
        : 'Adaugă cuvântul-cheie în meta titlu — ideal cât mai la început.',
  })

  checks.push({
    id: 'keyword-in-meta-description',
    label: 'Cuvânt-cheie în meta descriere',
    status: !hasKeyword ? 'warn' : inMetaDescription ? 'pass' : 'warn',
    detail: !hasKeyword
      ? missingKeywordDetail
      : inMetaDescription
        ? 'Meta descrierea conține cuvântul-cheie.'
        : 'Include cuvântul-cheie în meta descriere pentru relevanță în rezultate.',
  })

  checks.push({
    id: 'keyword-in-slug',
    label: 'Cuvânt-cheie în slug',
    status: !hasKeyword ? 'warn' : inSlug ? 'pass' : 'warn',
    detail: !hasKeyword
      ? missingKeywordDetail
      : inSlug
        ? 'Slug-ul conține cuvântul-cheie.'
        : 'Include cuvântul-cheie în slug (URL-ul articolului).',
  })

  checks.push({
    id: 'keyword-in-title',
    label: 'Cuvânt-cheie în titlu (H1)',
    status: !hasKeyword ? 'warn' : inTitle ? 'pass' : 'fail',
    detail: !hasKeyword
      ? missingKeywordDetail
      : inTitle
        ? 'Titlul articolului (H1) conține cuvântul-cheie.'
        : 'Adaugă cuvântul-cheie în titlul articolului (H1).',
  })

  checks.push({
    id: 'keyword-in-first-paragraph',
    label: 'Cuvânt-cheie în primul paragraf',
    status: !hasKeyword ? 'warn' : inFirstParagraph ? 'pass' : 'warn',
    detail: !hasKeyword
      ? missingKeywordDetail
      : inFirstParagraph
        ? 'Primul paragraf conține cuvântul-cheie.'
        : 'Folosește cuvântul-cheie în primul paragraf, ca cititorul (și Google) să confirme subiectul.',
  })

  checks.push({
    id: 'keyword-in-subheadings',
    label: 'Cuvânt-cheie în subtitluri',
    status: !hasKeyword ? 'warn' : inSubheadings ? 'pass' : 'warn',
    detail: !hasKeyword
      ? missingKeywordDetail
      : input.headings.length === 0
        ? 'Articolul nu are subtitluri (H2/H3) — adaugă câteva și include cuvântul-cheie în cel puțin unul.'
        : inSubheadings
          ? 'Cel puțin un subtitlu conține cuvântul-cheie.'
          : 'Include cuvântul-cheie în cel puțin un subtitlu (H2/H3).',
  })

  // Densitate: apariții în corp / număr total de cuvinte.
  const density = input.wordCount > 0 ? (bodyOccurrences / input.wordCount) * 100 : 0
  let densityStatus: SeoCheck['status']
  let densityDetail: string
  if (!hasKeyword) {
    densityStatus = 'warn'
    densityDetail = missingKeywordDetail
  } else if (input.wordCount === 0) {
    densityStatus = 'warn'
    densityDetail = 'Conținut insuficient pentru calculul densității.'
  } else if (density > DENSITY_STUFFING) {
    densityStatus = 'fail'
    densityDetail = `Densitate ${formatPercent(density)} (${bodyOccurrences} apariții) — supra-optimizare (keyword stuffing). Redu sub ${formatPercent(DENSITY_STUFFING)}.`
  } else if (density > DENSITY_MAX) {
    densityStatus = 'warn'
    densityDetail = `Densitate ${formatPercent(density)} (${bodyOccurrences} apariții) — puțin peste intervalul recomandat ${formatPercent(DENSITY_MIN)}–${formatPercent(DENSITY_MAX)}.`
  } else if (density >= DENSITY_MIN) {
    densityStatus = 'pass'
    densityDetail = `Densitate ${formatPercent(density)} (${bodyOccurrences} apariții) — în intervalul recomandat ${formatPercent(DENSITY_MIN)}–${formatPercent(DENSITY_MAX)}.`
  } else {
    densityStatus = 'warn'
    densityDetail = `Densitate ${formatPercent(density)} (${bodyOccurrences} apariții) — sub ${formatPercent(DENSITY_MIN)}. Folosește cuvântul-cheie mai des în corp.`
  }
  checks.push({
    id: 'keyword-density',
    label: 'Densitatea cuvântului-cheie',
    status: densityStatus,
    detail: densityDetail,
  })

  return checks
}
