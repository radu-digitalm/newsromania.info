# NewsRomania — Design tokens („Prim-Plan Tricolor” v2)

Reference for the Tailwind v4 `@theme` tokens implemented in `src/app/(frontend)/globals.css`
and the font instances in `src/lib/fonts.ts`. Design source of truth:
`docs/design-direction-v2.md` (v1 „Broadsheet Tricolor” is superseded).

Token **names** are the fixed contract and are identical to v1 — only **values** changed, plus
four additive tokens (`scrim`, `ink-inverse`, `overlay-meta`, `accent-bg-strong`). Consume tokens
**only** through the generated utilities (`bg-page`, `text-ink`, `border-border`, …) or, inside
handwritten CSS, through the CSS variables (`var(--color-page)`, …).

## Color tokens

### Contract tokens

| Token                      | Value     | Generated classes (examples)                                | Intended use                                                                                                                            |
| -------------------------- | --------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-page`             | `#F2F4F8` | `bg-page`, `text-page`                                      | Page canvas — cool near-white; makes white cards read as elevation.                                                                     |
| `--color-surface`          | `#FFFFFF` | `bg-surface`, `border-surface`                              | Cards, masthead, chip nav, article reading surface.                                                                                    |
| `--color-border`           | `#E2E6ED` | `border-border`, `divide-border`                            | Decorative hairlines: card borders, nav bottom edge, dividers, AdSlot border.                                                          |
| `--color-ink`              | `#10161F` | `text-ink`, `bg-ink`, `border-ink`                          | Headlines, body, primary text, active-chip background, footer background.                                                              |
| `--color-ink-secondary`    | `#3C4655` | `text-ink-secondary`                                        | Excerpts, standfirst, secondary text.                                                                                                  |
| `--color-ink-muted`        | `#556170` | `text-ink-muted`                                            | Meta: timestamps, captions, photo credits, „Publicitate” label. Still ≥4.5:1 on every light surface.                                    |
| `--color-link`             | `#2E5AAE` | `text-link`, `bg-link`                                      | Links, primary buttons/CTA, hover accents — the modernized brand blue for text UI.                                                     |
| `--color-link-hover`       | `#234684` | `text-link-hover`, `bg-link-hover`, `hover:text-link-hover` | Link/button hover and active states.                                                                                                   |
| `--color-focus`            | `#2E5AAE` | `ring-focus`, `outline-focus`                               | `:focus-visible` ring on light surfaces. On ink/overlay (dark) surfaces override to `--color-brand-yellow`.                             |
| `--color-brand-blue`       | `#4463AD` | `bg-brand-blue`, `text-brand-blue`                          | The literal logo blue — brand/decorative use (wordmark-adjacent, tricolor bar). Text UI uses `link`.                                    |
| `--color-brand-periwinkle` | `#6E85C3` | `bg-brand-periwinkle`, `fill-brand-periwinkle`              | **Decorative only** (3.61:1): placeholder ring motif, blockquote left bar. Never text.                                                 |
| `--color-brand-yellow`     | `#F6EF49` | `bg-brand-yellow`, `decoration-brand-yellow`                | Overlay kicker-chip bg (with ink text), footer hover underline, focus ring on dark. **Never text-color**, never on white.               |
| `--color-brand-red`        | `#ED2024` | `bg-brand-red`, `border-brand-red`                          | **Non-text only** (4.34:1 / 3.94:1): tricolor bar, section-head accent bar, „ACUM” badge border. Banned below 24px / 18.5px bold.       |
| `--color-accent-bg`        | `#E9EEF9` | `bg-accent-bg`                                              | Source-pill bg, chip hover bg, placeholder gradient start.                                                                             |

### Extended tokens (design direction v2 §1.2)

