> **SUPERSEDED (2026-07-07):** rejected by the owner — replaced by `docs/design-direction-v2.md` („Prim-Plan Tricolor”, v2). Kept for history only.

# NewsRomania — FINAL Design Direction: „Broadsheet Tricolor”

**Status: final. Zero open decisions. Every value below is exact and implementable as written.**

## Why

The logo decides the direction: `assets/logo-full.png` is a distressed **serif** wordmark with a black baseline rule — a newspaper masthead, not a tech logo — built for light ground. „Broadsheet Tricolor” is therefore the base: a warm paper page, near-black serif headlines, black masthead rules, and the tricolor ring flattened into a thin, disciplined accent system. This register signals _trust_ the way a quality Romanian broadsheet does, while the layout system (sticky CSS-only nav, list-not-cards feed, zero-CLS ads, AA-verified palette) keeps it modern and mobile-first.

Grafted from the competing directions where they were superior:

- **From „Quiet Tricolor”:** the header search entry point (`/cautare`, zero JS); hover effects gated behind `@media (hover: hover) and (pointer: fine)`; `:active { opacity: .85 }` instant touch feedback; the full-width „Citește articolul integral pe {Sursă} ↗” button on aggregated article pages.
- **From „Puls Tricolor”:** in-article ad slots with the hard ethics rule that an ad never sits between a title and its byline; screen-reader text on outbound links that **names the source** („link extern către Digi24”), not a generic „(link extern)”.

Every contrast ratio below was independently recomputed with the WCAG 2.1 relative-luminance formula. One latent AA failure was found and fixed: the functional border `#8A93A3` passed on white (3.10:1) but **failed on the paper background** (2.94:1 < 3:1). It is minimally darkened to **`#838C9B`**, which passes on all three light surfaces.

Logo facts driving the design: `assets/logo-full.png` — horizontal lockup (tricolor ring + distressed blue serif wordmark + black baseline rule), transparent background, designed for **light** surfaces → header, OG. `assets/logo-symbol.png` — hand-drawn three-arc ring (periwinkle outer, yellow mid, red inner) → favicon, app icons, placeholder motif.

---

## 1. Color roles

### 1.1 Token table (implement as CSS variables in Tailwind v4 `@theme`)

| Token                       | Hex       | Role                                                                                                                     |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--color-page`              | `#FAF9F6` | Page background (warm paper — the broadsheet stock)                                                                      |
| `--color-surface`           | `#FFFFFF` | Masthead, nav bar, article reading column, image well                                                                    |
| `--color-surface-2`         | `#F3F2EE` | AdSlot background, blockquote well                                                                                       |
| `--color-ink`               | `#14181D` | Headlines, article body, primary text, masthead rules, footer bg                                                         |
| `--color-ink-2`             | `#3F4754` | Excerpts, standfirst, secondary text                                                                                     |
| `--color-ink-3`             | `#57606E` | Meta: timestamps, captions, ad label, photo credits                                                                      |
| `--color-link`              | `#4463AD` | Links, buttons, focus ring (brand wordmark blue)                                                                         |
| `--color-link-hover`        | `#35508F` | Link/button hover + active                                                                                               |
| `--color-red-text`          | `#C0121F` | Category kickers, small red text (deepened brand red — raw `#ED2024` fails AA at small sizes)                            |
| `--color-accent-red`        | `#ED2024` | Non-text + large-text only: active-nav underline, section-rule segment, tricolor bar                                     |
| `--color-brand-periwinkle`  | `#6E85C3` | Decorative only (3.62:1 on white): placeholder ring motif, blockquote left bar, tricolor bar                             |
| `--color-brand-yellow`      | `#F6EF49` | Decorative + dark-surface only: tricolor bar, footer hover underline, focus ring on dark                                 |
| `--color-tint-periwinkle`   | `#EFF2FA` | Source-pill bg, placeholder bg                                                                                           |
| `--color-pill-text`         | `#35508F` | Text inside periwinkle-tinted pills                                                                                      |
| `--color-border`            | `#E3E0D9` | Decorative hairlines (feed dividers, nav bottom)                                                                         |
| `--color-border-strong`     | `#14181D` | Masthead rule, section rules                                                                                             |
| `--color-border-functional` | `#838C9B` | Form inputs, meaning-bearing outlines — ≥3:1 on white, paper AND surface-2 (fixed from `#8A93A3`, which failed on paper) |
| `--color-border-pill`       | `#C9D4EC` | Source-pill border (decorative; pill text carries meaning)                                                               |
| `--color-footer-link`       | `#C7D0E2` | Footer link text on ink                                                                                                  |
| `--color-footer-meta`       | `#AEB9CF` | Footer copyright/meta on ink                                                                                             |
| `--color-focus`             | `#4463AD` | `:focus-visible` outline on light surfaces; `#F6EF49` on ink surfaces                                                    |

