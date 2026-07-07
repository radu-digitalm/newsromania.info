/**
 * Typography pairing — „Prim-Plan Tricolor” v2 (docs/design-direction-v2.md §2.1).
 *
 * - Archivo (variable): headlines ONLY — display, h1–h4, section heads, footer
 *   wordmark (design weights 600/700/800).
 * - Inter (variable): everything else — body, excerpts, UI, nav chips, buttons,
 *   meta, forms, footer (design weights 400/500/600/700; real italics loaded
 *   for the blockquote style).
 *
 * Both cover latin-ext, including the Romanian comma-below letters
 * Ș/ș/Ț/ț (U+0218–U+021B); `next/font` fails the build if a subset is
 * unsupported — that IS the diacritics guard, do not bypass it. Exposed as CSS
 * variables with names DISTINCT from the theme tokens
 * (--font-inter/--font-archivo); globals.css maps them onto
 * --font-sans/--font-serif via `@theme inline` without self-reference. The
 * --font-serif token NAME survives from v1 but now resolves to the Archivo
 * display face (no serif anywhere in v2).
 *
 * Usage (layout): <html className={`${fontSans.variable} ${fontSerif.variable}`}>
 */
import { Archivo, Inter } from 'next/font/google'

export const fontSans = Inter({
  subsets: ['latin', 'latin-ext'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-inter',
})

export const fontSerif = Archivo({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-archivo',
})
