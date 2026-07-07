# NewsRomania — Design Direction v2: „Prim-Plan Tricolor” (magazin vizual modern)

**Status: final, zero open decisions. Every value is exact and implementable as written.**
Replaces v1 „Broadsheet Tricolor” (`docs/design-direction.md`, now marked superseded) after owner
rejection. Register: **visual-first magazine-modern** — energy comes from real publisher
photography, not ornament. Photos dominate (large 16:9 thumbs, gradient-overlay titles on featured
cards), tight all-sans typographic system, chip-based category nav, and a hard
hero/secondary/list tier hierarchy. 2025-grade news portal (Digi24/Ziare.com class;
TheVerge-clean, zero newspaper nostalgia).

Base direction: „Prim-Plan Tricolor — magazin vizual modern”, with grafts from the two competing
v2 candidates where they were superior:

- **From „Prisma Tricolor”:** the verified production-data dependency flag (§5.1 — `image_url` is
  empty for ALL 86 aggregated rows in prod today; ingest must populate it before photos show);
  the `SmartImage` broken-hotlink fallback contract (§5.1); the `next/font` subset build-guard
  note (§2.1).
- **From the sibling „Prim-Plan” candidate:** the `logo-symbol` brand mark persisting inside the
  sticky chip nav (§3.2.3); the disclaimer line under the aggregated CTA (§3.5.2); the explicit
  rule that the `AdPlacement`/`AdSlotVariant` unions keep `'rail'` while the UI never renders it
  (§4.4 — architecture signatures stay fixed).

Every contrast ratio in §1.3 was **independently recomputed** with the WCAG 2.1
relative-luminance formula during art direction (script, not eyeballed). Two numbers in the base
proposal were corrected: `#ED2024` on `#F2F4F8` is **3.95:1** (not 4.02) — still passes the 3:1
UI bar — and overlay-card text sits on a dedicated text panel (`rgba(10,16,27,0.85)`, §5.2) whose
worst-case composite over a pure-white photo is **`#2F343D`** (12.53:1 white / 9.26:1
overlay-meta / 10.36:1 yellow focus ring). All pairs pass AA.

## Owner verdict → v2 response (acceptance mapping)

1. **„full width and no sidebar”** → the 8+4 content/rail split is DELETED. One full-width card
   grid (§3.1/§3.3); „Cele mai citite” survives as a full-width horizontal band (§3.3.5); the
   rail ad is replaced by in-feed ad cards and article-page slots.
2. **„click → news page → button «continue reading on <sursa>»”** → ALL feed cards (both types)
   link **internally** to `/stiri/<slug>` (the only article route in the app). The external link
   exists ONLY on the aggregated article page as the prominent button „Citește articolul integral
   pe {Sursă}” (§3.5.2), `target="_blank" rel="noopener noreferrer nofollow"`.
   `<link rel="canonical">` keeps pointing to the publisher. **Tests that encode v1's external
   card links must be updated deliberately** (see §7).
3. **„that page should also have publicity”** → aggregated article pages get three slots exactly
   like originals: top responsive banner, in-article, end-of-article (§3.5, §4.4).
4. **„not modern at all”** → broadsheet dropped: cool near-white canvas, white elevated cards with
   14px radius and soft shadows, all-sans Archivo/Inter system, image-led cards, chip nav,
   gradient-overlay hero.
5. **„where are the photos”** → every card/hero/lead renders the REAL publisher photo from
   `aggregated-items.imageUrl` (hotlinked; only RSS `enclosure`/`media:content` or the
   owner-approved backfill — never scraped article HTML), gated on `imageAllowed`. Branded
   placeholder only when missing/disallowed/broken (§5). **Prod dependency:** `image_url` is
   currently empty on all 86 aggregated rows — the ingest pipeline must populate it (§5.1)
   before this design shows photos; the design degrades gracefully to placeholders until then.

Logo facts unchanged: `assets/logo-full.png` (tricolor ring + blue distressed wordmark, for light
ground) → masthead + OG; `assets/logo-symbol.png` (three-arc ring) → favicon, sticky-nav mark,
placeholder motif.

---

## 1. Color tokens

Token **names** are identical to `src/app/(frontend)/globals.css` `@theme` — only VALUES change;
four new extended tokens are appended (additive; no existing name is renamed or removed). Palette
shifts from warm paper to a cool, contemporary neutral system so white cards and photos pop.

### 1.1 Contract tokens