### 1.2 Where each brand color appears

- **Wordmark blue `#4463AD`** — the workhorse: all links, primary buttons, focus rings, source-pill iconography, hover states. The only brand color allowed on small text.
- **Ring red `#ED2024`** — kinetic accent, never small text: 3px active-nav underline, the 48×3px segment on section rules, tricolor bar. Small red text always uses `#C0121F`.
- **Ring periwinkle `#6E85C3`** — decorative only: oversized ring motif in image placeholders, 4px blockquote bar, tricolor bar. Never text.
- **Ring yellow `#F6EF49`** — decorative and only against ink: tricolor bar, footer link hover underline, focus ring on the dark footer. Never on white, never as text.
- **Near-black `#14181D`** — the authority color: masthead double rule, all headlines, footer background. Not pure `#000` — crisp serif without harshness.

### 1.3 Header treatment — LIGHT (final)

White masthead + white nav over the paper page. The transparent-background lockup (blue wordmark + black baseline rule) is built for light ground; a dark header would require recoloring the logo and would fight the broadsheet register. Brand presence at the top comes from: (a) a **3px tricolor bar** at the very top of the viewport — `linear-gradient(90deg, #4463AD 0 33.4%, #F6EF49 33.4% 66.7%, #ED2024 66.7% 100%)` (flag order, blue anchored to the wordmark blue), (b) the full lockup in the masthead, (c) a 2px solid `#14181D` rule under the masthead — the newspaper fold line.

### 1.4 Contrast ratios — independently recomputed (WCAG 2.1 relative luminance); all pass

