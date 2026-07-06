/**
 * Tipuri publice ale analizatorului SEO (architecture.md §4).
 * Modul pur TS — fără DOM, fără dependențe de Payload.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail'

export type SeoScore = 'green' | 'amber' | 'red'

export interface SeoCheck {
  id: string
  status: CheckStatus
  /** Etichetă scurtă în română. */
  label: string
  /** Explicație / recomandare în română. */
  detail: string
}

export interface SeoReport {
  score: SeoScore
  checks: SeoCheck[]
}

/**
 * Forma de intrare fixată de contract (architecture.md §4):
 * `analyze(input: { title, metaTitle, metaDescription, slug, focusKeyword,
 * bodyText, headings[], images[{alt}], links[{internal}], wordCount })`.
 *
 * `bodyText` este textul simplu al corpului: paragrafele sunt separate prin
 * linii goale (`\n\n`) — vezi extractFromLexical().
 */
export interface SeoAnalyzerInput {
  title: string
  metaTitle: string
  metaDescription: string
  slug: string
  focusKeyword: string
  bodyText: string
  headings: string[]
  /** `alt: null` = necunoscut (media gestionată de colecția `media`, unde alt e obligatoriu). */
  images: Array<{ alt?: string | null }>
  links: Array<{ internal: boolean }>
  wordCount: number
  /** Din site-config `editorial.minWordCount`; implicit 300. */
  minWordCount?: number
}