| Token | v2 value | Role |
|---|---|---|
| `--color-page` | `#F2F4F8` | Page canvas (cool near-white; makes white cards read as elevation) |
| `--color-surface` | `#FFFFFF` | Cards, masthead, chip nav, article reading surface |
| `--color-border` | `#E2E6ED` | Decorative hairlines: card borders, nav bottom, dividers |
| `--color-ink` | `#10161F` | Headlines, body, primary text, active-chip bg, footer bg |
| `--color-ink-secondary` | `#3C4655` | Excerpts, standfirst, secondary text |
| `--color-ink-muted` | `#556170` | Meta: timestamps, captions, „Publicitate” label, credits |
| `--color-link` | `#2E5AAE` | Links, primary buttons/CTA, hover accents (modernized brand blue) |
| `--color-link-hover` | `#234684` | Link/button hover + active |
| `--color-focus` | `#2E5AAE` | `:focus-visible` outline on light surfaces (`#F6EF49` on ink/overlay) |
| `--color-brand-blue` | `#4463AD` | The literal logo blue — brand/decorative use (wordmark-adjacent, tricolor bar); text UI uses `link` |
| `--color-brand-periwinkle` | `#6E85C3` | Decorative only — placeholder ring motif; never text |
| `--color-brand-yellow` | `#F6EF49` | Overlay kicker-chip bg (with ink text), footer hover underline, focus on dark; never text-color |
| `--color-brand-red` | `#ED2024` | Non-text only: tricolor bar, section-head accent bar; banned as text below 24px/18.5px bold |
| `--color-accent-bg` | `#E9EEF9` | Source-pill bg, chip hover bg, placeholder gradient start |

### 1.2 Extended tokens (existing names, new values + 4 additions)

| Token | v2 value | Role |
|---|---|---|
| `--color-surface-2` | `#EEF1F6` | AdSlot well, blockquote well |
| `--color-red-text` | `#C0121F` | Category kicker text (AA-safe deep red), numerals in „Cele mai citite” |
| `--color-pill-text` | `#2E5AAE` | Text inside `accent-bg` source pills |
| `--color-border-strong` | `#10161F` | Section rules where used |
| `--color-border-functional` | `#7C8695` | Form inputs, pagination borders — meaning-bearing (≥3:1 on all three light surfaces) |
| `--color-border-pill` | `#C9D6EE` | Source-pill border (decorative) |
| `--color-footer-link` | `#C3CDE0` | Footer links on ink |
| `--color-footer-meta` | `#94A0B5` | Footer © /meta on ink |
| `--color-scrim` **(new)** | `#0A101B` | Gradient-overlay base color on featured/secondary overlay cards |
| `--color-ink-inverse` **(new)** | `#FFFFFF` | Titles/text on scrim and dark surfaces |
| `--color-overlay-meta` **(new)** | `#D7DEE9` | Meta text on scrim |
| `--color-accent-bg-strong` **(new)** | `#DBE3F2` | Placeholder gradient end |

### 1.3 Contrast — independently recomputed (WCAG 2.1 relative luminance); all pass

