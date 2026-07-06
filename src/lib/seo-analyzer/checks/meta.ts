/**
 * Verificări de lungime pentru meta titlu / meta descriere
 * (PROJECT_BRIEF §20.1): treci în intervalul recomandat, avertisment în
 * benzile adiacente, eșec la extreme sau când câmpul lipsește.
 */
import type { SeoAnalyzerInput, SeoCheck } from '../types'

const TITLE = { passMin: 50, passMax: 60, warnMin: 30, warnMax: 70 }
const DESCRIPTION = { passMin: 150, passMax: 160, warnMin: 110, warnMax: 185 }

/** Lungime în caractere reale (nu unități UTF-16). */
function charLength(text: string): number {
  return [...text.trim()].length
}

function lengthStatus(
  len: number,
  bands: { passMin: number; passMax: number; warnMin: number; warnMax: number },
): SeoCheck['status'] {
  if (len >= bands.passMin && len <= bands.passMax) return 'pass'
  if (len >= bands.warnMin && len <= bands.warnMax) return 'warn'
  return 'fail'
}

export function metaChecks(input: SeoAnalyzerInput): SeoCheck[] {
  const checks: SeoCheck[] = []

  const titleLen = charLength(input.metaTitle)
  checks.push({
    id: 'meta-title-length',
    label: 'Lungimea meta titlului',
    status: titleLen === 0 ? 'fail' : lengthStatus(titleLen, TITLE),
    detail:
      titleLen === 0
        ? 'Completează meta titlul (recomandat 50–60 de caractere).'
        : titleLen < TITLE.passMin
          ? `Meta titlul are ${titleLen} caractere — prea scurt; țintește 50–60.`
          : titleLen > TITLE.passMax
            ? `Meta titlul are ${titleLen} caractere — riscă să fie trunchiat în Google; țintește 50–60.`
            : `Meta titlul are ${titleLen} caractere — în intervalul recomandat 50–60.`,
  })

  const descLen = charLength(input.metaDescription)
  checks.push({
    id: 'meta-description-length',
    label: 'Lungimea meta descrierii',
    status: descLen === 0 ? 'fail' : lengthStatus(descLen, DESCRIPTION),
    detail:
      descLen === 0
        ? 'Completează meta descrierea (recomandat 150–160 de caractere).'
        : descLen < DESCRIPTION.passMin
          ? `Meta descrierea are ${descLen} caractere — prea scurtă; țintește 150–160.`
          : descLen > DESCRIPTION.passMax
            ? `Meta descrierea are ${descLen} caractere — va fi trunchiată în Google; țintește 150–160.`
            : `Meta descrierea are ${descLen} caractere — în intervalul recomandat 150–160.`,
  })

  return checks
}