| Foreground / Background                              | Ratio   | Requirement    | Verdict                                    |
| ---------------------------------------------------- | ------- | -------------- | ------------------------------------------ |
| `#14181D` ink / `#FFFFFF`                            | 17.82:1 | 4.5:1          | Pass                                       |
| `#14181D` ink / `#FAF9F6` paper                      | 16.93:1 | 4.5:1          | Pass                                       |
| `#14181D` ink / `#F3F2EE` surface-2                  | 15.91:1 | 4.5:1          | Pass                                       |
| `#3F4754` ink-2 / `#FFFFFF`                          | 9.37:1  | 4.5:1          | Pass                                       |
| `#3F4754` ink-2 / `#FAF9F6`                          | 8.90:1  | 4.5:1          | Pass                                       |
| `#57606E` meta / `#FFFFFF`                           | 6.36:1  | 4.5:1          | Pass                                       |
| `#57606E` meta / `#FAF9F6`                           | 6.04:1  | 4.5:1          | Pass                                       |
| `#57606E` ad label / `#F3F2EE`                       | 5.67:1  | 4.5:1          | Pass                                       |
| `#4463AD` link / `#FFFFFF`                           | 5.78:1  | 4.5:1          | Pass                                       |
| `#4463AD` link / `#FAF9F6`                           | 5.49:1  | 4.5:1          | Pass                                       |
| `#4463AD` link / `#F3F2EE`                           | 5.16:1  | 4.5:1          | Pass                                       |
| `#35508F` hover / `#FFFFFF`                          | 7.79:1  | 4.5:1          | Pass                                       |
| `#35508F` hover / `#FAF9F6`                          | 7.40:1  | 4.5:1          | Pass                                       |
| `#C0121F` kicker / `#FFFFFF`                         | 6.27:1  | 4.5:1          | Pass                                       |
| `#C0121F` kicker / `#FAF9F6`                         | 5.96:1  | 4.5:1          | Pass                                       |
| `#35508F` pill text / `#EFF2FA` pill bg              | 6.96:1  | 4.5:1          | Pass                                       |
| `#FFFFFF` / `#4463AD` (primary button)               | 5.78:1  | 4.5:1          | Pass                                       |
| `#FFFFFF` / `#14181D` (footer headings)              | 17.82:1 | 4.5:1          | Pass                                       |
| `#C7D0E2` / `#14181D` (footer links)                 | 11.50:1 | 4.5:1          | Pass                                       |
| `#AEB9CF` / `#14181D` (footer meta)                  | 9.03:1  | 4.5:1          | Pass                                       |
| `#F6EF49` / `#14181D` (yellow on dark — decor/focus) | 14.74:1 | 3:1 (UI)       | Pass                                       |
| `#ED2024` / `#FFFFFF` (large text / UI accents only) | 4.35:1  | 3:1 (large/UI) | Pass — **banned below 24px / 18.5px bold** |
| `#838C9B` / `#FFFFFF` (functional borders)           | 3.39:1  | 3:1 (UI)       | Pass                                       |
| `#838C9B` / `#FAF9F6`                                | 3.22:1  | 3:1 (UI)       | Pass                                       |
| `#838C9B` / `#F3F2EE`                                | 3.03:1  | 3:1 (UI)       | Pass                                       |
| `#6E85C3` / `#FFFFFF`                                | 3.62:1  | —              | Decorative only by policy; never text      |

**Hard bans:** yellow never carries text anywhere; periwinkle never carries text; `#ED2024` never appears below 24px (18.5px bold); white-on-`#ED2024` never used for text (4.35 < 4.5).

---

## 2. Typography

### 2.1 Pairing (Google Fonts; both cover `latin-ext` incl. Ș/ș/Ț/ț U+0218–021B comma-below)

- **Source Serif 4** (variable) — all headlines, article body, standfirst, blockquotes. Weights: **400, 600, 700 + 400 italic**.
- **Inter** (variable) — everything UI: nav, kickers, bylines, meta, chips, buttons, forms, footer, ad label. Weights: **400, 500, 600, 700**.

Load via `next/font/google` with `subsets: ['latin', 'latin-ext']`, `display: 'swap'`, exposed as `--font-serif` / `--font-sans`. No third font, ever. Fallback stacks: `Georgia, 'Times New Roman', serif` and `system-ui, -apple-system, 'Segoe UI', sans-serif`.

### 2.2 Type scale (px; line-height in px; mobile → ≥768px)