| Foreground / Background | Ratio | Req. | Verdict |
|---|---|---|---|
| `#10161F` ink / `#FFFFFF` | 18.16:1 | 4.5 | Pass |
| `#10161F` ink / `#F2F4F8` page | 16.49:1 | 4.5 | Pass |
| `#10161F` ink / `#EEF1F6` surface-2 | 16.04:1 | 4.5 | Pass |
| `#3C4655` ink-secondary / `#FFFFFF` | 9.55:1 | 4.5 | Pass |
| `#3C4655` / `#F2F4F8` | 8.67:1 | 4.5 | Pass |
| `#3C4655` / `#EEF1F6` | 8.43:1 | 4.5 | Pass |
| `#556170` ink-muted / `#FFFFFF` | 6.31:1 | 4.5 | Pass |
| `#556170` / `#F2F4F8` | 5.73:1 | 4.5 | Pass |
| `#556170` ad label / `#EEF1F6` | 5.57:1 | 4.5 | Pass |
| `#2E5AAE` link / `#FFFFFF` | 6.58:1 | 4.5 | Pass |
| `#2E5AAE` / `#F2F4F8` | 5.98:1 | 4.5 | Pass |
| `#2E5AAE` / `#EEF1F6` | 5.81:1 | 4.5 | Pass |
| `#234684` hover / `#FFFFFF` | 9.21:1 | 4.5 | Pass |
| `#FFFFFF` / `#2E5AAE` (CTA button) | 6.58:1 | 4.5 | Pass |
| `#FFFFFF` / `#234684` (CTA hover) | 9.21:1 | 4.5 | Pass |
| `#C0121F` kicker / `#FFFFFF` (image chip) | 6.27:1 | 4.5 | Pass |
| `#C0121F` / `#F2F4F8` | 5.70:1 | 4.5 | Pass |
| `#C0121F` / `#EEF1F6` | 5.54:1 | 4.5 | Pass |
| `#2E5AAE` pill-text / `#E9EEF9` accent-bg | 5.66:1 | 4.5 | Pass |
| `#2E5AAE` pill-text / `#DBE3F2` accent-bg-strong | 5.10:1 | 4.5 | Pass |
| `#10161F` ink / `#F6EF49` yellow chip | 15.01:1 | 4.5 | Pass |
| `#FFFFFF` title / overlay text panel (α=0.85 over pure-white photo → composite `#2F343D`) | 12.53:1 | 4.5 | Pass |
| `#D7DEE9` overlay-meta / same panel worst case | 9.26:1 | 4.5 | Pass |
| `#F6EF49` focus ring / same panel worst case | 10.36:1 | 3 (UI) | Pass |
| `#FFFFFF` / `#10161F` (footer, active chip) | 18.16:1 | 4.5 | Pass |
| `#C3CDE0` footer-link / `#10161F` | 11.35:1 | 4.5 | Pass |
| `#94A0B5` footer-meta / `#10161F` | 6.88:1 | 4.5 | Pass |
| `#7C8695` border-functional / `#FFFFFF` | 3.68:1 | 3 (UI) | Pass |
| `#7C8695` / `#F2F4F8` | 3.35:1 | 3 (UI) | Pass |
| `#7C8695` / `#EEF1F6` | 3.25:1 | 3 (UI) | Pass |
| `#2E5AAE` focus ring / `#F2F4F8` | 5.98:1 | 3 (UI) | Pass |
| `#F6EF49` focus/decor / `#10161F` | 15.01:1 | 3 (UI) | Pass |
| `#ED2024` accent bar / `#FFFFFF` | 4.35:1 | 3 (UI) | Pass — non-text only |
| `#ED2024` / `#F2F4F8` | 3.95:1 | 3 (UI) | Pass — non-text only |

**Hard bans (unchanged in spirit):** yellow and periwinkle never carry text; `#ED2024` never below
24px (18.5px bold) and never as text bg for white text; overlay text only inside the §5.2 text
panel (`rgba(10,16,27,0.85)` + blur) — the gradient scrim is decorative and never the contrast
backing, so every glyph gets the α=0.85 composite regardless of clamped line count/breakpoint.

---

## 2. Typography

### 2.1 Pairing (Google Fonts via `next/font/google`, `subsets: ['latin','latin-ext']` — full Ș/ș/Ț/ț U+0218–021B comma-below coverage, `display: 'swap'`)

- **Archivo** (variable) — headlines only: display, h1–h4, section heads, footer wordmark. Weights
  **600, 700, 800**. Exposed as `--font-archivo` → mapped to the `--font-serif` slot in
  `@theme inline` (the token NAME stays; v2 fills it with the display face — one-line comment in
  globals.css noting this, so every existing `font-serif` utility becomes the headline face with
  zero component-contract churn).
- **Inter** (variable) — everything else: body, excerpts, UI, nav chips, buttons, meta, forms,
  footer. Weights **400, 500, 600, 700**. Exposed as `--font-inter` → `--font-sans`.
- Fallbacks: `system-ui, -apple-system, 'Segoe UI', sans-serif` for both. No third font, ever. No
  serif anywhere.
- Guard: `next/font` fails the build if a subset is unsupported — that is the diacritics guard;
  do not bypass it.

### 2.2 Scale (px size/line-height; mobile → ≥768px)

| Token | Mobile | ≥768px | Face/weight | Tracking | Usage |
|---|---|---|---|---|---|
| `display` | 26/31 | 40/45 | Archivo 800 | −0.02em | Hero overlay title |
| `h1` | 28/34 | 38/44 | Archivo 800 | −0.015em | Article page title |
| `h2` | 22/28 | 28/34 | Archivo 700 | −0.01em | Section heads, article subheads, secondary overlay titles ≥1024 |
| `h3` | 17/23 | 19/25 | Archivo 700 | −0.005em | Standard card titles |
| `h4` | 15/20 | 16/21 | Archivo 600 | 0 | List-tier titles („Cele mai citite”, search) |
| `standfirst` | 18/28 | 20/32 | Inter 500, `ink-secondary` | 0 | Article lead / aggregated excerpt block |
| `body` | 17/28 | 18/30 | Inter 400, `ink` | 0 | Original article body |
| `excerpt` | 14/21 | 15/22 | Inter 400, `ink-secondary` | 0 | Card excerpts |
| `ui` | 14/20 | 14/20 | Inter 500 | 0 | Generic UI, forms |
| `nav` | 14/20 | 14/20 | Inter 600 | 0 | Chip labels |
| `button` | 15/20 | 15/20 | Inter 600 | 0 | Buttons; CTA uses 16/22 |
| `meta` | 13/18 | 13/18 | Inter 500, `ink-muted` | 0 | Dates, captions, credits, source names |
| `kicker` | 11/14 | 11/14 | Inter 700 UPPERCASE | +0.06em | Category chips on images, „Publicitate”, section labels |