| Token                       | Value     | Generated classes (examples) | Intended use                                                                                            |
| --------------------------- | --------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `--color-surface-2`         | `#EEF1F6` | `bg-surface-2`               | AdSlot well, blockquote well.                                                                            |
| `--color-red-text`          | `#C0121F` | `text-red-text`              | Category kicker text, „ACUM” badge text, „Cele mai citite” numerals — the AA-safe deep red for small text. |
| `--color-pill-text`         | `#2E5AAE` | `text-pill-text`             | Text inside `accent-bg` source pills.                                                                    |
| `--color-border-strong`     | `#10161F` | `border-border-strong`       | Section rules where used.                                                                                |
| `--color-border-functional` | `#7C8695` | `border-border-functional`   | Form inputs, pagination borders — meaning-bearing outlines, ≥3:1 on all three light surfaces.            |
| `--color-border-pill`       | `#C9D6EE` | `border-border-pill`         | Source-pill border (decorative; the pill text carries meaning). Also the global `::selection` tint.      |
| `--color-footer-link`       | `#C3CDE0` | `text-footer-link`           | Footer link text on the ink background.                                                                  |
| `--color-footer-meta`       | `#94A0B5` | `text-footer-meta`           | Footer copyright/meta on the ink background.                                                             |

### New in v2 (additive — no existing name renamed or removed)

| Token                       | Value     | Generated classes (examples)        | Intended use                                                          |
| --------------------------- | --------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `--color-scrim`             | `#0A101B` | `from-scrim`, `bg-scrim`            | Gradient-overlay base color on featured/secondary overlay cards (§5.2). |
| `--color-ink-inverse`       | `#FFFFFF` | `text-ink-inverse`                  | Titles/text on scrim and dark surfaces.                                 |
| `--color-overlay-meta`      | `#D7DEE9` | `text-overlay-meta`                 | Meta text on scrim.                                                     |
| `--color-accent-bg-strong`  | `#DBE3F2` | `bg-accent-bg-strong`, `to-accent-bg-strong` | Placeholder gradient end.                                        |

## Font tokens

| Token          | Backing font                     | Generated class | Intended use                                                                                                          |
| -------------- | -------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--font-serif` | Archivo (variable)               | `font-serif`    | Headlines ONLY: display, h1–h4, section heads, footer wordmark (weights 600/700/800). Token NAME kept from v1; v2 fills the slot with the display face — every existing `font-serif` utility is the headline face with zero component churn. No serif anywhere in v2. |
| `--font-sans`  | Inter (variable, normal + italic) | `font-sans`     | Everything else: body, excerpts, UI, nav chips, buttons, meta, forms, footer (weights 400/500/600/700). Body default.  |

`src/lib/fonts.ts` exports `fontSans` / `fontSerif` (`next/font/google`, subsets
`['latin', 'latin-ext']` — full coverage of Ș/ș/Ț/ț U+0218–U+021B — `display: 'swap'`,
variables `--font-inter` / `--font-archivo`, deliberately distinct from the theme
token names so the `@theme inline` mapping never self-references). `next/font`
fails the build if a subset is unsupported — that is the diacritics guard; do not
bypass it. The layout must attach both variable classes:

```tsx
import { fontSans, fontSerif } from '@/lib/fonts'
;<html lang="ro" className={`${fontSans.variable} ${fontSerif.variable}`}>
```

The `@theme inline` block in `globals.css` passes the runtime variables through to the
`font-sans` / `font-serif` utilities, with the §2.1 CSS fallback stack
(`system-ui, -apple-system, 'Segoe UI', sans-serif`) for **both** slots.

## Global base styles (globals.css `@layer base`)

- `body`: `bg-page`, `text-ink`, `font-sans`.
- Headings `h1–h6`: `text-wrap: balance`.
- `::selection`: ink text on the `#C9D6EE` pill-border tint.
- `:focus-visible`: `2px solid var(--color-focus)`, `outline-offset: 2px`, on every
  interactive element. Inside dark surfaces (footer, overlay cards), components override
  `outline-color` to `var(--color-brand-yellow)` (15.01:1 on ink).
- `a, button`: transition **recipe A** (color / background-color / border-color /
  text-decoration-color, 150ms ease-out) and `:active { opacity: 0.85 }` touch feedback.