| Token        | Mobile | ≥768px | Font / weight              | Tracking | Usage                                           |
| ------------ | ------ | ------ | -------------------------- | -------- | ----------------------------------------------- |
| `display`    | 28/34  | 40/46  | Serif 700                  | −0.015em | Home hero headline                              |
| `h1`         | 26/32  | 36/44  | Serif 700                  | −0.01em  | Article page title                              |
| `h2`         | 21/27  | 26/33  | Serif 700                  | −0.005em | Home section heads, article subheads            |
| `h3`         | 18/24  | 20/26  | Serif 600                  | 0        | Standard feed-item title                        |
| `h4`         | 16/21  | 17/23  | Serif 600                  | 0        | Rail / compact list titles                      |
| `standfirst` | 18/28  | 20/32  | Serif 400, `--color-ink-2` | 0        | Article lead paragraph                          |
| `body`       | 17/29  | 18/31  | Serif 400, `--color-ink`   | 0        | Article body text                               |
| `excerpt`    | 15/23  | 15/23  | Sans 400, `--color-ink-2`  | 0        | Feed-item excerpts                              |
| `ui`         | 15/22  | 15/22  | Sans 400/500               | 0        | Generic UI text, forms                          |
| `nav`        | 14/20  | 14/20  | Sans 600                   | 0        | Category nav (sentence case)                    |
| `button`     | 15/20  | 15/20  | Sans 600                   | 0        | Buttons                                         |
| `meta`       | 13/18  | 13/18  | Sans 400, `--color-ink-3`  | 0        | Dates, captions, credits                        |
| `kicker`     | 12/16  | 12/16  | Sans 700, UPPERCASE        | +0.08em  | Category kickers, section labels, „Publicitate” |

### 2.3 Serif vs sans rules

- **Serif** = editorial voice: any headline, article body, standfirst, blockquotes, „NewsRomania” when set as text.
- **Sans** = machinery: navigation, all metadata (kickers, bylines, dates, source pills), buttons, chips, footer, ad labels, forms.
- Article body column: `max-width: 680px` (~66ch at 18px) — never wider.
- Article prose links: always underlined, `#4463AD`, `text-underline-offset: 3px`. Blockquote: 4px `#6E85C3` left bar, serif 400 italic 20/32, on `--color-surface-2`, padding 16px 20px.

---

## 3. Layout

### 3.1 Container & grid

- Container: `max-width: 1200px`, centered; inline padding **16px** mobile, **24px** ≥768px.
- Grid: 12 columns, **24px** gutters ≥1024px; single column below 768px; 768–1023px uses the same two-zone split at 7/5 columns.
- Content/rail split ≥1024px: **8 cols content + 4 cols rail**.

### 3.2 Header (zero JavaScript, mobile-first)

Stack, top to bottom:

1. **Tricolor bar** — 3px, full-width gradient (§1.3). Static, always at page top.
2. **Masthead** — `#FFFFFF`; height 64px mobile / 88px desktop. `logo-full.png` left-aligned, rendered height 36px mobile / 48px desktop, links to `/`, `alt="NewsRomania"`. Right-aligned: **„Caută” search link** — 44×44px target, magnifier icon 20px stroke `#57606E` (decorative; accessible name „Caută”), links to `/cautare` (a page, not a dropdown — zero JS); desktop additionally shows the current date left of it in `meta` style, Romanian long form — „luni, 6 iulie 2026”. Bottom edge: **2px solid `#14181D`** (the fold rule).
3. **Category nav** — `#FFFFFF`, `position: sticky; top: 0; z-index: 50` (pure CSS), height 48px, bottom edge 1px `#E3E0D9`. Exactly 8 links: **Actualitate, Politică, Economie, Internațional, Sport, Sănătate, Tehnologie, Cultură**. Style: `nav` token, `--color-ink`; each link `padding: 14px 12px` → 48px tall tap target (≥44px). Hover: color `--color-link`. Current section (server-rendered via pathname): color `--color-ink` + inset 3px `#ED2024` bottom bar (`box-shadow: inset 0 -3px 0 #ED2024`).
   - **Mobile:** single row, `overflow-x: auto`, `scrollbar-width: none` (+ `::-webkit-scrollbar { display: none }`), `-webkit-overflow-scrolling: touch`, 24px right-edge fade (`mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent)`) hinting scrollability. No hamburger, no JS.

### 3.3 Home page structure

1. **Hero band** (under nav, 32px top padding): desktop 8+4.
   - **Featured story (8 cols):** 16:9 image full cell width → kicker → `display` title → `standfirst` (2-line clamp) → meta row (byline or source pill per §4). Featured slot always prefers an original article.
   - **„Cele mai noi” rail (4 cols):** `kicker`-style header + 5 compact items (`h4` title + meta), hairline-divided, no images. Mobile: hero stacks first, rail list follows.
