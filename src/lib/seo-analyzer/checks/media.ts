/**
 * Verificări de linkuri și imagini (PROJECT_BRIEF §20.1 — Links & media):
 * cel puțin un link intern; text alternativ pe fiecare imagine din corp.
 */
import type { SeoAnalyzerInput, SeoCheck } from '../types'

export function mediaChecks(input: SeoAnalyzerInput): SeoCheck[] {
  const checks: SeoCheck[] = []

  const internal = input.links.filter((l) => l.internal).length
  const outbound = input.links.length - internal
  checks.push({
    id: 'internal-links',
    label: 'Linkuri interne',
    status: internal >= 1 ? 'pass' : 'warn',
    detail:
      internal >= 1
        ? `Conținutul are ${internal} link(uri) interne${outbound > 0 ? ` și ${outbound} externe` : ''}.`
        : 'Adaugă cel puțin un link intern către alt articol sau o categorie de pe site.',
  })

  // `alt === ''` = explicit gol; `null`/`undefined` = media nepopulată —
  // colecția `media` cere alt obligatoriu, deci o tratăm ca având alt.
  const missingAlt = input.images.filter((img) => (img.alt ?? null) === '').length
  checks.push({
    id: 'image-alt',
    label: 'Text alternativ la imagini',
    status: input.images.length === 0 ? 'warn' : missingAlt === 0 ? 'pass' : 'fail',
    detail:
      input.images.length === 0
        ? 'Corpul articolului nu conține imagini — o imagine relevantă ajută la lizibilitate și SEO.'
        : missingAlt === 0
          ? 'Toate imaginile din conținut au text alternativ.'
          : `${missingAlt} imagine (imagini) fără text alternativ — completează câmpul „alt” în biblioteca media.`,
  })

  return checks
}
