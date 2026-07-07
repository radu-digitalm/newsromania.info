/**
 * Analizator SEO stil Yoast, calibrat pentru română (architecture.md §4,
 * PROJECT_BRIEF §20). Modul PUR — rulează identic pe server (hook Payload)
 * și în browser (panoul live din editor).
 *
 * Agregarea scorului (PROJECT_BRIEF §20.2 + pasul 4 din plan):
 * - eșec la o verificare CRITICĂ (cuvânt-cheie absent peste tot,
 *   număr de cuvinte sub 60% din minim) ⇒ roșu;
 * - orice alt eșec sau ≥ 3 avertismente ⇒ galben;
 * - altfel ⇒ verde.
 */
import { keywordChecks } from './checks/keyword'
import { mediaChecks } from './checks/media'
import { metaChecks } from './checks/meta'
import { readabilityChecks } from './checks/readability'
import type { SeoAnalyzerInput, SeoReport } from './types'

export type { CheckStatus, SeoAnalyzerInput, SeoCheck, SeoReport, SeoScore } from './types'
export { extractFromLexical, type LexicalExtract } from './lexical'

/** Verificările al căror eșec face scorul roșu direct. */
const CRITICAL_CHECK_IDS = new Set(['keyword-presence', 'word-count'])

const WARNS_FOR_AMBER = 3

export function analyze(input: SeoAnalyzerInput): SeoReport {
  const checks = [
    ...keywordChecks(input),
    ...metaChecks(input),
    ...readabilityChecks(input),
    ...mediaChecks(input),
  ]

  const criticalFail = checks.some((c) => c.status === 'fail' && CRITICAL_CHECK_IDS.has(c.id))
  const failCount = checks.filter((c) => c.status === 'fail').length
  const warnCount = checks.filter((c) => c.status === 'warn').length

  const score = criticalFail
    ? 'red'
    : failCount > 0 || warnCount >= WARNS_FOR_AMBER
      ? 'amber'
      : 'green'

  return { score, checks }
}
