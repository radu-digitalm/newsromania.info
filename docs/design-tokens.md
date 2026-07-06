# NewsRomania — Design tokens („Broadsheet Tricolor”)

Reference for the Tailwind v4 `@theme` tokens implemented in `src/app/(frontend)/globals.css`
and the font instances in `src/lib/fonts.ts`. Design source of truth: `docs/design-direction.md`.

Consume tokens **only** through the generated utilities (`bg-page`, `text-ink`, `border-border`, …)
or, inside handwritten CSS, through the CSS variables (`var(--color-page)`, …).

## Color tokens

### Contract tokens

| Token                      | Value     | Generated classes (examples)                                | Intended use                                                                                                                                             |
| -------------------------- | --------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-page`             | `#FAF9F6` | `bg-page`, `text-page`                                      | Page background — the warm paper stock.                                                                                                                  |
| `--color-surface`          | `#FFFFFF` | `bg-surface`, `border-surface`                              | Masthead, nav bar, article reading column, image well, card-on-paper surfaces.                                                                           |
| `--color-border`           | `#E3E0D9` | `border-border`, `divide-border`                            | Decorative hairlines: feed dividers, nav bottom edge, AdSlot border.                                                                                     |
| `--color-ink`              | `#14181D` | `text-ink`, `bg-ink`, `border-ink`                          | Headlines, article body, primary text, masthead rules, footer background.                                                                                |
| `--color-ink-secondary`    | `#3F4754` | `text-ink-secondary`                                        | Excerpts, standfirst, secondary text.                                                                                                                    |
| `--color-ink-muted`        | `#57606E` | `text-ink-muted`                                            | Meta: timestamps, captions, photo credits, „Publicitate” label. Still ≥4.5:1 on every light surface.                                                     |
| `--color-link`             | `#4463AD` | `text-link`, `bg-link`                                      | Links, primary buttons, source-pill iconography. Same value as `brand-blue`.                                                                             |
| `--color-link-hover`       | `#35508F` | `text-link-hover`, `bg-link-hover`, `hover:text-link-hover` | Link/button hover and active states.                                                                                                                     |
| `--color-focus`            | `#4463AD` | `ring-focus`, `outline-focus`                               | `:focus-visible` ring on light surfaces. On ink (dark) surfaces override to `--color-brand-yellow`.                                                      |
| `--color-brand-blue`       | `#4463AD` | `bg-brand-blue`, `text-brand-blue`                          | Wordmark blue — the only brand color allowed on small text.                                                                                              |
| `--color-brand-periwinkle` | `#6E85C3` | `bg-brand-periwinkle`, `fill-brand-periwinkle`              | **Decorative only** (3.62:1): placeholder ring motif, blockquote left bar, tricolor bar. Never text.                                                     |
| `--color-brand-yellow`     | `#F6EF49` | `bg-brand-yellow`, `decoration-brand-yellow`                | **Decorative + dark-surface only**: tricolor bar, footer hover underline, focus ring on ink. Never text, never on white.                                 |
| `--color-brand-red`        | `#ED2024` | `bg-brand-red`, `border-brand-red`                          | **Non-text + large-text only** (4.35:1): active-nav underline, section-rule segment, tricolor bar, „ACUM” badge border. Banned below 24px / 18.5px bold. |
| `--color-accent-bg`        | `#EFF2FA` | `bg-accent-bg`                                              | Subtle brand-tinted background: source-pill bg, placeholder bg.                                                                                          |

### Extended broadsheet tokens (design direction §1.1)

| Token                       | Value     | Generated classes (examples) | Intended use                                                                                           |
| --------------------------- | --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--color-surface-2`         | `#F3F2EE` | `bg-surface-2`               | AdSlot background, blockquote well.                                                                    |
| `--color-red-text`          | `#C0121F` | `text-red-text`              | Category kickers, „ACUM” badge text, „Cele mai citite” ordinals — the AA-safe deep red for small text. |
| `--color-pill-text`         | `#35508F` | `text-pill-text`             | Text + icon inside periwinkle-tinted pills, placeholder category label.                                |
| `--color-border-strong`     | `#14181D` | `border-border-strong`       | Masthead fold rule (2px), section rules (1px).                                                         |
| `--color-border-functional` | `#838C9B` | `border-border-functional`   | Form inputs, secondary-button borders — meaning-bearing outlines, ≥3:1 on all light surfaces.          |
| `--color-border-pill`       | `#C9D4EC` | `border-border-pill`         | Source-pill border (decorative; the pill text carries meaning). Also the global `::selection` tint.    |
| `--color-footer-link`       | `#C7D0E2` | `text-footer-link`           | Footer link text on the ink background.                                                                |
| `--color-footer-meta`       | `#AEB9CF` | `text-footer-meta`           | Footer copyright/meta on the ink background.                                                           |