2. **Section rule** between bands: full-width 1px `#14181D` line with a 48×3px `#ED2024` segment flush left, `h2` serif section title 12px below (e.g. „Politică”).
3. **Main feed (8 cols):** chronological feed rows (§3.4); in-feed AdSlot after row 4 and after row 12.
4. **Rail (4 cols):** AdSlot 300×250, then „Cele mai citite” numbered list (5 × `h4`, ordinal serif 700 20px `#C0121F`). Rail list block only is `position: sticky; top: 64px` — **never** the ad.
5. **Pagination:** centered bordered button „Pagina următoare →” (`button` token, 1px `#838C9B` border, 44px height, hover border+text `--color-link`). Server-side pagination (`?page=2`), no infinite scroll, no JS.
6. **Leaderboard AdSlot** (desktop only) between hero band and main feed (§4.5).

### 3.4 Feed item layout — LIST, not cards

Broadsheet digest rows on the paper background; no boxes, no shadows.

- Row = CSS grid `grid-template-columns: 1fr auto`, `gap: 16px`, `padding-block: 20px`, `border-bottom: 1px solid #E3E0D9`. Last row borderless.
- **Text zone (left):** kicker → `h3` title → excerpt (**≥768px only**, 2-line clamp) → meta/attribution row (§4).
- **Thumb (right):** 16:9, `112×63` mobile / `220×124` desktop, treatment per §5. Top-aligned with the kicker.
- The row is NOT one link; the title is the link (image wrapped in the same `<a>` with `tabindex="-1" aria-hidden="true"` to avoid double tab stops).

### 3.5 Article pages

- Reading column 680px on `--color-surface` white; `h1` → meta block → standfirst → lead image → body.
- **Original:** byline row per §4.1; dates per §4.6.
- **Aggregated:** source pill row per §4.2; short fair-use excerpt only, never full text; page ends with a full-width link-button: **„Citește articolul integral pe {Sursă} ↗”** — white text on `#4463AD`, height 48px, radius 2px, hover `#35508F`, `target="_blank" rel="noopener nofollow"`, visually-hidden suffix „(link extern către {Sursă})”.
- **In-article AdSlot:** one after the 3rd paragraph and one at article end (§4.5). Hard rule: **an ad never sits between the title and the byline/attribution row.**

### 3.6 Footer

`#14181D` background, 48px top padding, 3px tricolor bar as its top edge (mirror of the page top).

1. **Brand row:** `logo-symbol.png` at 40px + „NewsRomania” serif 700 20px `#FFFFFF` + tagline „Știri din România, la zi.” sans 15px `#C7D0E2`.
2. **Link columns** (stacked mobile, 3 columns ≥768px): **Categorii** (the 8 nav links), **Informații** (Despre noi, Contact, Politica de confidențialitate, Politica de cookies, Termeni și condiții), **Surse** (text: „Materialele agregate sunt prezentate ca extrase scurte, cu atribuire și legătură către publicația-sursă.”). Links `#C7D0E2`, `padding-block: 10px` (≥44px targets), hover: `#FFFFFF` with 2px underline `text-decoration-color: #F6EF49`.
3. **Legal bar:** 1px `rgba(255,255,255,.15)` rule, then „© 2026 NewsRomania · Conținutul preluat aparține surselor citate.” in `#AEB9CF` 13px.

---

## 4. Components

### 4.1 ArticleCard — ORIGINAL

```
[KICKER: POLITICĂ]                      ┌──────────┐
Titlu serif pe două rânduri maxim…      │ 16:9 img │
Excerpt sans, două rânduri, doar        └──────────┘
pe desktop…
de Ana Ionescu · acum 3 ore
```