- `.transition-elevation` / `.transition-photo`: transition **recipe B** for cards
  (transform + box-shadow 200ms ease-out) and card photos (transform 300ms ease-out) —
  components opt in with these classes.
- `prefers-reduced-motion: reduce`: global kill switch for animations/transitions/smooth
  scroll — hover transforms/scales collapse to instant state changes.
- The `hover` custom variant compiles every `hover:` utility to
  `@media (hover: hover) and (pointer: fine)`.

## WCAG 2.2 AA contrast matrix — independently recomputed

Every ratio below was computed with the WCAG 2.1 relative-luminance formula
(script: `contrast-v2.mjs`, run at the v2 token migration on 2026-07-07). Ratios are
**truncated** (not rounded) to two decimals, so they are never overstated — a 0.01
discrepancy versus `docs/design-direction-v2.md` §1.3 (which rounds) is expected.
Requirements: **≥4.5:1** for body/small text, **≥3:1** for large text (≥24px / ≥18.5px
bold) and meaning-bearing UI (borders, focus rings, icons).
**All pairs used by the design pass — no token value needed adjustment.**

### Body-text pairs (require ≥4.5:1)

| Foreground                | Background                             | Ratio   | Verdict |
| ------------------------- | -------------------------------------- | ------- | ------- |
| `ink` #10161F             | `surface` #FFFFFF                      | 18.15:1 | Pass    |
| `ink` #10161F             | `page` #F2F4F8                         | 16.48:1 | Pass    |
| `ink` #10161F             | `surface-2` #EEF1F6                    | 16.03:1 | Pass    |
| `ink` #10161F             | `accent-bg` #E9EEF9                    | 15.61:1 | Pass    |
| `ink` #10161F             | `brand-yellow` #F6EF49 (kicker chip)   | 15.01:1 | Pass    |
| `ink-secondary` #3C4655   | `surface` #FFFFFF                      | 9.54:1  | Pass    |
| `ink-secondary` #3C4655   | `page` #F2F4F8                         | 8.67:1  | Pass    |
| `ink-secondary` #3C4655   | `surface-2` #EEF1F6                    | 8.43:1  | Pass    |
| `ink-muted` #556170       | `surface` #FFFFFF                      | 6.30:1  | Pass    |
| `ink-muted` #556170       | `page` #F2F4F8                         | 5.72:1  | Pass    |
| `ink-muted` #556170       | `surface-2` #EEF1F6 (ad label)         | 5.56:1  | Pass    |
| `link` #2E5AAE            | `surface` #FFFFFF                      | 6.58:1  | Pass    |
| `link` #2E5AAE            | `page` #F2F4F8                         | 5.97:1  | Pass    |
| `link` #2E5AAE            | `surface-2` #EEF1F6                    | 5.81:1  | Pass    |
| `link-hover` #234684      | `surface` #FFFFFF                      | 9.20:1  | Pass    |
| `link-hover` #234684      | `page` #F2F4F8                         | 8.36:1  | Pass    |
| `link-hover` #234684      | `surface-2` #EEF1F6                    | 8.13:1  | Pass    |
| white #FFFFFF             | `link` #2E5AAE (CTA button)            | 6.58:1  | Pass    |
| white #FFFFFF             | `link-hover` #234684 (CTA hover)       | 9.20:1  | Pass    |
| `red-text` #C0121F        | `surface` #FFFFFF (image chip)         | 6.27:1  | Pass    |
| `red-text` #C0121F        | `page` #F2F4F8                         | 5.69:1  | Pass    |
| `red-text` #C0121F        | `surface-2` #EEF1F6                    | 5.54:1  | Pass    |
| `pill-text` #2E5AAE       | `accent-bg` #E9EEF9                    | 5.66:1  | Pass    |
| `pill-text` #2E5AAE       | `accent-bg-strong` #DBE3F2             | 5.10:1  | Pass    |
| `ink-inverse` #FFFFFF     | worst-case scrim zone #404950 (see below) | 9.18:1 | Pass   |
| `overlay-meta` #D7DEE9    | worst-case scrim zone #404950          | 6.78:1  | Pass    |
| white #FFFFFF             | `ink` #10161F (footer, active chip)    | 18.15:1 | Pass    |
| `footer-link` #C3CDE0     | `ink` #10161F                          | 11.35:1 | Pass    |
| `footer-meta` #94A0B5     | `ink` #10161F                          | 6.87:1  | Pass    |

