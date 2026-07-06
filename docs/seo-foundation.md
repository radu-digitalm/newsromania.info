# SEO Foundation — NewsRomania (step 1)

Policy source: PROJECT_BRIEF Section 16. Code: `src/lib/seo.ts`, `src/app/robots.ts`,
`src/app/sitemap.ts`. Everything below is split by the two content types
(`src/types/content.ts`): **original** in-house articles vs **aggregated** items.

## Canonical policy

| Content type     | Detail page              | Canonical                                                                                                                                                                                                                           |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original article | `/stiri/<slug>`          | **Self-canonical** — `absoluteUrl('/stiri/<slug>')`. This site IS the source.                                                                                                                                                       |
| Aggregated item  | none in step 1           | n/a — cards link straight out to the publisher (`sourceUrl`, `rel="noopener nofollow"`). If aggregated items ever get any on-site page later, its canonical MUST point to the publisher's URL to avoid duplicate-content penalties. |
| Home / category  | `/`, `/categorie/<slug>` | Self-canonical.                                                                                                                                                                                                                     |
| Legal pages      | `/<legal-slug>`          | Self-canonical but **noindex** while the texts are placeholders.                                                                                                                                                                    |

Canonical/metadata emission lives with the page owners (Next.js `metadata.alternates.canonical`);
`absoluteUrl()` is the single URL-building helper so every canonical shares one origin
(`siteConfig.url`, overridable via `NEXT_PUBLIC_SITE_URL`).

## JSON-LD policy (`articleJsonLd` in `src/lib/seo.ts`)

- **Original** → full `NewsArticle`: `headline` (≤110 chars), `description` = excerpt,
  `datePublished`, `dateModified` (mirrors publish until Payload provides a real `updatedAt`),
  `inLanguage: 'ro'`, `articleSection` = category name, `author` = real `Person` byline,
  `publisher` = Organization „NewsRomania" with `logo` → `/icons/icon-512.png`,
  `image` (absolute, when present), `mainEntityOfPage` = the article URL.
- **Aggregated** → `articleJsonLd` returns **`null`**. Aggregated items must never claim
  authorship of others' work: no Article/NewsArticle markup, ever. Attribution is carried by
  the UI (source pill, named outbound link), not by structured data.
- `websiteJsonLd()` (`WebSite` schema) is exported but **not wired** — render it once on `/`
  later, and only add a `SearchAction` once `/cautare` accepts a query parameter.

## OG / Twitter defaults

- Layout-level defaults (owned by the shell agent in `src/app/(frontend)/layout.tsx`):
  site name „NewsRomania", Romanian description from `siteConfig.description`,
  `og:image` = `/og-default.png` (1200×630, logo on white + tricolor bar),
  `og:locale: ro_RO`, `twitter:card: summary_large_image`.
- Article pages override per item: title, excerpt as description, the item's own image when
  present (falling back to `/og-default.png`), `og:type: article`.

## robots.txt / sitemap.xml behavior

- `robots.ts`: `User-agent: * / Allow: /`, plus `Sitemap: <absoluteUrl>/sitemap.xml`.
  No disallows yet — `/admin` gets disallowed at step 3 when Payload lands.
- `sitemap.ts`: `/` (hourly, 1.0), the 8 `/categorie/<slug>` pages (hourly, 0.7), and every
  **original** article `/stiri/<slug>` (weekly, 0.8, `lastModified` from `publishedAt`).
- Excluded from the sitemap:
  - **Aggregated items** — no on-site detail pages; the publisher's page is canonical.
  - **Legal pages** — placeholder copy, noindex for now; a sitemap must never list noindex
    URLs. Re-add once finalized.

## What must change later

**Step 3 (Payload CMS):**

- `sitemap.ts` switches from `@/lib/mock-data` to Payload queries; real `updatedAt` feeds both
  the sitemap `lastModified` and JSON-LD `dateModified` (stop mirroring `datePublished`;
  article pages also show „Actualizat: …" when edited).
- `robots.ts` adds `disallow: '/admin'` (+ Payload API routes).

**Step 5 (content seed / launch):**

- Real content replaces mock data end to end; verify every seeded original article appears in
  the sitemap and every seeded aggregated item does not.
- Per-author pages (`/autor/<slug>`): add them to the sitemap and upgrade JSON-LD `author` with
  a `url` pointing at the author page.
- Legal texts finalized → lift the noindex and add the 4 legal pages to the sitemap.
- Consider Google News-specific surfaces (news sitemap) only once original-article volume
  justifies it.