Rules: article prose links always underlined `link`, `text-underline-offset: 3px`.
Original-article body column `max-width: 680px`. Blockquote: 4px `brand-periwinkle` left bar,
Inter 500 italic 18/30, on `surface-2`, radius 10px, padding 16px 20px. Dates/meta formats keep
v1 §4.6 verbatim (relative under 24h „acum 3 ore”; „7 iul. 2026” in feeds; „7 iulie 2026, 14:30”
on articles; interpunct separators; always `<time datetime>`).

---

## 3. Layout

### 3.1 Container & grid — FULL WIDTH, NO SIDEBAR

- Container: `max-width: 1280px`, centered; inline padding **16px** base, **24px** ≥768px,
  **32px** ≥1280px.
- **Card grid** (home, category): `display: grid; gap: 16px` base, `24px` ≥768px. Columns:
  **1** below 640px · **2** at ≥640px · **3** at ≥1024px and up. No rail, no 8+4 split anywhere.
  The „Cele mai noi” rail and the rail AdSlot are removed from the home page.

### 3.2 Header v2 (zero JS, mobile-first)

1. **Tricolor bar** — 3px full-width,
   `linear-gradient(90deg, #4463AD 0 33.4%, #F6EF49 33.4% 66.7%, #ED2024 66.7% 100%)`
   (unchanged — brand signature).
2. **Masthead** — `surface`; height 60px mobile / 72px ≥768px; `logo-full.png` left, rendered
   height 32px / 40px, links `/`, `alt="NewsRomania"`; right: desktop current date in `meta`
   style („marți, 7 iulie 2026”) + „Caută” link — 44×44px target, 20px magnifier stroke
   `ink-muted`, accessible name „Caută”, → `/cautare`. Bottom edge 1px `border` (no black fold
   rule — that was broadsheet).
3. **Chip nav (sticky)** — `position: sticky; top: 0; z-index: 50`; height 56px; background
   `rgba(255,255,255,0.92)` + `backdrop-filter: blur(8px)` (solid `#FFFFFF` fallback via
   `@supports not (backdrop-filter: blur(1px))`); bottom 1px `border`. Content, left→right:
   **`logo-symbol.png` 28px** link `/` (`shrink-0` — brand persists while the masthead has
   scrolled away), then a single row of **CategoryChips** (§4.2) for the 8 categories —
   Actualitate, Politică, Economie, Externe, Sport, Sănătate, Tehnologie, Cultură — vertically
   centered. Active chip = current section (server-rendered from pathname). Overflow (any
   width — the row can also overflow between 768px and ~900px): `overflow-x: auto`, hidden
   scrollbars, `-webkit-overflow-scrolling: touch`, 24px right fade
   `mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent)` applied at EVERY
   breakpoint (invisible when the row fits — the last 24px are empty). No hamburger, no JS.

### 3.3 Home structure (top → bottom)

1. **Hero band** (24px top padding). ≥1024px: grid
   `grid-template-columns: minmax(0,2fr) minmax(0,1fr); grid-template-rows: repeat(2, minmax(0,1fr)); gap: 24px`.
   **Featured overlay card** (§4.1c) in col 1 spanning both rows, `aspect-ratio: 16/9` (sets band
   height ≈447px at max container); **two secondary overlay cards** fill col 2 rows 1–2 (stretch,
   no own aspect-ratio, `min-height: 0`). 768–1023px: featured full-width 16:9, then the two
   secondaries in a 2-col row, each 16:9. <768px: all three stacked full-width; featured
   `aspect-ratio: 4/3`, secondaries 16:9. Slot 1 prefers the latest original article; slots 2–3
   next-freshest items.
2. **Banner AdSlot** (§4.4 `leaderboard` variant, now responsive), 24px below hero — fixed height
   per breakpoint, zero CLS.
