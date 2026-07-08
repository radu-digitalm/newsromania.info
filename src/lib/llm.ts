import OpenAI from 'openai'

import { siteConfig } from '@/config/site'

import { MAX_EXCERPT_WORDS, MAX_VERBATIM_RUN, validateExcerpt, wordCount } from './llm-validate'

/**
 * LLM service (architecture.md §4). OpenAI-backed today, provider-agnostic
 * interface for tomorrow (AI_DEFAULT_PROVIDER_PUBLIC / AI_DEFAULT_PROVIDER_MEMBER).
 *
 * Legal gates (PROJECT_BRIEF 0.1/0.2) are enforced HERE, not trusted to the
 * model: every excerpt is post-validated with src/lib/llm-validate.ts; on
 * violation we retry once with a stricter instruction, then fall back to
 * link-only (null). Every call is metered into the `llm-usage` collection.
 */

// ---------------------------------------------------------------------------
// Provider indirection
// ---------------------------------------------------------------------------

export type LlmAudience = 'public' | 'member'
export type LlmPurpose = 'summarize' | 'categorize' | 'captions' | 'seed' | 'rank'

export interface ChatRequest {
  system: string
  user: string
  /** Ignored by reasoning models that only accept the default temperature. */
  temperature?: number
  /** Ask the provider for a strict-JSON object response. */
  jsonMode?: boolean
}