- Kicker: category name, `kicker` token, `#C0121F`, links to the category page.
- Title: `h3` serif `--color-ink`, links to the on-site article.
- Meta row: „de” sans 400 13px `#57606E` + **author name sans 600 13px `#14181D`** + „ · ” + `<time>` 13px `#57606E`.

### 4.2 ArticleCard — AGGREGATED

```
[KICKER: ECONOMIE]                      ┌──────────┐
Titlu serif cu săgeată externă ↗        │ 16:9 img │
Excerpt scurt (fair-use)…               └──────────┘
( Sursa: Digi24 ↗ ) · acum 2 ore
```

- Kicker: identical to original (category taxonomy is never corrupted by type differentiation).
- Title: `h3` serif `--color-ink` + trailing inline **↗ SVG** (0.65em, `#57606E`, `margin-left: 6px`, `#4463AD` on hover, `aria-hidden="true"`); a visually-hidden „(link extern către {Sursă})” follows for screen readers — the source is **named**. Links to the **source URL**, `target="_blank" rel="noopener nofollow"`.
- **Source pill replaces the byline**: `inline-flex`, height 24px, `padding: 2px 10px`, `border-radius: 999px`, bg `#EFF2FA`, border 1px `#C9D4EC`, text „Sursa: Digi24” sans 600 12px `#35508F` (6.96:1) + 12px ↗ icon same color. Followed by „ · ” + `<time>`.
- Hard rule: an original card **never** shows a pill; an aggregated card **never** shows a person's byline. Three redundant signals — pill vs. byline, ↗ vs. none, external vs. internal link — so the grammar survives color-blindness and skim-reading: **persoană = al nostru, pastilă + săgeată = extern.**

### 4.3 CategoryChip (category pages / filters)

Pill: `border-radius: 999px`, `padding: 0 16px`, `min-height: 44px` mobile / 36px desktop (4px outer margin keeps the ≥44px hit area), border 1px `#C9CFDA` (decorative), bg `#FFFFFF`, text sans 600 14px `#14181D`. Hover: border + text `#35508F`. Active (current category): bg `#14181D`, text `#FFFFFF`, no border. Mobile chips row: same horizontal-scroll pattern as the nav.

### 4.4 Badge „ACUM” (breaking, sparing use)

White-on-`#ED2024` is 4.35:1 (< 4.5 small text), so the badge inverts: white bg, **1.5px border `#ED2024`**, text „ACUM” `kicker` token in `#C0121F` (6.27:1). Red stays a frame, never small-text ink.

### 4.5 AdSlot — labelled, reserved, honest

- Wrapper: bg `#F3F2EE`, border 1px `#E3E0D9`, `border-radius: 2px`.
- Label: „Publicitate” — sans 600 **11px** uppercase, tracking +0.10em, `#57606E` (5.67:1 on `#F3F2EE`), centered, in a fixed 24px label row at the top. Always rendered, filled or not.
- **Fixed heights (zero CLS), set in CSS, never collapsed:**
  - `inFeed`, `rail`, `inArticle` (300×250 unit): wrapper `height: 298px` (24 label + 250 slot + 24 padding) at all breakpoints.
  - `leaderboard` (728×90, desktop only, once between hero band and main feed): wrapper `height: 138px`, `display: none` below 768px (mobile gets no leaderboard).
- Placement ethics: never between a title and its byline/attribution; never mimicking article anatomy; positions fixed at §3.3 (feed rows 4 & 12, rail) and §3.5 (after 3rd paragraph, article end).
- Pre-approval state (AdSense review pending): wrapper + label render exactly as above with an inert `<ins class="adsbygoogle" data-ad-client="ca-pub-8098077913729716">` — flat `#F3F2EE` field, **no fake content, no skeleton shimmer, no „în curând”.**
- Blending without deception: shares the site's hairline color and 2px radius, but it is the **only** feed element with filled background + border + „Publicitate” label, and it never uses serif type or card anatomy.

### 4.6 Dates & meta