3. **Section head „Ultimele știri”** — `h2` preceded by an inline `4px × 20px` rounded
   (`radius 2px`) `brand-red` bar, 10px gap; 32px top margin, 16px bottom.
4. **Main card grid** — chronological FeedItems as standard ArticleCards (§4.1a), 12 content
   cards per page. **In-feed ad cards** (§4.4 `feed`) occupy ordinary grid cells at
   server-decided positions (`AdDecision`; frequencies from `site-config.adFrequency` — shipped
   defaults: RO every 5th, UK every 3rd, default every 4th).
5. **„Cele mai citite” band** — after the grid: full-width `surface` panel, radius 16px, border
   1px `border`, padding 20px / 24px ≥768px; `h2` section head (red bar as above); 5 list-tier
   items (§4.1d) — grid `repeat(5, 1fr)` ≥1024px, horizontal scroll-snap row below (each item
   `min-width: 240px`).
6. **Pagination** (§4.5), 40px block margin.

### 3.4 Category & search pages

- Category: header block (32px top): category name `h1` + item count `meta`; then the same
  full-width card grid + in-feed ads + pagination. The sticky chip nav already shows the active
  chip — no duplicate chip row.
- Search (`/cautare`): search form (input 48px height, radius 12px, border 1px
  `border-functional`, focus ring per §6) + results as list-tier rows (§4.1d) stacked with 1px
  `border` dividers.

### 3.5 Article pages — `/stiri/<slug>` (reading surface: full-bleed `surface` section on `page` canvas; inner column `max-width: 760px` centered, content column 680px for original body)

**Shared order (both types):** ① **Top banner AdSlot** directly under the sticky nav, inside the
container, 24px vertical margins — *above* the `<article>`, so no ad ever sits between title and
attribution (hard rule kept). ② CategoryChip (small, links to category). ③ `h1`. ④
attribution/meta row. ⑤ lead image — real photo, 16:9, radius 16px, eager +
`fetchpriority="high"`; caption `meta` with credit (aggregated: „Foto: {Sursă}”). ⑥ content. ⑦
end-of-article AdSlot. ⑧ „Mai multe știri” — 3 standard cards from the same category (internal
links).

**3.5.1 Original:** ④ = byline row („de” + author Inter 600 13px `ink` + „ · ” + `<time>`); ⑥ =
standfirst → body (680px column) with **in-article AdSlot after the 3rd paragraph**; dates incl.
„Actualizat:” per §2.2 rules.

**3.5.2 Aggregated** (the owner's flow — card → internal page → external button): ④ = source pill
„Sursa: {X}” (§4.3, non-interactive on the meta row) + „ · ” + `<time>`. ⑥ = fair-use excerpt set
as `standfirst` (NEVER full text) → **primary CTA button**: full-width up to 560px, height 52px,
radius 12px, bg `link`, hover `link-hover`, `:active` opacity .85, text `#FFFFFF` Inter 600
16/22 — „**Citește articolul integral pe {Sursă}**” + trailing 18px ↗ icon (`aria-hidden`),
`target="_blank" rel="noopener noreferrer nofollow"`, visually-hidden suffix „(link extern către
{Sursă} — se deschide în filă nouă)”. Directly beneath the CTA, one `meta` line: „Fragmentul de
mai sus este un rezumat. Articolul integral aparține {Sursă}.” → **in-article AdSlot** below the
CTA block (never between excerpt and CTA — protects against misclicks). `<link rel="canonical">`
→ publisher `sourceUrl` (unchanged). Attribution is visible four times: pill, CTA label,
disclaimer line, photo credit.

### 3.6 Footer v2

Bg `ink`, 3px tricolor bar top edge, 48px top padding. ① Brand row: `logo-symbol.png` 40px +
„NewsRomania” Archivo 700 20px `ink-inverse` + tagline „Știri din România, la zi.” Inter 15px
`footer-link`. ② Link columns (stacked mobile / 3 cols ≥768px): **Categorii** (8 links),
**Informații** (Despre noi, Contact, Politica de confidențialitate, Politica de cookies, Termeni
și condiții, Mențiuni legale, Setări cookies), **Surse** (text: „Materialele agregate sunt
prezentate ca extrase scurte, cu atribuire și legătură către publicația-sursă.”). Links
`footer-link`, `padding-block: 10px` (≥44px targets), hover `#FFFFFF` + 2px underline
`text-decoration-color: var(--color-brand-yellow)`. ③ Legal bar: 1px `rgba(255,255,255,0.14)`
rule + „© 2026 NewsRomania · Conținutul preluat aparține surselor citate.” `footer-meta` 13px.
Focus outlines inside footer: `#F6EF49`.

---

## 4. Components

### 4.1 ArticleCard tiers (`src/components/articles/ArticleCard.tsx` — path unchanged)

**a) Standard card (grid default):** `surface` bg, radius **14px**, border 1px `border`, shadow
`0 1px 2px rgba(16,22,31,0.06), 0 1px 3px rgba(16,22,31,0.04)`, `overflow: hidden`. Anatomy
top→bottom: **photo 16:9** (real image per §5.1) with **category chip overlaid top-left 10px**:
solid `#FFFFFF` pill, radius 999px, padding 3px 10px, `kicker` token in `red-text` (6.27:1); card
body padding 16px: `h3` title 2-line clamp → `excerpt` 2-line clamp (hidden <640px to keep mobile
dense) → meta row 12px top margin. **Meta grammar:** original = „de {Autor}” (Inter 600 13px
`ink`) + „ · ” + `<time>`; aggregated = source pill (§4.3) + „ · ” + `<time>`. **The whole card
links to the internal `/stiri/<slug>` for BOTH types** — title is the real `<a>` stretched over
the card (`::after` inset 0, card `position: relative`; chip has `position: relative; z-index: 1`
above the stretch — one tab stop per card plus the chip); no external arrow, no `target="_blank"`
on cards. Pill vs byline remains the type signal.

