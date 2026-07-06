/**
 * Shared content contract — the two first-class content types (PROJECT_BRIEF
 * Section 19.1). Payload collections will map onto these shapes at build
 * step 3; until then mock data implements them.
 */

export interface Category {
  slug: string
  name: string
}

export interface ImageRef {
  url: string
  alt: string
  width: number
  height: number
}

interface ArticleBase {
  id: string
  slug: string
  title: string
  /** Short excerpt. For aggregated items: fair-use AI excerpt, never full text. */
  excerpt: string
  category: Category
  tags: string[]
  /** ISO 8601 */
  publishedAt: string
  image?: ImageRef
}

/** Original in-house article — full body rendered on-site, author byline, self-canonical. */
export interface OriginalArticle extends ArticleBase {
  type: 'original'
  author: {
    name: string
    slug: string
  }
  /** Full article body (paragraphs). Payload/Lexical will replace this at step 3. */
  body: string[]
}

/** Aggregated item — excerpt + attribution + link out (new tab). Never full text. */
export interface AggregatedItem extends ArticleBase {
  type: 'aggregated'
  source: {
    /** Publisher display name, e.g. "Digi24" */
    name: string
    /** Publisher homepage */
    url: string
  }
  /** Canonical URL of the original story on the publisher's site. */
  sourceUrl: string
}

export type FeedItem = OriginalArticle | AggregatedItem
