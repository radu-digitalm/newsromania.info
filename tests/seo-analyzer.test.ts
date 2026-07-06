/**
 * Teste vitest pentru analizatorul SEO românesc (PROJECT_BRIEF §20,
 * architecture.md §4). Fixture-uri în română; fără apeluri de rețea —
 * modulul e pur.
 */
import { describe, expect, it } from 'vitest'

import { analyze, type SeoAnalyzerInput, type SeoReport } from '../src/lib/seo-analyzer'
import { buildAnalyzerInput, extractFromLexical } from '../src/lib/seo-analyzer/lexical'
import {
  countOccurrences,
  hasTransitionWord,
  isPassiveSentence,
  normalizeRo,
  sentences,
  TRANSITION_WORDS,
} from '../src/lib/seo-analyzer/romanian'

// ---------------------------------------------------------------------------
// Fixture „articol bun” — 7 paragrafe × 47 de cuvinte, cuvânt cheie
// „energie verde” cu densitate ~2%, tranziții în 60% dintre propoziții,
// zero pasive, meta în intervalele recomandate.
// ---------------------------------------------------------------------------

const KEYWORD = 'energie verde'

const PARAGRAPH = [
  'Investițiile în energie verde cresc rapid în toată țara.',
  'De asemenea, companiile locale anunță proiecte noi în fiecare lună.',
  'Prin urmare, rețelele electrice au nevoie de modernizare accelerată.',
  'În plus, autoritățile pregătesc scheme de sprijin pentru gospodării.',
  'Specialiștii recomandă investiții treptate și planuri clare pentru fiecare regiune.',
].join(' ')

const GOOD_BODY = Array.from({ length: 7 }, () => PARAGRAPH).join('\n\n')

const GOOD_INPUT: SeoAnalyzerInput = {
  title: 'Energie verde: România accelerează investițiile',
  metaTitle: 'Energie verde în România: investiții și beneficii reale', // 55 caractere
  metaDescription:
    'Analizăm cum avansează proiectele de energie verde în România, ce beneficii aduc pentru consumatori și ce planuri au autoritățile pentru rețele moderne.', // 152 caractere
  slug: 'energie-verde-romania-accelereaza-investitiile',
  focusKeyword: KEYWORD,
  bodyText: GOOD_BODY,
  headings: ['Ce înseamnă energie verde pentru consumatori'],
  images: [{ alt: 'Parc fotovoltaic în România' }],
  links: [{ internal: true }, { internal: false }],
  wordCount: 335, // 7 × 47 cuvinte în corp + 6 în subtitlu
  minWordCount: 300,
}

/** Descriere de 159 de caractere FĂRĂ cuvântul cheie (pentru teste de warn). */
const DESCRIPTION_WITHOUT_KEYWORD =
  'Analizăm cum avansează proiectele importante din România, ce beneficii aduc pentru consumatori și ce planuri au autoritățile pentru rețelele electrice moderne.'

function getCheck(report: SeoReport, id: string) {
  const check = report.checks.find((c) => c.id === id)
  if (!check) throw new Error(`verificarea „${id}” lipsește din raport`)
  return check
}

function analyzeWith(overrides: Partial<SeoAnalyzerInput>): SeoReport {
  return analyze({ ...GOOD_INPUT, ...overrides })
}

// Gardă: fixture-urile chiar au lungimile presupuse de teste.
it('fixture-urile meta au lungimile din benzile țintă', () => {
  expect([...GOOD_INPUT.metaTitle].length).toBe(55)
  expect([...GOOD_INPUT.metaDescription].length).toBe(152)
  expect([...DESCRIPTION_WITHOUT_KEYWORD].length).toBe(159)
})

// ---------------------------------------------------------------------------
// Normalizare + potrivire insensibilă la diacritice
// ---------------------------------------------------------------------------