## Font tokens

| Token          | Backing font                               | Generated class | Intended use                                                                                                   |
| -------------- | ------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------- |
| `--font-serif` | Source Serif 4 (variable, normal + italic) | `font-serif`    | Editorial voice: all headlines, article body, standfirst, blockquotes, „NewsRomania” as text.                  |
| `--font-sans`  | Inter (variable)                           | `font-sans`     | Machinery: nav, kickers, bylines, dates, source pills, buttons, chips, footer, ad labels, forms. Body default. |

`src/lib/fonts.ts` exports `fontSans` / `fontSerif` (`next/font/google`, subsets
`['latin', 'latin-ext']` — full coverage of Ș/ș/Ț/ț U+0218–U+021B — `display: 'swap'`,
variables `--font-inter` / `--font-source-serif`, deliberately distinct from the theme
token names so the `@theme inline` mapping never self-references). The layout must
attach both variable classes:

```tsx
import { fontSans, fontSerif } from '@/lib/fonts'
;<html lang="ro" className={`${fontSans.variable} ${fontSerif.variable}`}>
```

The `@theme inline` block in `globals.css` passes the runtime variables through to the
`font-sans` / `font-serif` utilities, with the §2.1 CSS fallback stacks
(`system-ui, -apple-system, 'Segoe UI', sans-serif` and `Georgia, 'Times New Roman', serif`).

## Global base styles (globals.css `@layer base`)

- `body`: `bg-page`, `text-ink`, `font-sans`.
- Headings `h1–h6`: `text-wrap: balance`.
- `::selection`: ink text on the `#C9D4EC` periwinkle tint.
- `:focus-visible`: `2px solid var(--color-focus)`, `outline-offset: 2px`, on every
  interactive element. Inside dark (ink) surfaces, components override
  `outline-color` to `var(--color-brand-yellow)` (14.74:1 on ink).
- `a, button`: the single §6 transition recipe (color / background-color / border-color /
  text-decoration-color, 150ms ease-out) and `:active { opacity: 0.85 }` touch feedback.
- `prefers-reduced-motion: reduce`: global kill switch for animations/transitions/smooth scroll.

## WCAG 2.2 AA contrast matrix — computed

Every ratio below was computed with the WCAG relative-luminance formula
(script: contrast.mjs, run at build step 1 on 2026-07-06). Requirements: **≥4.5:1**
for body/small text, **≥3:1** for large text (≥24px / ≥18.5px bold) and meaning-bearing
UI (borders, icons). **All pairs used by the design pass — no token value needed adjustment.**

### Body-text pairs (require ≥4.5:1)