export interface ChatResult {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

export interface LlmProvider {
  readonly name: string
  chat(req: ChatRequest): Promise<ChatResult>
}

function providerNameFor(audience: LlmAudience): string {
  const raw =
    audience === 'member'
      ? process.env.AI_DEFAULT_PROVIDER_MEMBER
      : process.env.AI_DEFAULT_PROVIDER_PUBLIC
  return (raw ?? 'openai').trim().toLowerCase()
}

/**
 * Resolve the provider for an audience. Only 'openai' is implemented; the
 * switch is the extension point for future providers (anthropic, local, …).
 */
export function getProvider(audience: LlmAudience = 'public'): LlmProvider {
  const name = providerNameFor(audience)
  switch (name) {
    case 'openai':
      return getOpenAiProvider()
    default:
      throw new Error(`Furnizor LLM neimplementat: „${name}” (momentan doar „openai”)`)
  }
}

// ---------------------------------------------------------------------------
// OpenAI provider (lazy singleton)
// ---------------------------------------------------------------------------

let openAiClient: OpenAI | null = null
let openAiProvider: LlmProvider | null = null

function getOpenAiClient(): OpenAI {
  if (!openAiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY nu este setat')
    openAiClient = new OpenAI({ apiKey, maxRetries: 2, timeout: 60_000 })
  }
  return openAiClient
}

function getChatModel(): string {
  const model = process.env.OPENAI_MODEL_CHAT
  if (!model) throw new Error('OPENAI_MODEL_CHAT nu este setat')
  return model
}

/** Reasoning-family models reject custom temperature and accept reasoning_effort. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model)
}

function getOpenAiProvider(): LlmProvider {
  if (openAiProvider) return openAiProvider

  openAiProvider = {
    name: 'openai',
    async chat(req: ChatRequest): Promise<ChatResult> {
      const client = getOpenAiClient()
      const model = getChatModel()

      const params: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }
      if (isReasoningModel(model)) {
        // Keep latency/cost down: these tasks need no deep reasoning.
        params.reasoning_effort = 'minimal'
      } else if (req.temperature !== undefined) {
        params.temperature = req.temperature
      }
      if (req.jsonMode) {
        params.response_format = { type: 'json_object' }
      }

      // Model families differ in which knobs they accept; on a 400 naming one
      // of ours, strip it and retry instead of failing the whole pipeline.
      const optional = ['reasoning_effort', 'temperature', 'response_format']
      for (let attempt = 0; ; attempt++) {
        try {
          const completion = (await client.chat.completions.create(
            params as never,
          )) as OpenAI.Chat.Completions.ChatCompletion
          return {
            text: completion.choices[0]?.message?.content?.trim() ?? '',
            model: completion.model ?? model,
            inputTokens: completion.usage?.prompt_tokens ?? 0,
            outputTokens: completion.usage?.completion_tokens ?? 0,
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const culprit = optional.find((p) => p in params && message.includes(p))
          if (culprit && attempt < optional.length) {
            delete params[culprit]
            continue
          }
          throw err
        }
      }
    },
  }
  return openAiProvider
}

// ---------------------------------------------------------------------------
// Usage metering → `llm-usage` collection (upsert by day+model+purpose)
// ---------------------------------------------------------------------------

/**
 * USD per 1M tokens. Best-effort snapshot (iulie 2026) — gpt-5.4-mini assumed
 * at the gpt-5-mini price tier ($0.25 in / $2.00 out per 1M). Verify against
 * https://platform.openai.com/pricing when the owner reviews costs; unknown
 * models are metered at 0 cost (calls/tokens still counted).
 */
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-5.4-mini': { input: 0.25, output: 2.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

/** Cost estimate; falls back to the longest matching model-name prefix, else 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price =
    PRICING_USD_PER_MTOK[model] ??
    Object.entries(PRICING_USD_PER_MTOK)
      .filter(([key]) => model.startsWith(key))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1]
  if (!price) return 0
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}

interface UsageEntry {
  provider: string
  model: string
  purpose: LlmPurpose
  inputTokens: number
  outputTokens: number
}

/**
 * Increment the per-day counter row (day+model+purpose). NEVER throws —
 * metering must not take the ingest pipeline down (warn only).
 * Payload is imported lazily so unit tests can import this module without
 * booting the CMS.
 */
async function logUsage(entry: UsageEntry): Promise<void> {
  try {
    const { getPayloadClient } = await import('./payload')
    const payload = await getPayloadClient()
    const day = new Date().toISOString().slice(0, 10)
    const cost = estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens)

    const existing = await payload.find({
      collection: 'llm-usage',
      where: {
        and: [
          { day: { equals: day } },
          { model: { equals: entry.model } },
          { purpose: { equals: entry.purpose } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    const doc = existing.docs[0]
    if (doc) {
      await payload.update({
        collection: 'llm-usage',
        id: doc.id,
        data: {
          calls: (doc.calls ?? 0) + 1,
          inputTokens: (doc.inputTokens ?? 0) + entry.inputTokens,
          outputTokens: (doc.outputTokens ?? 0) + entry.outputTokens,
          estCostUsd: (doc.estCostUsd ?? 0) + cost,
        },
        overrideAccess: true,
      })
    } else {
      await payload.create({
        collection: 'llm-usage',
        data: {
          day,
          provider: entry.provider,
          model: entry.model,
          purpose: entry.purpose,
          calls: 1,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          estCostUsd: cost,
        },
        overrideAccess: true,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[llm] nu am putut înregistra consumul în llm-usage:', message)
  }
}

/** chat() + metering in one step; metering failures never propagate. */
async function meteredChat(
  provider: LlmProvider,
  purpose: LlmPurpose,
  req: ChatRequest,
): Promise<ChatResult> {
  const result = await provider.chat(req)
  await logUsage({
    provider: provider.name,
    model: result.model,
    purpose,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  })
  return result
}

// ---------------------------------------------------------------------------
// Shared parsing helpers (exported for unit tests — pure, no I/O)
// ---------------------------------------------------------------------------

const VALID_CATEGORY_SLUGS = new Set(siteConfig.categories.map((c) => c.slug))
export const FALLBACK_CATEGORY_SLUG = 'actualitate'

/** Validate a model-proposed category slug against src/config/site.ts. */
export function resolveCategorySlug(value: unknown): string {
  if (typeof value === 'string') {
    const slug = value.trim().toLowerCase()
    if (VALID_CATEGORY_SLUGS.has(slug)) return slug
  }
  return FALLBACK_CATEGORY_SLUG
}

/** Normalize model-proposed tags: strings only, lowercase, no '#', deduped, ≤ 4. */
export function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, ' ')
    if (tag.length === 0 || tag.length > 60) continue
    seen.add(tag)
    if (seen.size === 4) break
  }
  return [...seen]
}

/** Strip wrapping quotes/markdown the model sometimes adds around plain text. */
export function stripWrapping(text: string): string {
  let out = text.trim()
  out = out.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '')
  out = out.replace(/^[„"«'‘]+/, '').replace(/["”»'’]+$/, '')
  return out.trim()
}

/** Extract the first JSON object from a model reply (tolerates code fences). */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const candidate = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate) return null
  try {
    const parsed: unknown = JSON.parse(candidate)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  return null
}

/** Twitter/X wraps every URL in t.co and counts it as EXACTLY 23 characters. */
export const TCO_URL_LENGTH = 23

/**
 * Compose a tweet: body + space + link, capped at `max` WEIGHTED chars. The
 * link is never truncated and — per Twitter's counting rules — always weighs
 * {@link TCO_URL_LENGTH} regardless of its raw length, so long article slugs
 * never eat into the body budget. The body is cut on a word boundary (with
 * dangling punctuation trimmed) and an ellipsis.
 */
export function clampTweet(body: string, url: string, max = 240): string {
  const cleanBody = body.replace(new RegExp(escapeRegExp(url), 'g'), '').trim()
  const room = max - TCO_URL_LENGTH - 1
  let text = cleanBody
  if (text.length > room) {
    text = text.slice(0, room - 1)
    const lastSpace = text.lastIndexOf(' ')
    if (lastSpace > room / 2) text = text.slice(0, lastSpace)
    // No dangling comma/colon/dash right before the ellipsis.
    text = `${text.replace(/[\s,;:–—-]+$/u, '')}…`
  }
  return text.length > 0 ? `${text} ${url}` : url
}

/** Keep at most `max` hashtags in a caption; drop the rest, tidy whitespace. */
export function limitHashtags(text: string, max = 5): string {
  let kept = 0
  return text
    .replace(/#[\p{L}\p{N}_]+/gu, (tag) => {
      kept += 1
      return kept <= max ? tag : ''
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// 1) summarizeExcerpt — ≤70 Romanian words, transformative, attributed
// ---------------------------------------------------------------------------

export interface SummarizeInput {
  title: string
  sourceText: string
  sourceName: string
}

export interface SummarizeOptions {
  /** 'seed' for the one-time WordPress import; defaults to 'summarize'. */
  purpose?: Extract<LlmPurpose, 'summarize' | 'seed'>
  audience?: LlmAudience
}

const SUMMARIZE_SYSTEM = `Ești redactor de agregare la o publicație de știri din România. Primești titlul și textul unei știri publicate de o ALTĂ redacție. Scrie un rezumat TRANSFORMATIV în limba română, cu diacritice corecte (ă, â, î, ș, ț).

Reguli obligatorii:
- Maximum 65 de cuvinte, unul-două paragrafe scurte, fără titlu, fără ghilimele decorative.
- Reformulează COMPLET, cu propriile cuvinte: nu prelua niciodată mai mult de câteva cuvinte consecutive din textul-sursă și nu cita pasaje.
- Strict faptic: fără opinii, fără superlative, fără informații care nu apar în sursă.
- Nu folosi „?" sau alte semne de substituție în locul cifrelor ori faptelor pe care nu le găsești în sursă (de ex. scorul „0-?") — omite pur și simplu informația respectivă.
- Atribuie natural sursa o singură dată (de ex. „potrivit {SURSA}" sau „relatează {SURSA}").
- Nu adăuga linkuri, emoji sau hashtaguri.
Răspunde DOAR cu textul rezumatului.`

const SUMMARIZE_RETRY_SUFFIX = `

ATENȚIE: încercarea anterioară a încălcat regulile ({MOTIVE}). Rescrie de la zero, mai scurt (maximum 60 de cuvinte) și parafrazează integral — nicio secvență de peste 6 cuvinte identică cu textul-sursă.`

/**
 * ≤70-word transformative Romanian excerpt with natural attribution.
 * Post-validated against the source; one strict retry; on repeated violation
 * returns null (caller stores the item link-only). Low temperature.
 */
export async function summarizeExcerpt(
  input: SummarizeInput,
  opts: SummarizeOptions = {},
): Promise<string | null> {
  const provider = getProvider(opts.audience ?? 'public')
  const purpose = opts.purpose ?? 'summarize'
  const system = SUMMARIZE_SYSTEM.replaceAll('{SURSA}', input.sourceName)
  const user = `Sursa: ${input.sourceName}\nTitlu: ${input.title}\n\nText:\n${input.sourceText}`

  let lastReasons: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const systemForAttempt =
      attempt === 0
        ? system
        : system + SUMMARIZE_RETRY_SUFFIX.replace('{MOTIVE}', lastReasons.join(', '))

    const result = await meteredChat(provider, purpose, {
      system: systemForAttempt,
      user,
      temperature: 0.2,
    })

    const excerpt = stripWrapping(result.text)
    const verdict = validateExcerpt(excerpt, input.sourceText)
    if (verdict.ok) return excerpt
    lastReasons = verdict.reasons
    console.warn(
      `[llm] rezumat respins (încercarea ${attempt + 1}/2): ${verdict.reasons.join(', ')} — ` +
        `limite: ${MAX_EXCERPT_WORDS} cuvinte, ${MAX_VERBATIM_RUN} cuvinte verbatim`,
    )
  }
  // Legal fallback: link-only, no excerpt.
  return null
}

// ---------------------------------------------------------------------------
// 2) categorizeAndTag — one of the 8 canonical slugs + ≤ 4 Romanian tags
// ---------------------------------------------------------------------------

export interface CategorizeInput {
  title: string
  excerpt: string
}

export interface CategorizeResult {
  categorySlug: string
  tags: string[]
}

export async function categorizeAndTag(
  input: CategorizeInput,
  opts: { audience?: LlmAudience } = {},
): Promise<CategorizeResult> {
  const provider = getProvider(opts.audience ?? 'public')
  const slugList = siteConfig.categories.map((c) => `${c.slug} (${c.name})`).join(', ')

  const result = await meteredChat(provider, 'categorize', {
    system: `Clasifici știri românești. Alege EXACT o categorie din lista de sluguri: ${slugList}. Propune apoi cel mult 4 etichete scurte în limba română (substantive/entități, litere mici, cu diacritice, fără „#"). Răspunde DOAR cu un obiect JSON de forma {"categorySlug": "...", "tags": ["...", "..."]}.`,
    user: `Titlu: ${input.title}\nRezumat: ${input.excerpt}`,
    temperature: 0.1,
    jsonMode: true,
  })

  const parsed = parseJsonObject(result.text)
  if (!parsed) {
    console.warn('[llm] răspuns necategorizabil, folosesc categoria implicită')
    return { categorySlug: FALLBACK_CATEGORY_SLUG, tags: [] }
  }
  return {
    categorySlug: resolveCategorySlug(parsed.categorySlug),
    tags: sanitizeTags(parsed.tags),
  }
}

// ---------------------------------------------------------------------------
// 2b) pickMostImpactful — choose the ONE highest-impact item from a feed pull
// ---------------------------------------------------------------------------

export interface ImpactCandidate {
  title: string
  /** Short plain-text hint (already HTML-stripped); may be empty. */
  snippet: string
}

const IMPACT_PICK_SYSTEM = `Ești redactor-șef la o publicație de știri din România. Primești o listă numerotată de titluri NOI apărute la ACEEAȘI sursă într-o singură verificare. Alege UNA SINGURĂ — cea mai importantă și cu cel mai mare impact pentru publicul general din România (relevanță națională, amploare, consecințe pentru cât mai mulți oameni). Preferă știrile de interes public major (politică, economie, evenimente majore, siguranță) în detrimentul divertismentului minor, promoțiilor sau conținutului repetitiv, DACĂ există o alternativă mai importantă. Răspunde DOAR cu un obiect JSON de forma {"index": N}, unde N este numărul din listă al știrii alese.`

/**
 * Given several NEW items pulled from ONE source in a single run, return the
 * 0-based index of the single most important / highest-impact story for a
 * Romanian audience (owner rule: "1 news per source per pull, AI decides").
 *
 * Low temperature for stability. On ≤1 candidate, any error, or an
 * unparseable/out-of-range reply it returns 0 — the caller always ingests one
 * item (index 0 = earliest by publish order, preserving the "keep earliest"
 * convention), so the pipeline degrades gracefully without an LLM.
 */
export async function pickMostImpactful(
  input: { candidates: ImpactCandidate[]; sourceName: string },
  opts: { audience?: LlmAudience } = {},
): Promise<number> {
  const { candidates, sourceName } = input
  if (candidates.length <= 1) return 0
  const provider = getProvider(opts.audience ?? 'public')
  const list = candidates
    .map((c, i) => `${i}. ${c.title}${c.snippet ? ` — ${c.snippet}` : ''}`)
    .join('\n')
  try {
    const result = await meteredChat(provider, 'rank', {
      system: IMPACT_PICK_SYSTEM,
      user: `Sursa: ${sourceName}\n\nȘtiri:\n${list}`,
      temperature: 0.1,
      jsonMode: true,
    })
    const parsed = parseJsonObject(result.text)
    const idx = parsed ? Number(parsed.index) : Number.NaN
    if (Number.isInteger(idx) && idx >= 0 && idx < candidates.length) return idx
    console.warn(
      `[llm] selecție impact în afara intervalului (${String(parsed?.index)}), folosesc index 0`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[llm] selecția de impact a eșuat, folosesc index 0: ${message}`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// 3) writeCaptions — per-platform Romanian social captions
// ---------------------------------------------------------------------------

export interface CaptionsInput {
  title: string
  excerpt: string
  url: string
  type: 'original' | 'aggregated'
}

export interface Captions {
  /** 2–3 sentences + link. */
  facebook: string
  /** ≤ 240 chars including the link. */
  twitter: string
  /** Visual-first copy, ≤ 5 hashtags, no link (goes in bio/story). */
  instagram: string
}

export async function writeCaptions(
  input: CaptionsInput,
  opts: { audience?: LlmAudience } = {},
): Promise<Captions> {
  const provider = getProvider(opts.audience ?? 'public')
  const attribution =
    input.type === 'aggregated'
      ? 'Este o știre agregată de la altă publicație: nu prezenta conținutul drept al nostru; invită la citirea materialului complet la sursă prin linkul dat.'
      : 'Este un articol propriu al redacției NewsRomania.'

  const result = await meteredChat(provider, 'captions', {
    system: `Scrii texte de social media în limba română (diacritice corecte: ă, â, î, ș, ț) pentru publicația NewsRomania. ${attribution}
Răspunde DOAR cu un obiect JSON: {"facebook": "...", "twitter": "...", "instagram": "..."}.
- facebook: 2-3 propoziții informative, ton sobru, apoi linkul pe rând nou.
- twitter: o singură propoziție percutantă + linkul; TOTAL sub 240 de caractere.
- instagram: orientat vizual (prima frază scurtă, descriptivă), 2-4 rânduri, FĂRĂ link, cu cel mult 5 hashtaguri românești la final. Convenție hashtaguri: litere mici, fără diacritice, substantive nearticulate (ex. #stiri #romania #economie #mediu).
Fără emoji excesive (maximum una), fără clickbait, fără majuscule integrale.`,
    user: `Titlu: ${input.title}\nRezumat: ${input.excerpt}\nLink: ${input.url}`,
    temperature: 0.5,
    jsonMode: true,
  })

  const parsed = parseJsonObject(result.text) ?? {}
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  let facebook = str(parsed.facebook) || `${input.title}`
  if (!facebook.includes(input.url)) facebook = `${facebook}\n\n${input.url}`

  const twitter = clampTweet(str(parsed.twitter) || input.title, input.url, 240)

  let instagram = limitHashtags(str(parsed.instagram) || `${input.title}\n\n${input.excerpt}`, 5)
  // Instagram captions do not carry clickable links — keep them clean.
  instagram = instagram.replace(new RegExp(escapeRegExp(input.url), 'g'), '').trim()

  return { facebook, twitter, instagram }
}

// Re-export the validation constants callers care about (ingest worker).
export { MAX_EXCERPT_WORDS, MAX_VERBATIM_RUN, validateExcerpt, wordCount }