- Always `<time datetime="…">`. Under 24h: relative Romanian — „acum 15 minute”, „acum 3 ore”. Otherwise feeds use „6 iul. 2026”; article pages „6 iulie 2026, 14:30” plus, when edited, „Actualizat: 6 iulie 2026, 16:05”.
- All meta: sans 400 13px `#57606E`. Separators: „ · ” (interpunct), never pipes.

---

## 5. Imagery

### 5.1 Thumbnails & article images

- Ratio: **16:9 everywhere** (feed thumbs, hero, article lead, OG) via `aspect-ratio: 16 / 9` boxes — images never dictate layout height (CLS = 0).
- Treatment: `border-radius: 2px` (near-square print register), `object-fit: cover`, protective keyline `box-shadow: inset 0 0 0 1px rgba(20,24,29,.08)` on the wrapper so white-heavy photos don't bleed into the paper.
- Loading: hero/lead = `priority`; everything else `loading="lazy"` with proper `sizes`. `alt` mandatory on all content images.
- Captions (article pages): sans 13px `#57606E`, `padding-top: 8px`; photo credit appended as „Foto: Agerpres”.

### 5.2 Branded category placeholder (missing image)

One reusable component, single treatment site-wide (restraint over per-category art):

- Box: `aspect-ratio: 16/9`, bg `#EFF2FA`, 2px radius + keyline as above.
- Motif: the ring symbol redrawn as a **monochrome inline SVG** (single color `#6E85C3`, three arcs as paths), `opacity: 0.14`, scaled to **130% of container width**, anchored `right: -18%; bottom: -38%` — only the sweeping arcs crop into frame: a watermark, not a logo slap.
- Label: category name bottom-left, `kicker` token, `#35508F` (6.96:1 on the tint), 12px inset.
- `aria-hidden="true"` on the SVG; the item's text carries all meaning.

### 5.3 OG / social card

1200×630, `#FFFFFF` bg, `logo-full.png` centered at 56% width, 6px tricolor bar along the bottom edge. Generated once as a static asset (sharp) from `assets/logo-full.png`. Favicon/app icons derived from `assets/logo-symbol.png` (sharp + png-to-ico).

---

## 6. Motion & interaction

Broadsheet restraint: **color moves, nothing else.** No lifts, no shadows, no image zooms, no parallax, no autoplay, no carousels, no scroll animations.

- Transition recipe (the only one): `transition: color 150ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out, text-decoration-color 150ms ease-out;`
- **Hover gating:** all hover styles wrapped in `@media (hover: hover) and (pointer: fine)` — touch devices never see sticky hover states.
- **Touch feedback:** `:active { opacity: 0.85 }` on interactive elements — instant, no JS.
- **Feed/hero titles:** rest = ink, no underline. Hover = 2px underline, `text-decoration-color: #4463AD`, `text-underline-offset: 3px`; text stays ink.
- **Nav links:** rest ink → hover `#4463AD`; active section keeps its static 3px red bar (no animation).
- **Buttons:** primary = `#4463AD` bg / white text → hover `#35508F`; secondary = white bg, 1px `#838C9B` border, ink text → hover border+text `#35508F`. Height 44px, radius 2px.
- **Body links:** underlined `#4463AD` → hover `#35508F`.
- **Focus:** `:focus-visible { outline: 2px solid #4463AD; outline-offset: 2px; }` on all interactive elements; inside the dark footer, `outline-color: #F6EF49` (14.74:1). Never `outline: none` without replacement. Keyboard order follows DOM; skip link „Sari la conținut” is the first focusable element (visually hidden until focused, then a white pill on `#14181D`).
- **`prefers-reduced-motion: reduce`:** one global block — `*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }`. State changes remain (colors flip instantly); nothing depends on animation to be understood.
- Sticky nav is CSS-only (`position: sticky`); the entire header/nav/footer system functions with JavaScript disabled.