**b) Ad card** — see §4.4 `feed`; occupies one grid cell.

**c) Overlay card (hero/secondary):** radius **16px**, `overflow: hidden`, photo fills the box
(`object-fit: cover`), **scrim**:
`linear-gradient(180deg, rgba(10,16,27,0) 40%, rgba(10,16,27,0.55) 62%, rgba(10,16,27,0.88) 100%)`
(base = `--color-scrim`, decorative photo-fade only). Text block absolutely positioned bottom,
padding 20px mobile / 28px featured-desktop, on its own **text panel**: bg
`rgba(10,16,27,0.85)` + `backdrop-blur(6px)` spanning the full card width — the panel (not the
gradient) is the contrast backing for every glyph (worst-case ratios in §1.3):
**kicker chip** bg `brand-yellow`, text `ink` `kicker` token, radius 999px, padding 3px 10px →
title `display` (featured) / `h3` mobile–`h2` ≥1024 (secondary), color `ink-inverse`, 3-line
clamp → meta row `overlay-meta` 13px („Sursa: {X} · acum 2 ore” or „de {Autor} · …”). Whole card
→ internal `/stiri/<slug>`, stretched-link as in (a).

**d) List-tier item („Cele mai citite”, search, compact):** grid `88px 1fr` mobile / `120px 1fr`
≥768px, gap 12px; thumb 16:9 radius 10px (real photo/placeholder); optional rank numeral Archivo
800 20px `red-text` before title; `h4` title 2–3-line clamp + meta row. Internal link,
title-anchor pattern.

### 4.2 CategoryChip (`CategoryChip.tsx`)

Pill radius 999px; height **36px** desktop / **40px** mobile with 4px block margins (≥44px hit
area); padding 0 14px; `nav` token. Rest: bg `surface`, border 1px `#C9D0DB` (decorative — label
carries meaning at 18.16:1), text `ink`. Hover: bg `accent-bg`, border + text `link`. Active
(current category): bg `ink`, text `#FFFFFF`, no border. Small variant on article pages: height
28px, padding 0 10px, `kicker` token `red-text` on `#FFFFFF` with border 1px `border`.

### 4.3 Source pill (aggregated attribution)

