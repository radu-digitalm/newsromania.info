/**
 * Calibrare românească a analizatorului SEO (PROJECT_BRIEF §20.1,
 * architecture.md §4): normalizare fără diacritice, segmentare în
 * propoziții/paragrafe, listă de cuvinte de tranziție și euristica
 * diatezei pasive pentru română. Modul pur — fără DOM, fără dependențe.
 */

/**
 * Normalizator insensibil la diacritice și majuscule:
 * „Sănătate” → „sanatate”, „Ştiri” (sedilă) și „Știri” (virgulă) → „stiri”.
 * NFD desparte diacriticele în semne combinatorii (U+0300–U+036F), pe care
 * le eliminăm — acoperă ă/â/î/ș/ț în ambele codificări (virgulă și sedilă).
 */
export function normalizeRo(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Împarte textul în cuvinte (păstrează cratimele interne: „într-adevăr”). */
export function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 0)
}

export function countWords(text: string): number {
  return words(text).length
}

/**
 * Segmentare în propoziții: după . ! ? … urmate de spațiu, sau la capăt de
 * rând (un paragraf fără punct final tot închide propoziția).
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0)
}

/** Paragrafe: blocurile Lexical sunt unite cu linii goale de extractor. */
export function paragraphs(bodyText: string): string[] {
  return bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Regex pentru o expresie-cheie, pe text NORMALIZAT: limite de cuvânt
 * Unicode, iar spațiile/cratimele din expresie se echivalează între ele
 * („energie verde” găsește și „energie-verde”, deci și slug-uri).
 */
function phraseRegex(normalizedPhrase: string): RegExp | null {
  const tokens = normalizedPhrase.split(/[\s-]+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return null
  const body = tokens.map(escapeRegExp).join('[\\s-]+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'gu')
}

/**
 * Numărul de apariții ale expresiei în text — insensibil la diacritice,
 * majuscule și la separatorul spațiu/cratimă.
 */
export function countOccurrences(haystack: string, phrase: string): number {
  const re = phraseRegex(normalizeRo(phrase.trim()))
  if (!re || haystack.length === 0) return 0
  return normalizeRo(haystack).match(re)?.length ?? 0
}

export function containsPhrase(haystack: string, phrase: string): boolean {
  return countOccurrences(haystack, phrase) > 0
}

/**
 * Cuvinte și locuțiuni de tranziție românești (lista curată cerută de
 * PROJECT_BRIEF §20.1). Se compară pe forma normalizată, deci diacriticele
 * din text nu contează.
 */
export const TRANSITION_WORDS: readonly string[] = [
  'totuși',
  'de asemenea',
  'prin urmare',
  'în plus',
  'pe de altă parte',
  'pe de o parte',
  'astfel',
  'în concluzie',
  'deoarece',
  'însă',
  'totodată',
  'așadar',
  'de exemplu',
  'de pildă',
  'în primul rând',
  'în al doilea rând',
  'în al treilea rând',
  'în cele din urmă',
  'cu toate acestea',
  'în schimb',
  'de aceea',
  'drept urmare',
  'ca urmare',
  'în consecință',
  'mai mult decât atât',
  'mai mult',
  'mai întâi',
  'pe scurt',
  'în special',
  'îndeosebi',
  'în general',
  'de fapt',
  'de altfel',
  'în același timp',
  'între timp',
  'ulterior',
  'anterior',
  'în final',
  'în sfârșit',
  'nu în ultimul rând',
  'spre deosebire de',
  'la fel ca',
  'asemenea',
  'comparativ cu',
  'în comparație cu',
  'în timp ce',
  'pe măsură ce',
  'întrucât',
  'fiindcă',
  'pentru că',
  'în ciuda',
  'deși',
  'chiar dacă',
  'chiar și',
  'cu alte cuvinte',
  'altfel spus',
  'respectiv',
  'adică',
  'apoi',
  'după aceea',
  'în cazul în care',
  'în acest context',
  'în acest sens',
  'dimpotrivă',
  'în realitate',
  'într-adevăr',
  'desigur',
  'evident',
  'bineînțeles',
  'în mod similar',
  'la rândul său',
  'la rândul lor',
  'prin comparație',
  'ca atare',
  'pe lângă',
]

const TRANSITION_RES: RegExp[] = TRANSITION_WORDS.map((w) => phraseRegex(normalizeRo(w)) as RegExp)

/** Propoziția conține cel puțin un cuvânt/locuțiune de tranziție? */
export function hasTransitionWord(sentence: string): boolean {
  const s = normalizeRo(sentence)
  return TRANSITION_RES.some((re) => {
    re.lastIndex = 0
    return re.test(s)
  })
}

/**
 * Forme normalizate (fără diacritice) ale verbului „a fi” care pot introduce
 * diateza pasivă. „fost”/„fusese” acoperă compusele („a fost”, „au fost”,
 * „va fi fost” etc. — auxiliarul dinainte nu contează pentru detecție).
 */
const FI_FORMS = [
  'este',
  'e',
  'esti',
  'sunt',
  'suntem',
  'sunteti',
  'era',
  'erai',
  'eram',
  'erati',
  'erau',
  'fusese',
  'fusesera',
  'fost',
  'fi',
  'fie',
  'fiind',
  'fim',
  'fiti',
] as const

/**
 * formă de „a fi” + participiu terminat în -t/-tă/-ți/-te (normalizat:
 * t/ta/ti/te), opțional urmat de complementul de agent „de (către) …”.
 */
const PASSIVE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${FI_FORMS.join('|')})\\s+(\\p{L}{3,}(?:t|ta|ti|te))(?![\\p{L}\\p{N}])((?:\\s+\\p{L}+){0,2}?\\s+de(?:\\s+catre)?(?![\\p{L}\\p{N}]))?`,
  'u',
)

/**
 * Euristica pasivului românesc (PROJECT_BRIEF §20.1): o formă a lui „a fi”
 * urmată de un participiu în -t/-tă/-ți/-te. Compusele cu „fost”/„fusese”
 * („a fost publicat”) contează direct; pentru prezent/imperfect („este
 * votată”) cerem și marcatorul de agent „de (către)”, ca să nu marcăm
 * greșit predicative de tip „este important”.
 */
export function isPassiveSentence(sentence: string): boolean {
  const m = PASSIVE_RE.exec(normalizeRo(sentence))
  if (!m) return false
  const fiForm = m[1]
  const hasAgent = m[3] !== undefined
  if (fiForm === 'fost' || fiForm === 'fusese' || fiForm === 'fusesera') return true
  return hasAgent
}