describe('potrivire insensibilă la diacritice și majuscule', () => {
  it('normalizează ă/â/î/ș/ț și majusculele', () => {
    expect(normalizeRo('Sănătate Știri Țară Înapoi Când')).toBe('sanatate stiri tara inapoi cand')
  })

  it('tratează identic virgula-jos și sedila (ș vs ş)', () => {
    expect(countOccurrences('ştiri false pe internet', 'știri')).toBe(1)
  })

  it('cuvântul cheie fără diacritice găsește textul cu diacritice', () => {
    expect(countOccurrences('Vorbim despre sănătate publică azi.', 'sanatate publica')).toBe(1)
  })

  it('respectă limitele de cuvânt (nu potrivește forme flexionate)', () => {
    // „Sănătatea” (articulat) nu e o apariție exactă a cheii „sanatate”.
    expect(countOccurrences('Sănătatea costă.', 'sanatate')).toBe(0)
  })

  it('spațiul și cratima sunt echivalente (slug-uri)', () => {
    expect(countOccurrences('energie-verde-romania', 'energie verde')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Euristici românești: tranziții + pasiv
// ---------------------------------------------------------------------------

describe('cuvinte de tranziție românești', () => {
  it('lista curată conține termenii ceruți de brief', () => {
    for (const w of [
      'totuși',
      'de asemenea',
      'prin urmare',
      'în plus',
      'pe de altă parte',
      'astfel',
      'în concluzie',
      'deoarece',
      'însă',
      'totodată',
    ]) {
      expect(TRANSITION_WORDS).toContain(w)
    }
  })

  it('detectează tranziții simple și locuțiuni', () => {
    expect(hasTransitionWord('Totuși, piața crește.')).toBe(true)
    expect(hasTransitionWord('Cu toate acestea, cererea scade.')).toBe(true)
    expect(hasTransitionWord('Într-adevăr, cifrele confirmă trendul.')).toBe(true)
  })

  it('funcționează și fără diacritice în text', () => {
    expect(hasTransitionWord('Totusi, piata creste.')).toBe(true)
    expect(hasTransitionWord('Asadar, incepem.')).toBe(true)
  })

  it('nu raportează fals pozitive', () => {
    expect(hasTransitionWord('Piața crește constant în acest an.')).toBe(false)
  })
})

describe('euristica diatezei pasive', () => {
  it('detectează perfectul compus pasiv („a fost publicat”)', () => {
    expect(isPassiveSentence('Raportul a fost publicat de către minister.')).toBe(true)
    expect(isPassiveSentence('Decizia a fost luată ieri.')).toBe(true)
  })

  it('detectează prezentul pasiv cu agent („este votată de”)', () => {
    expect(isPassiveSentence('Legea este votată de parlament.')).toBe(true)
    expect(isPassiveSentence('Măsurile sunt aplicate de către primării.')).toBe(true)
  })

  it('nu marchează diateza activă', () => {
    expect(isPassiveSentence('Ministerul a publicat raportul astăzi.')).toBe(false)
    expect(isPassiveSentence('Parlamentul votează legea mâine.')).toBe(false)
  })

  it('nu marchează predicative de tip „este important să…”', () => {
    expect(isPassiveSentence('Este important să citim raportul întreg.')).toBe(false)
  })
})

describe('segmentarea în propoziții', () => {
  it('desparte după . ! ? și la capăt de rând', () => {
    expect(sentences('Prima frază. A doua frază! A treia?\nA patra fără punct')).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// Verificări de cuvânt cheie
// ---------------------------------------------------------------------------

describe('verificări cuvânt cheie', () => {
  it('articolul bun trece toate verificările de cuvânt cheie', () => {
    const report = analyze(GOOD_INPUT)
    for (const id of [
      'keyword-presence',
      'keyword-in-meta-title',
      'keyword-in-meta-description',
      'keyword-in-slug',
      'keyword-in-title',
      'keyword-in-first-paragraph',
      'keyword-in-subheadings',
      'keyword-density',
    ]) {
      expect(getCheck(report, id).status, id).toBe('pass')
    }
  })

  it('fără cuvânt cheie setat → keyword-presence eșuează critic (roșu)', () => {
    const report = analyzeWith({ focusKeyword: '' })
    expect(getCheck(report, 'keyword-presence').status).toBe('fail')
    expect(report.score).toBe('red')
  })

  it('cuvânt cheie absent de peste tot → roșu', () => {
    const report = analyzeWith({ focusKeyword: 'criptomonede exotice' })
    expect(getCheck(report, 'keyword-presence').status).toBe('fail')
    expect(report.score).toBe('red')
  })

  it('lipsa din meta titlu și H1 este eșec; din slug/descriere doar avertisment', () => {
    const report = analyzeWith({
      metaTitle: 'Investiții regenerabile în România: beneficii mari',
      metaDescription: DESCRIPTION_WITHOUT_KEYWORD,
      slug: 'investitii-regenerabile-romania',
      title: 'Investițiile regenerabile accelerează',
    })
    expect(getCheck(report, 'keyword-in-meta-title').status).toBe('fail')
    expect(getCheck(report, 'keyword-in-title').status).toBe('fail')
    expect(getCheck(report, 'keyword-in-slug').status).toBe('warn')
    expect(getCheck(report, 'keyword-in-meta-description').status).toBe('warn')
  })

  it('densitate peste 3% → keyword stuffing (fail)', () => {
    const stuffed = Array.from(
      { length: 10 },
      () => 'Energie verde înseamnă energie verde pentru toți.',
    ).join(' ')
    const report = analyzeWith({ bodyText: stuffed, wordCount: 70 })
    // 20 apariții / 70 de cuvinte ≈ 28% — mult peste pragul de 3%.
    expect(getCheck(report, 'keyword-density').status).toBe('fail')
  })

  it('densitate sub 0,5% → avertisment', () => {
    // O singură apariție la 335 de cuvinte ≈ 0,3%.
    const oneMention = `Vorbim despre energie verde o singură dată. ${'Restul textului discută altceva complet diferit. '.repeat(40)}`
    const report = analyzeWith({ bodyText: oneMention, wordCount: 335 })
    expect(getCheck(report, 'keyword-density').status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// Verificări meta
// ---------------------------------------------------------------------------

describe('lungimea meta titlului', () => {
  const cases: Array<[number, 'pass' | 'warn' | 'fail']> = [
    [55, 'pass'],
    [40, 'warn'],
    [65, 'warn'],
    [20, 'fail'],
    [90, 'fail'],
    [0, 'fail'],
  ]
  for (const [len, status] of cases) {
    it(`${len} caractere → ${status}`, () => {
      const report = analyzeWith({ metaTitle: 'x'.repeat(len) })
      expect(getCheck(report, 'meta-title-length').status).toBe(status)
    })
  }
})

describe('lungimea meta descrierii', () => {
  const cases: Array<[number, 'pass' | 'warn' | 'fail']> = [
    [155, 'pass'],
    [120, 'warn'],
    [175, 'warn'],
    [60, 'fail'],
    [220, 'fail'],
    [0, 'fail'],
  ]
  for (const [len, status] of cases) {
    it(`${len} caractere → ${status}`, () => {
      const report = analyzeWith({ metaDescription: 'x'.repeat(len) })
      expect(getCheck(report, 'meta-description-length').status).toBe(status)
    })
  }
})

// ---------------------------------------------------------------------------
// Lizibilitate
// ---------------------------------------------------------------------------

describe('lizibilitate', () => {
  it('articolul bun trece toate verificările de lizibilitate', () => {
    const report = analyze(GOOD_INPUT)
    for (const id of [
      'sentence-length-avg',
      'long-sentences',
      'paragraph-length',
      'transition-words',
      'passive-voice',
      'word-count',
      'subheading-distribution',
    ]) {
      expect(getCheck(report, id).status, id).toBe('pass')
    }
  })

  it('propoziții kilometrice → media eșuează', () => {
    const longSentence = `Această propoziție despre energie verde ${'continuă și tot continuă cu multe detalii inutile '.repeat(6)}până la final.`
    const report = analyzeWith({ bodyText: `${longSentence} ${longSentence}` })
    expect(getCheck(report, 'sentence-length-avg').status).toBe('fail')
    expect(getCheck(report, 'long-sentences').status).toBe('fail')
  })

  it('sub 25% propoziții lungi → pass', () => {
    expect(getCheck(analyze(GOOD_INPUT), 'long-sentences').status).toBe('pass')
  })

  it('un paragraf-zid ocazional → avertisment; doar ziduri → eșec', () => {
    // 1 paragraf de 141 de cuvinte (3 × 47) e ok; unul de 188 (4 × 47) nu.
    const overlong = Array.from({ length: 4 }, () => PARAGRAPH).join(' ')
    const mostlyFine = [overlong, ...Array.from({ length: 6 }, () => PARAGRAPH)].join('\n\n')
    expect(getCheck(analyzeWith({ bodyText: mostlyFine }), 'paragraph-length').status).toBe('warn')

    // Tot corpul un singur zid de 329 de cuvinte → eșec.
    const wall = Array.from({ length: 7 }, () => PARAGRAPH).join(' ')
    expect(getCheck(analyzeWith({ bodyText: wall }), 'paragraph-length').status).toBe('fail')
  })

  it('tranziții sub 10% → eșec; peste 20% → pass', () => {
    const flat = Array.from(
      { length: 10 },
      () => 'Piața de energie verde crește constant anul acesta.',
    ).join(' ')
    expect(getCheck(analyzeWith({ bodyText: flat }), 'transition-words').status).toBe('fail')
    expect(getCheck(analyze(GOOD_INPUT), 'transition-words').status).toBe('pass')
  })

  it('pasiv peste 30% → eșec', () => {
    const passive = Array.from(
      { length: 5 },
      () => 'Strategia de energie verde a fost aprobată de către guvern.',
    ).join(' ')
    const report = analyzeWith({ bodyText: passive })
    expect(getCheck(report, 'passive-voice').status).toBe('fail')
  })

  it('sub 60% din minimul de cuvinte → eșec critic (roșu)', () => {
    const report = analyzeWith({ wordCount: 150 }) // 150 < 0,6 × 300
    expect(getCheck(report, 'word-count').status).toBe('fail')
    expect(report.score).toBe('red')
  })

  it('între 60% și minim → avertisment (nu roșu)', () => {
    const report = analyzeWith({ wordCount: 250 })
    expect(getCheck(report, 'word-count').status).toBe('warn')
    expect(report.score).not.toBe('red')
  })

  it('minWordCount din site-config e respectat', () => {
    const report = analyzeWith({ wordCount: 250, minWordCount: 200 })
    expect(getCheck(report, 'word-count').status).toBe('pass')
  })

  it('text lung fără subtitluri → avertisment la distribuție', () => {
    const report = analyzeWith({ headings: [] })
    expect(getCheck(report, 'subheading-distribution').status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// Linkuri & imagini
// ---------------------------------------------------------------------------

describe('linkuri și imagini', () => {
  it('cel puțin un link intern → pass; niciunul → avertisment', () => {
    expect(getCheck(analyze(GOOD_INPUT), 'internal-links').status).toBe('pass')
    expect(getCheck(analyzeWith({ links: [{ internal: false }] }), 'internal-links').status).toBe(
      'warn',
    )
    expect(getCheck(analyzeWith({ links: [] }), 'internal-links').status).toBe('warn')
  })

  it('imagine cu alt gol → eșec; alt necunoscut (media nepopulată) → pass', () => {
    expect(getCheck(analyzeWith({ images: [{ alt: '' }] }), 'image-alt').status).toBe('fail')
    expect(getCheck(analyzeWith({ images: [{ alt: null }] }), 'image-alt').status).toBe('pass')
  })

  it('fără imagini în corp → avertisment', () => {
    expect(getCheck(analyzeWith({ images: [] }), 'image-alt').status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// Agregarea scorului (semafor)
// ---------------------------------------------------------------------------

describe('agregarea scorului', () => {
  it('articolul bun este verde', () => {
    expect(analyze(GOOD_INPUT).score).toBe('green')
  })

  it('trei avertismente → galben', () => {
    const report = analyzeWith({
      metaDescription: DESCRIPTION_WITHOUT_KEYWORD, // warn: cheia lipsește din descriere
      links: [], // warn: fără link intern
      images: [], // warn: fără imagini
    })
    expect(report.checks.filter((c) => c.status === 'fail')).toHaveLength(0)
    expect(report.checks.filter((c) => c.status === 'warn').length).toBeGreaterThanOrEqual(3)
    expect(report.score).toBe('amber')
  })

  it('un eșec necritic → galben (nu roșu)', () => {
    const report = analyzeWith({ images: [{ alt: '' }] })
    expect(getCheck(report, 'image-alt').status).toBe('fail')
    expect(report.score).toBe('amber')
  })

  it('două avertismente → încă verde', () => {
    const report = analyzeWith({ links: [], images: [] })
    expect(report.checks.filter((c) => c.status === 'warn')).toHaveLength(2)
    expect(report.score).toBe('green')
  })
})

// ---------------------------------------------------------------------------
// Extractorul Lexical
// ---------------------------------------------------------------------------

describe('extractFromLexical', () => {
  const lexicalState = {
    root: {
      type: 'root',
      children: [
        {
          type: 'heading',
          tag: 'h2',
          children: [{ type: 'text', text: 'Subtitlu despre energie verde' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Un paragraf cu ' },
            {
              type: 'link',
              fields: { url: '/stiri/alt-articol', linkType: 'custom' },
              children: [{ type: 'text', text: 'link intern' }],
            },
            { type: 'text', text: ' și ' },
            {
              type: 'link',
              fields: { url: 'https://exemplu.com/pagina', linkType: 'custom' },
              children: [{ type: 'text', text: 'link extern' }],
            },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              fields: { linkType: 'internal', doc: { relationTo: 'articles', value: 1 } },
              children: [{ type: 'text', text: 'alt articol intern' }],
            },
          ],
        },
        { type: 'upload', relationTo: 'media', value: { id: 1, alt: 'O imagine cu parc eolian' } },
        { type: 'upload', relationTo: 'media', value: 7 },
      ],
    },
  }

  it('extrage subtitluri, text, linkuri și imagini', () => {
    const extract = extractFromLexical(lexicalState)
    expect(extract.headings).toEqual(['Subtitlu despre energie verde'])
    expect(extract.bodyText).toContain('Un paragraf cu link intern și link extern.')
    expect(extract.links).toEqual([{ internal: true }, { internal: false }, { internal: true }])
    expect(extract.images).toEqual([{ alt: 'O imagine cu parc eolian' }, { alt: null }])
    // 8 cuvinte în primul paragraf + 3 în al doilea + 4 în subtitlu.
    expect(extract.wordCount).toBe(15)
  })

  it('linkurile către gazda proprie sunt interne', () => {
    const extract = extractFromLexical({
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                fields: { url: 'https://newsromania.info/stiri/x', linkType: 'custom' },
                children: [{ type: 'text', text: 'acasă' }],
              },
            ],
          },
        ],
      },
    })
    expect(extract.links).toEqual([{ internal: true }])
  })

  it('tolerează stări goale sau invalide', () => {
    for (const state of [null, undefined, {}, { root: null }, { root: { children: 'x' } }]) {
      const extract = extractFromLexical(state)
      expect(extract.wordCount).toBe(0)
      expect(extract.bodyText).toBe('')
    }
  })

  it('buildAnalyzerInput alimentează analyze() cap-coadă', () => {
    const input = buildAnalyzerInput({
      title: 'Titlu',
      metaTitle: '',
      metaDescription: '',
      slug: 'titlu',
      focusKeyword: 'energie verde',
      body: lexicalState,
      minWordCount: 300,
    })
    expect(input.wordCount).toBe(15)
    const report = analyze(input)
    // Cheia apare doar în subtitlu → prezentă undeva, deci nu e critic.
    expect(getCheck(report, 'keyword-in-subheadings').status).toBe('pass')
    expect(getCheck(report, 'keyword-presence').status).toBe('pass')
    // Dar articolul e mult prea scurt → roșu prin word-count.
    expect(getCheck(report, 'word-count').status).toBe('fail')
    expect(report.score).toBe('red')
  })
})