`inline-flex`, height 24px, padding 2px 10px, radius 999px, bg `accent-bg`, border 1px
`border-pill`, text „Sursa: {X}” Inter 600 12px `pill-text` (5.66:1). Non-interactive on cards
(the card's single link is internal); on the article page's attribution row it links to the
publisher homepage (`source.url`), `rel="noopener noreferrer nofollow"`, same tab. Hard rule
kept: original never shows a pill; aggregated never shows a person's byline.

### 4.4 AdSlot (`src/components/ads/AdSlot.tsx`) — blends into the grid, labelled, zero-CLS

**Contract preserved:** the `AdSlotVariant` union stays exactly
`'feed' | 'article' | 'rail' | 'leaderboard'` and `AdPlacement` in `src/lib/ads/engine.ts` keeps
`'rail'` — the UI simply never renders a `rail` slot anywhere (engine and types untouched;
architecture signatures fixed). v2 mapping:

- `leaderboard` → the responsive **top banner**: home (below hero) and top of BOTH article types.
  No longer desktop-only. Wrapper **148px** <768px (320×100 unit) / **138px** ≥768px (728×90),
  unit centered.
- `feed` → **in-feed grid-cell card**: `height: 100%; min-height: 298px` (24 label + 250 unit +
  24 padding), 300×250 unit centered vertically; positions server-decided per
  `site-config.adFrequency`.
- `article` → **in-article + end-of-article**: wrapper **298px**, 300×250 centered, block margins
  28px.
- `rail` → never rendered (kept in the type union only).

Shell identical in skin to a card: bg `surface-2`, border 1px `border`, radius **14px**
(`leaderboard`: 12px). Label „Publicitate” — Inter 600 **11px** uppercase +0.08em `ink-muted`
(5.57:1 on surface-2), centered in a fixed 24px top row, always rendered. Fixed heights, never
collapsed. Placement ethics: never between `h1` and attribution; never between excerpt and the
aggregated CTA; never mimicking card anatomy (no photo, no title styles). Pre-approval state:
shell + label with inert `<ins class="adsbygoogle" data-ad-client="ca-pub-8098077913729716">` —
flat field, no fake content, no shimmer.

### 4.5 Pagination

Centered flex, gap 12px: „← Pagina anterioară” (only when `page>1`) and „Pagina următoare →” —
pill buttons: height 44px, radius 999px, padding 0 20px, bg `surface`, border 1px
`border-functional`, text `button` token `ink`; hover border + text `link`; between them
„Pagina {n}” in `meta`. Server-side `?page=N`, no infinite scroll, no JS.

### 4.6 Badge „ACUM” (breaking, sparing)

Unchanged logic: white bg pill, 1.5px border `brand-red`, text `kicker` in `red-text`; placed
left of the title inside card bodies.

---

## 5. Imagery — photos carry the design

### 5.1 Real publisher photos (owner point 5)

- Source of truth: `aggregated-items.imageUrl`, **hotlinked**, rendered only when
  `imageAllowed=true` (values come ONLY from RSS `enclosure`/`media:content` or the documented
  owner-approved backfill — the INGEST pipeline never scrapes publisher article HTML; legal
  PROJECT_BRIEF 0.1/0.2). Originals use Payload `media` sizes via next/image (card 960w, hero
  1600w).
- **Verified prod dependency (hard):** as of 2026-07-07, `image_url` is empty on **all 86**
  aggregated rows in production. The ingest worker must populate it (RSS enclosure/media:content
  first, then the owner-approved backfill) before photos appear; until then every aggregated
  surface renders the §5.3 placeholder — the design must look intentional in that state, and it
  does (branded placeholder system).
- Rendering: plain `<img>` for aggregated remotes (NOT next/image — third-party URLs are never
  proxied/optimized/cached through our server) with `referrerpolicy="no-referrer"`,
  `loading="lazy"` + `decoding="async"` everywhere except hero/lead (`loading="eager"`,
  `fetchpriority="high"`), `alt` = item title, inside fixed `aspect-ratio: 16/9` boxes,
  `object-fit: cover` — images never dictate layout (CLS 0).
- **Broken-hotlink fallback (`SmartImage`):** the §5.3 placeholder is ALWAYS rendered as the
  underlay layer; the `<img>` sits above it and a minimal `onError` handler hides the failed
  image, revealing the placeholder — dead hotlinks degrade gracefully with zero layout shift and
  the browser broken-image glyph is never shown. Progressive enhancement only; with JS disabled a
  loaded image still renders and a failed one collapses to the underlay.
- Radii: 16px hero/overlay/lead, 14px card-top (card clips), 10px list thumbs. Keyline on light
  images: `box-shadow: inset 0 0 0 1px rgba(16,22,31,0.06)` on the wrapper.
- Aspect: **16:9 everywhere** (hero mobile 4:3 exception, §3.3.1).

### 5.2 Gradient overlays

Only on overlay cards (§4.1c), exact gradient stated there; scrim color `--color-scrim #0A101B`.
The gradient is decorative (photo-to-panel fade); text contrast is carried by the bottom **text
panel** `rgba(10,16,27,0.85)` + `backdrop-blur(6px)` behind the whole text block → worst case
(pure-white photo or the §5.3 placeholder) composite `#2F343D`: **12.53:1** white title /
**9.26:1** overlay-meta / **10.36:1** `#F6EF49` focus ring (independently recomputed). No
overlays on standard cards; no text over photos anywhere else.

### 5.3 Placeholder v2 (missing/disallowed/broken image)

One component, all tiers: box fills the same aspect box; bg
`linear-gradient(135deg, var(--color-accent-bg) 0%, var(--color-accent-bg-strong) 100%)`; ring
symbol as monochrome inline SVG (`brand-periwinkle`, three arcs), `opacity: 0.18`, width 120% of
box, anchored `right: -16%; bottom: -36%` (arcs crop in — watermark, not logo slap),
`aria-hidden="true"`; category label bottom-left in a solid `#FFFFFF` pill, `kicker` token
`red-text` (6.27:1 on white), 12px inset. On overlay-card placeholders the standard scrim still
applies above it.

### 5.4 OG / favicon

Unchanged from v1 §5.3: 1200×630 white OG with `logo-full.png` at 56% width + 6px tricolor bottom
bar; favicon/app icons from `logo-symbol.png`. No regeneration required.

---

## 6. Motion & interaction

Two transition recipes only:

- **A (color)** on links/buttons/chips:
  `transition: color 150ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out, text-decoration-color 150ms ease-out;`
- **B (elevation)** on cards: `transition: transform 200ms ease-out, box-shadow 200ms ease-out;`
  + card images `transition: transform 300ms ease-out;`

Behaviors:

- Card hover (all tiers): `transform: translateY(-2px)`, shadow →
  `0 8px 24px rgba(16,22,31,0.12)`, photo `scale(1.03)` inside its clipped box; title color →
  `link` on standard/list tiers (overlay titles stay white; overlay hover = photo scale only).
- All hover styles gated behind `@media (hover: hover) and (pointer: fine)` (keep the existing
  `@custom-variant hover`). Touch feedback: `a:active, button:active { opacity: 0.85 }`.
- Nav chips/buttons: recipe A states per §4.2/§4.5. Prose links: `link` → `link-hover`.
- Focus: `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`; on
  footer/overlay-card focus, `outline-color: var(--color-brand-yellow)` (15.01:1). Never removed
  without replacement. Skip link „Sari la conținut” stays first-focusable (white pill on `ink`
  when focused).
- `prefers-reduced-motion: reduce`: keep the existing global kill block (duration 0.01ms) —
  transforms/scales collapse to instant state changes; nothing depends on motion for meaning.
- No parallax, no autoplay, no carousels, no scroll-linked animation, no skeleton shimmer. Sticky
  nav is CSS-only; header/nav/footer work with JS disabled.

---

## 7. Implementation notes (contracts & tests)

- Module paths and signatures per `docs/architecture.md` are unchanged (`ArticleCard.tsx`,
  `FeedList.tsx`, `AdSlot.tsx`, `Header.tsx`, `Footer.tsx`, `CategoryNavList.tsx`,
  `TricolorBar.tsx`…); `src/types/content.ts` `FeedItem` untouched. Token NAMES in
  `globals.css @theme` untouched — values only, plus the 4 new extended tokens (`scrim`,
  `ink-inverse`, `overlay-meta`, `accent-bg-strong`) appended. `AdSlotVariant`/`AdPlacement`
  unions unchanged (`rail` kept, never rendered).
- `src/lib/fonts.ts`: Source Serif 4 → Archivo (`--font-archivo`), Inter stays;
  `--font-serif` in `@theme inline` now resolves to the Archivo variable.
- **Deliberate behavior changes requiring test updates (vitest must stay green):**
  (1) aggregated ArticleCard href → internal `/stiri/<slug>`, no `target="_blank"`, no ↗ on
  cards; (2) rail components („Cele mai noi”, rail AdSlot, sticky rail) deleted from home;
  (3) aggregated article page gains `leaderboard` (top banner) + `article` (in-article) slots
  (end slot exists); (4) CTA `rel` becomes `noopener noreferrer nofollow`; (5) `leaderboard`
  variant is no longer `hidden md:block` — it gets a responsive mobile height (148px / 320×100).
- Ingest (integration agent): populate `aggregated-items.imageUrl` from RSS
  `enclosure`/`media:content` only (plus the documented owner-approved backfill); set/respect
  `imageAllowed`; never scrape publisher article HTML.
- Add the recipe-B elevation transitions to `@layer base` alongside the existing link/button
  recipe; hover-scale utilities must respect the existing reduced-motion kill block (they do —
  global kill).
- Romanian copy with comma-below diacritics (ș/ț U+0219/U+021B) throughout; Prettier on all
  touched files; excerpts remain fair-use only; „Sursa: {X}” visible on every aggregated surface
  (card pill, article pill, CTA label, disclaimer line, photo credit).