### Large-text / UI pairs (require ≥3:1)

| Foreground                  | Background          | Ratio   | Verdict                             |
| --------------------------- | ------------------- | ------- | ----------------------------------- |
| `border-functional` #7C8695 | `surface` #FFFFFF   | 3.68:1  | Pass                                |
| `border-functional` #7C8695 | `page` #F2F4F8      | 3.34:1  | Pass                                |
| `border-functional` #7C8695 | `surface-2` #EEF1F6 | 3.25:1  | Pass                                |
| `focus` #2E5AAE (ring)      | `page` #F2F4F8      | 5.97:1  | Pass                                |
| `brand-yellow` #F6EF49 (focus/decor) | `ink` #10161F | 15.01:1 | Pass                              |
| `brand-red` #ED2024 (accent bar) | `surface` #FFFFFF | 4.34:1 | Pass — non-text only               |
| `brand-red` #ED2024 (accent bar) | `page` #F2F4F8 | 3.94:1  | Pass — non-text only                |

### Scrim worst case (overlay cards, §5.2)

Overlay text is confined to the gradient zone where the scrim (`--color-scrim` `#0A101B`)
has **α ≥ 0.78**. Worst case is a pure-white photo behind the α = 0.78 band:

- Direct sRGB compositing yields `#40454D` → **9.64:1** for white titles,
  **7.12:1** for `overlay-meta` `#D7DEE9`.
- The design direction (§1.3) documents the slightly *lighter*, more conservative
  composite `#404950` → **9.18:1** white / **6.78:1** overlay-meta.

Both bounds pass ≥4.5:1 with headroom; the tables above use the conservative documented
bound. Text over photos exists ONLY inside this scrim zone — nowhere else.

### Rejected / banned combinations

| Combination                                            | Ratio           | Ruling                                                                                                      |
| ------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------ |
| White text on `brand-red` #ED2024                      | 4.34:1          | Banned for text (< 4.5:1). The „ACUM” badge inverts: white bg, `brand-red` border, `red-text` label.         |
| `brand-red` #ED2024 below 24px / 18.5px bold           | 4.34:1          | Banned — small red text always uses `red-text` #C0121F.                                                      |
| `brand-periwinkle` #6E85C3 as text                     | 3.61:1          | Banned by policy — decorative only (placeholder ring motif, blockquote bar).                                 |
| `brand-yellow` #F6EF49 as text (anywhere) or on white  | 1.20:1 on white | Banned — chip/decor background and dark-surface accent only; ink text ON yellow is the only allowed pairing. |
| Overlay text outside the α ≥ 0.78 scrim zone           | unbounded       | Banned — the bottom-anchored text block's padding keeps every glyph inside the ≥0.78 region.                 |

## Hard rules recap

1. Body text is always `ink` / `ink-secondary` / `ink-muted` on a light surface — all ≥4.5:1.
2. `link` (#2E5AAE) is the text-UI blue; `brand-blue` (#4463AD) is brand/decorative only.
3. `brand-red` never below 24px (18.5px bold) and never as text background for white text;
   small red is `red-text`.
4. `brand-periwinkle` and `brand-yellow` never carry text; yellow appears only as chip/decor
   bg with `ink` text or as accent/focus on dark surfaces.
5. Meaning-bearing borders use `border-functional`; decorative hairlines use `border`
   (or `border-pill` on source pills).
6. Focus ring: `focus` (blue) on light surfaces, `brand-yellow` on ink/overlay surfaces —
   never removed without replacement.
7. Text over photos exists only on overlay cards, inside the α ≥ 0.78 scrim zone, in
   `ink-inverse` / `overlay-meta`.