| Foreground              | Background                      | Ratio   | Verdict |
| ----------------------- | ------------------------------- | ------- | ------- |
| `ink` #14181D           | `surface` #FFFFFF               | 17.82:1 | Pass    |
| `ink` #14181D           | `page` #FAF9F6                  | 16.93:1 | Pass    |
| `ink` #14181D           | `accent-bg` #EFF2FA             | 15.92:1 | Pass    |
| `ink` #14181D           | `surface-2` #F3F2EE             | 15.91:1 | Pass    |
| `ink-secondary` #3F4754 | `surface` #FFFFFF               | 9.37:1  | Pass    |
| `ink-secondary` #3F4754 | `page` #FAF9F6                  | 8.90:1  | Pass    |
| `ink-secondary` #3F4754 | `surface-2` #F3F2EE             | 8.37:1  | Pass    |
| `ink-secondary` #3F4754 | `accent-bg` #EFF2FA             | 8.37:1  | Pass    |
| `ink-muted` #57606E     | `surface` #FFFFFF               | 6.36:1  | Pass    |
| `ink-muted` #57606E     | `page` #FAF9F6                  | 6.04:1  | Pass    |
| `ink-muted` #57606E     | `accent-bg` #EFF2FA             | 5.68:1  | Pass    |
| `ink-muted` #57606E     | `surface-2` #F3F2EE (ad label)  | 5.67:1  | Pass    |
| `link` #4463AD          | `surface` #FFFFFF               | 5.78:1  | Pass    |
| `link` #4463AD          | `page` #FAF9F6                  | 5.49:1  | Pass    |
| `link` #4463AD          | `surface-2` #F3F2EE             | 5.16:1  | Pass    |
| `link` #4463AD          | `accent-bg` #EFF2FA             | 5.16:1  | Pass    |
| `link-hover` #35508F    | `surface` #FFFFFF               | 7.79:1  | Pass    |
| `link-hover` #35508F    | `page` #FAF9F6                  | 7.40:1  | Pass    |
| `link-hover` #35508F    | `accent-bg` #EFF2FA             | 6.96:1  | Pass    |
| `link-hover` #35508F    | `surface-2` #F3F2EE             | 6.95:1  | Pass    |
| `red-text` #C0121F      | `surface` #FFFFFF               | 6.27:1  | Pass    |
| `red-text` #C0121F      | `page` #FAF9F6                  | 5.96:1  | Pass    |
| `pill-text` #35508F     | `accent-bg` #EFF2FA             | 6.96:1  | Pass    |
| white #FFFFFF           | `link` #4463AD (primary button) | 5.78:1  | Pass    |
| white #FFFFFF           | `ink` #14181D (footer headings) | 17.82:1 | Pass    |
| `footer-link` #C7D0E2   | `ink` #14181D                   | 11.50:1 | Pass    |
| `footer-meta` #AEB9CF   | `ink` #14181D                   | 9.03:1  | Pass    |

### Large-text / UI pairs (require ≥3:1)

| Foreground                  | Background          | Ratio   | Verdict                             |
| --------------------------- | ------------------- | ------- | ----------------------------------- |
| `brand-red` #ED2024         | `surface` #FFFFFF   | 4.35:1  | Pass (large text / UI accents only) |
| `brand-red` #ED2024         | `page` #FAF9F6      | 4.13:1  | Pass (large text / UI accents only) |
| `brand-yellow` #F6EF49      | `ink` #14181D       | 14.74:1 | Pass (decor / focus ring on dark)   |
| `border-functional` #838C9B | `surface` #FFFFFF   | 3.39:1  | Pass                                |
| `border-functional` #838C9B | `page` #FAF9F6      | 3.22:1  | Pass                                |
| `border-functional` #838C9B | `surface-2` #F3F2EE | 3.03:1  | Pass                                |

### Rejected / banned combinations

| Combination                                           | Ratio           | Ruling                                                                                                                                                       |
| ----------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `#8A93A3` border on `page` #FAF9F6                    | 2.94:1          | **Failed** 3:1 — this is why the functional border token is `#838C9B` (adjustment already baked into the final design direction; recomputation confirms it). |
| White text on `brand-red` #ED2024                     | 4.35:1          | Banned for text (< 4.5:1). The „ACUM” badge inverts: white bg, `brand-red` border, `red-text` label.                                                         |
| `brand-red` #ED2024 below 24px / 18.5px bold          | 4.35:1          | Banned — small red text always uses `red-text` #C0121F.                                                                                                      |
| `brand-periwinkle` #6E85C3 as text                    | 3.62:1          | Banned by policy — decorative only.                                                                                                                          |
| `brand-yellow` #F6EF49 as text (anywhere) or on white | 1.11:1 on white | Banned — decorative and dark-surface only.                                                                                                                   |

## Hard rules recap

1. Body text is always `ink` / `ink-secondary` / `ink-muted` on a light surface — all ≥4.5:1.
2. `brand-blue`/`link` is the only brand color that may carry small text.
3. `brand-red` never below 24px (18.5px bold); small red is `red-text`.
4. `brand-periwinkle` and `brand-yellow` never carry text; yellow never appears on light surfaces.
5. Meaning-bearing borders use `border-functional`; decorative hairlines use `border`.
6. Focus ring: `focus` (blue) on light surfaces, `brand-yellow` on ink surfaces — never removed.
