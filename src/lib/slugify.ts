import type { FieldHook } from 'payload'

/**
 * Romanian-aware slugifier (architecture.md §3 — „ro-slugified").
 *
 * Handles comma-below diacritics (ș, ț) as well as the legacy cedilla forms
 * (ş, ţ) and ă/â/î via Unicode NFD decomposition, then strips everything that
 * is not [a-z0-9] down to single hyphens.
 */
export function roSlugify(input: string): string {
  return (
    input
      .normalize('NFD')
      // Strip combining marks (breve, circumflex, comma below, cedilla…).
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // ß and đ/ð survive NFD; map the common strays explicitly.
      .replace(/ß/g, 'ss')
      .replace(/[đð]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}

/**
 * Shared beforeValidate field hook for `slug` fields: normalizes a manually
 * entered slug, or auto-generates it from a sibling field (default `title`)
 * when the slug is empty.
 */
export function slugifyHook(sourceField = 'title'): FieldHook {
  return ({ data, value }) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      return roSlugify(value)
    }
    const source = data?.[sourceField]
    if (typeof source === 'string' && source.trim().length > 0) {
      return roSlugify(source)
    }
    return value
  }
}
