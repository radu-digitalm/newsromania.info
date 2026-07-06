/**
 * Extrage din starea serializată a editorului Lexical (câmpul `body` al
 * articolelor) exact datele cerute de analyze(): text simplu, subtitluri,
 * imagini, linkuri și numărul de cuvinte. Pur TS — merge identic pe server
 * (hook beforeChange) și în browser (panoul live), fără instanță de editor.
 */
import { countWords } from './romanian'
import type { SeoAnalyzerInput } from './types'

export interface LexicalExtract {
  bodyText: string
  headings: string[]
  images: Array<{ alt: string | null }>
  links: Array<{ internal: boolean }>
  wordCount: number
}

interface LexicalNode {
  type?: unknown
  text?: unknown
  tag?: unknown
  children?: unknown
  fields?: { url?: unknown; linkType?: unknown } | null
  value?: unknown
}

function asNode(value: unknown): LexicalNode | null {
  return value !== null && typeof value === 'object' ? (value as LexicalNode) : null
}

function childrenOf(node: LexicalNode): LexicalNode[] {
  if (!Array.isArray(node.children)) return []
  return node.children.map(asNode).filter((n): n is LexicalNode => n !== null)
}

/** Textul concatenat al unui nod și al descendenților lui. */
function textOf(node: LexicalNode): string {
  if (typeof node.text === 'string') return node.text
  if (node.type === 'linebreak') return ' '
  return childrenOf(node)
    .map((child) => textOf(child))
    .join('')
}

function defaultInternalHosts(): string[] {
  const hosts = new Set(['newsromania.info', 'www.newsromania.info'])
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    try {
      hosts.add(new URL(siteUrl).hostname)
    } catch {
      // URL invalid în env — ignorăm, rămân gazdele implicite.
    }
  }
  return [...hosts]
}

function isInternalLink(node: LexicalNode, internalHosts: string[]): boolean {
  // Linkurile alese din editor către documente Payload sunt interne prin definiție.
  if (node.fields?.linkType === 'internal') return true
  const url = typeof node.fields?.url === 'string' ? node.fields.url : ''
  if (url.startsWith('/') || url.startsWith('#')) return true
  try {
    return internalHosts.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/** alt-ul unui nod `upload`: string populat, '' explicit gol, null necunoscut. */
function uploadAlt(node: LexicalNode): string | null {
  const value = node.value
  if (value !== null && typeof value === 'object' && 'alt' in value) {
    const alt = (value as { alt?: unknown }).alt
    return typeof alt === 'string' ? alt : ''
  }
  // Doar id (nepopulat, ex. în formularul din admin) — colecția `media`
  // cere alt obligatoriu, deci îl considerăm prezent (null = necunoscut).
  return null
}

/**
 * Parcurge starea Lexical serializată. Blocurile de nivel superior devin
 * paragrafe în `bodyText` (separate prin `\n\n`), subtitlurile merg separat
 * în `headings`, iar linkurile/imaginile se numără oriunde în arbore.
 */
export function extractFromLexical(
  state: unknown,
  opts?: { internalHosts?: string[] },
): LexicalExtract {
  const internalHosts = opts?.internalHosts ?? defaultInternalHosts()
  const bodyBlocks: string[] = []
  const headings: string[] = []
  const images: Array<{ alt: string | null }> = []
  const links: Array<{ internal: boolean }> = []

  const collectInline = (node: LexicalNode): void => {
    if (node.type === 'link' || node.type === 'autolink') {
      links.push({ internal: isInternalLink(node, internalHosts) })
    }
    if (node.type === 'upload') {
      images.push({ alt: uploadAlt(node) })
    }
    for (const child of childrenOf(node)) collectInline(child)
  }

  const rootNode = asNode((state as { root?: unknown } | null)?.root)
  const topLevel = rootNode ? childrenOf(rootNode) : []

  for (const block of topLevel) {
    collectInline(block)
    const text = textOf(block).trim()
    if (block.type === 'heading') {
      if (text.length > 0) headings.push(text)
    } else if (text.length > 0) {
      bodyBlocks.push(text)
    }
  }

  const bodyText = bodyBlocks.join('\n\n')
  const wordCount = countWords(bodyText) + headings.reduce((acc, h) => acc + countWords(h), 0)

  return { bodyText, headings, images, links, wordCount }
}

/** Construiește intrarea completă pentru analyze() din câmpurile formularului. */
export function buildAnalyzerInput(args: {
  title: string
  metaTitle: string
  metaDescription: string
  slug: string
  focusKeyword: string
  body: unknown
  minWordCount?: number
}): SeoAnalyzerInput {
  const extract = extractFromLexical(args.body)
  return {
    title: args.title,
    metaTitle: args.metaTitle,
    metaDescription: args.metaDescription,
    slug: args.slug,
    focusKeyword: args.focusKeyword,
    bodyText: extract.bodyText,
    headings: extract.headings,
    images: extract.images,
    links: extract.links,
    wordCount: extract.wordCount,
    minWordCount: args.minWordCount,
  }
}
