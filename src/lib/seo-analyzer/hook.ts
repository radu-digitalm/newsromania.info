/**
 * Adevărul de pe server (architecture.md §4): hook-ul beforeChange al
 * colecției `articles` rulează analyze() la fiecare salvare, scrie
 * seo.seoScore + seo.seoReport și aplică poarta de publicare
 * (site-config → editorial.blockPublishOnRed).
 *
 * Panoul din editor (SeoPanel) e doar informativ — valorile persistate vin
 * întotdeauna de aici.
 */
import type { CollectionBeforeChangeHook } from 'payload'
import { ValidationError } from 'payload'

import type { Article } from '../../payload-types'
import { analyze } from './index'
import { buildAnalyzerInput } from './lexical'
import { DEFAULT_MIN_WORD_COUNT } from './checks/readability'

export const seoAnalyzeBeforeChange: CollectionBeforeChangeHook<Article> = async ({
  data,
  originalDoc,
  req,
}) => {
  // Autosave/patch-uri pot trimite doar câmpurile modificate — completăm
  // din documentul existent ca analiza să vadă articolul întreg.
  const title = data.title ?? originalDoc?.title ?? ''
  const slug = data.slug ?? originalDoc?.slug ?? ''
  const body = data.body ?? originalDoc?.body ?? null
  const seo = { ...(originalDoc?.seo ?? {}), ...(data.seo ?? {}) }

  let minWordCount = DEFAULT_MIN_WORD_COUNT
  let blockPublishOnRed = false
  try {
    const cfg = await req.payload.findGlobal({ slug: 'site-config', depth: 0 })
    minWordCount = cfg.editorial?.minWordCount ?? DEFAULT_MIN_WORD_COUNT
    blockPublishOnRed = Boolean(cfg.editorial?.blockPublishOnRed)
  } catch (err) {
    req.payload.logger.warn({
      err,
      msg: 'seo-analyzer: site-config indisponibil — folosesc valorile implicite',
    })
  }

  const report = analyze(
    buildAnalyzerInput({
      title,
      slug,
      metaTitle: seo.metaTitle ?? '',
      metaDescription: seo.metaDescription ?? '',
      focusKeyword: seo.focusKeyword ?? '',
      body,
      minWordCount,
    }),
  )

  data.seo = {
    ...seo,
    seoScore: report.score,
    seoReport: report as unknown as Record<string, unknown>,
  }

  // Poarta de publicare: doar la TRANZIȚIA spre „published”.
  const publishing = data._status === 'published' && originalDoc?._status !== 'published'
  if (publishing && blockPublishOnRed && report.score === 'red') {
    throw new ValidationError({
      collection: 'articles',
      errors: [
        {
          path: 'seo.focusKeyword',
          message:
            'Publicare blocată: scorul SEO este roșu, iar setarea „Blochează publicarea la scor SEO roșu” este activă. Rezolvă verificările marcate cu eșec în panoul „Analiză SEO”, apoi publică din nou.',
        },
      ],
    })
  }

  return data
}
