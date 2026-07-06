/**
 * Typography pairing — „Broadsheet Tricolor” (docs/design-direction.md §2.1).
 *
 * - Source Serif 4 (variable): headlines, article body, standfirst, blockquotes.
 * - Inter (variable): all UI — nav, kickers, bylines, meta, buttons, forms, footer.
 *
 * Both cover latin-ext, including the Romanian comma-below letters
 * Ș/ș/Ț/ț (U+0218–U+021B). Exposed as CSS variables with names DISTINCT from
 * the theme tokens (--font-inter/--font-source-serif); globals.css maps them
 * onto --font-sans/--font-serif via `@theme inline` without self-reference.
 *
 * Usage (layout): <html className={`${fontSans.variable} ${fontSerif.variable}`}>
 */
import { Inter, Source_Serif_4 } from 'next/font/google'

export const fontSans = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
})

export const fontSerif = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-source-serif',
})
