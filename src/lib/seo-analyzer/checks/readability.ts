/**
 * Verificări de lizibilitate calibrate pentru română (PROJECT_BRIEF §20.1):
 * lungimea propozițiilor și a paragrafelor, cuvinte de tranziție, diateza
 * pasivă, distribuția subtitlurilor și numărul minim de cuvinte.
 */
import {
  countWords,
  hasTransitionWord,
  isPassiveSentence,
  paragraphs,
  sentences,
} from '../romanian'
import type { SeoAnalyzerInput, SeoCheck } from '../types'

export const DEFAULT_MIN_WORD_COUNT = 300

/** Sub acest procent din minim, articolul e critic de scurt ⇒ roșu. */
const WORD_COUNT_CRITICAL_RATIO = 0.6

const AVG_SENTENCE_TARGET = 25
const LONG_SENTENCE_WORDS = 30
const LONG_SENTENCE_SHARE_MAX = 25 // %
const PARAGRAPH_MAX_WORDS = 150
const TRANSITION_SHARE_MIN = 20 // %
const PASSIVE_SHARE_MAX = 15 // %
/** Peste atâtea cuvinte fără un subtitlu, textul devine un „zid”. */
const WORDS_PER_SUBHEADING_MAX = 300

function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`
}

const TOO_SHORT_DETAIL = 'Conținut insuficient pentru această analiză.'

export function readabilityChecks(input: SeoAnalyzerInput): SeoCheck[] {
  const checks: SeoCheck[] = []
  const sents = sentences(input.bodyText)
  const paras = paragraphs(input.bodyText)
  const sentenceWordCounts = sents.map((s) => countWords(s))
  const totalSentenceWords = sentenceWordCounts.reduce((a, b) => a + b, 0)

  // --- Lungimea medie a propozițiilor -------------------------------------
  const avg = sents.length > 0 ? totalSentenceWords / sents.length : 0
  checks.push({
    id: 'sentence-length-avg',
    label: 'Lungimea medie a propozițiilor',
    status: sents.length === 0 ? 'warn' : avg <= AVG_SENTENCE_TARGET ? 'pass' : 'fail',
    detail:
      sents.length === 0
        ? TOO_SHORT_DETAIL
        : avg <= AVG_SENTENCE_TARGET
          ? `Media este de ${avg.toFixed(1).replace('.', ',')} cuvinte pe propoziție (țintă ≤ ${AVG_SENTENCE_TARGET}).`
          : `Media este de ${avg.toFixed(1).replace('.', ',')} cuvinte pe propoziție — scurtează frazele (țintă ≤ ${AVG_SENTENCE_TARGET}).`,
  })

  // --- Ponderea propozițiilor foarte lungi ---------------------------------
  const longCount = sentenceWordCounts.filter((n) => n > LONG_SENTENCE_WORDS).length
  const longShare = sents.length > 0 ? (longCount / sents.length) * 100 : 0
  checks.push({
    id: 'long-sentences',
    label: 'Propoziții foarte lungi',
    status:
      sents.length === 0
        ? 'warn'
        : longShare <= LONG_SENTENCE_SHARE_MAX
          ? 'pass'
          : longShare <= 40
            ? 'warn'
            : 'fail',
    detail:
      sents.length === 0
        ? TOO_SHORT_DETAIL
        : `${formatPercent(longShare)} dintre propoziții depășesc ${LONG_SENTENCE_WORDS} de cuvinte (acceptat ≤ ${LONG_SENTENCE_SHARE_MAX}%).`,
  })

  // --- Lungimea paragrafelor ----------------------------------------------
  const overlongParas = paras.filter((p) => countWords(p) > PARAGRAPH_MAX_WORDS).length
  const overlongShare = paras.length > 0 ? (overlongParas / paras.length) * 100 : 0
  checks.push({
    id: 'paragraph-length',
    label: 'Lungimea paragrafelor',
    status: overlongParas === 0 ? 'pass' : overlongShare <= 25 ? 'warn' : 'fail',
    detail:
      overlongParas === 0
        ? `Toate paragrafele au cel mult ${PARAGRAPH_MAX_WORDS} de cuvinte.`
        : `${overlongParas} paragraf(e) depășesc ${PARAGRAPH_MAX_WORDS} de cuvinte — împarte-le în idei mai scurte.`,
  })

  // --- Cuvinte de tranziție -------------------------------------------------
  const transitionCount = sents.filter((s) => hasTransitionWord(s)).length
  const transitionShare = sents.length > 0 ? (transitionCount / sents.length) * 100 : 0
  checks.push({
    id: 'transition-words',
    label: 'Cuvinte de tranziție',
    status:
      sents.length === 0
        ? 'warn'
        : transitionShare >= TRANSITION_SHARE_MIN
          ? 'pass'
          : transitionShare >= 10
            ? 'warn'
            : 'fail',
    detail:
      sents.length === 0
        ? TOO_SHORT_DETAIL
        : `${formatPercent(transitionShare)} dintre propoziții conțin cuvinte de tranziție („totuși”, „de asemenea”, „prin urmare”…) — țintă ≥ ${TRANSITION_SHARE_MIN}%.`,
  })

  // --- Diateza pasivă -------------------------------------------------------
  const passiveCount = sents.filter((s) => isPassiveSentence(s)).length
  const passiveShare = sents.length > 0 ? (passiveCount / sents.length) * 100 : 0
  checks.push({
    id: 'passive-voice',
    label: 'Diateza pasivă',
    status:
      sents.length === 0
        ? 'warn'
        : passiveShare <= PASSIVE_SHARE_MAX
          ? 'pass'
          : passiveShare <= 30
            ? 'warn'
            : 'fail',
    detail:
      sents.length === 0
        ? TOO_SHORT_DETAIL
        : `${formatPercent(passiveShare)} dintre propoziții folosesc diateza pasivă (acceptat ≤ ${PASSIVE_SHARE_MAX}%). Preferă formulările active.`,
  })

  // --- Număr minim de cuvinte (CRITIC sub 60% din minim) -------------------
  const minWords = input.minWordCount ?? DEFAULT_MIN_WORD_COUNT
  const criticalFloor = Math.floor(minWords * WORD_COUNT_CRITICAL_RATIO)
  checks.push({
    id: 'word-count',
    label: 'Numărul de cuvinte',
    status:
      input.wordCount >= minWords ? 'pass' : input.wordCount >= criticalFloor ? 'warn' : 'fail',
    detail:
      input.wordCount >= minWords
        ? `Articolul are ${input.wordCount} cuvinte (minim ${minWords}).`
        : input.wordCount >= criticalFloor
          ? `Articolul are ${input.wordCount} cuvinte — sub minimul de ${minWords}. Mai dezvoltă subiectul.`
          : `Articolul are doar ${input.wordCount} cuvinte — mult sub minimul de ${minWords} (sub 60%).`,
  })

  // --- Distribuția subtitlurilor (fără „ziduri” de text) -------------------
  const wordsPerSection = input.wordCount / (input.headings.length + 1)
  checks.push({
    id: 'subheading-distribution',
    label: 'Distribuția subtitlurilor',
    status:
      input.wordCount <= WORDS_PER_SUBHEADING_MAX
        ? 'pass'
        : input.headings.length === 0
          ? 'warn'
          : wordsPerSection > WORDS_PER_SUBHEADING_MAX
            ? 'warn'
            : 'pass',
    detail:
      input.wordCount <= WORDS_PER_SUBHEADING_MAX
        ? 'Text scurt — subtitlurile nu sunt obligatorii.'
        : input.headings.length === 0
          ? `Peste ${WORDS_PER_SUBHEADING_MAX} de cuvinte fără niciun subtitlu — adaugă H2/H3 pentru structură.`
          : wordsPerSection > WORDS_PER_SUBHEADING_MAX
            ? `În medie ${Math.round(wordsPerSection)} cuvinte pe secțiune — adaugă mai multe subtitluri (țintă ≤ ${WORDS_PER_SUBHEADING_MAX}).`
            : 'Subtitlurile împart textul în secțiuni ușor de parcurs.',
  })

  return checks
}
