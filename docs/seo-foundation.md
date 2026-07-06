# SEO Foundation — NewsRomania

Written at step 1; refreshed at step 14 (Payload live, content DB-driven).
Remaining gaps are listed under „Still open” at the end.

Policy source: PROJECT_BRIEF Section 16. Code: `src/lib/seo.ts`, `src/app/robots.ts`,
`src/app/sitemap.ts`. Everything below is split by the two content types
(`src/types/content.ts`): **original** in-house articles vs **aggregated** items.

## Canonical policy

| Content type     | Detail page              | Canonical                                                                                                                                                                                                                           |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original article | `/stiri/<slug>`          | **Self-canonical** — `absoluteUrl('/stiri/<slug>')`. This site IS the source.                                                                                                                                                       |
| Aggregated item  | `/stiri/<slug>` (landing page: excerpt + attribution + link-out button) | **Canonical → the publisher's `sourceUrl`**, never ourselves — the publisher's page is the canonical one (avoids duplicate-content penalties). Cards and the landing page link out with `rel="noopener nofollow"`. |
| Home / category  | `/`, `/categorie/<slug>` | Self-canonical.                                                                                                                                                                                                                     |
| Legal pages      | `/<legal-slug>`          | Self-canonical but **noindex** while the texts are placeholders.                                                                                                                                                                    |

Canonical/metadata emission lives with the page owners (Next.js `metadata.alternates.canonical`);
`absoluteUrl()` is the single URL-building helper so every canonical shares one origin
(`siteConfig.url`, overridable via `NEXT_PUBLIC_SITE_URL`).

## JSON-LD policy (`articleJsonLd` in `src/lib/seo.ts`)

- **Original** → full `NewsArticle`: `headline` (≤110 chars), `description` = excerpt,
  `datePublished`, `dateModified` (still mirrors publish — wiring Payload's real
  `updatedAt` through `FeedItem` is an open item, see „Still open”),
  `inLanguage: 'ro'`, `articleSection` = category name, `author` = the real byline
  (`Person` for named journalists, `Organization` for the collective „Redacția NewsRomania”),
  `publisher` = Organization „NewsRomania" with `logo` → `/icons/icon-512.png`,
  `image` (absolute, when present), `mainEntityOfPage` = the article URL.
- **Aggregated** → `articleJsonLd` returns **`null`**. Aggregated items must never claim
  authorship of others' work: no Article/NewsArticle markup, ever. Attribution is carried by
  the UI (source pill, named outbound link), not by structured data.
- `websiteJsonLd()` (`WebSite` schema) is exported but **not wired** — render it once on `/`
  later. `/cautare` accepts `?q=` now, so a `SearchAction` can be added when wiring it.

## OG / Twitter defaults

- Layout-level defaults (owned by the shell agent in `src/app/(frontend)/layout.tsx`):
  site name „NewsRomania", Romanian description from `siteConfig.description`,
  `og:image` = `/og-default.png` (1200×630, logo on white + tricolor bar),
  `og:locale: ro_RO`, `twitter:card: summary_large_image`.
- Article pages override per item: title, excerpt as description, the item's own image when
  present (falling back to `/og-default.png`), `og:type: article`.

## robots.txt / sitemap.xml behavior

- `robots.ts`: `User-agent: * / Allow: /`, plus `Sitemap: <absoluteUrl>/sitemap.xml`.
  ⚠️ Still no disallows: the planned `disallow: '/admin'` (+ Payload API routes) was
  never added when Payload landed — open item („Still open” below).
- `sitemap.ts`: DB-driven (`force-dynamic`, reads Payload via `getPublishedOriginals()` —
  new publishes appear without a rebuild): `/` (hourly, 1.0), the 8 `/categorie/<slug>`
  pages (hourly, 0.7), and every **original** article `/stiri/<slug>` (weekly, 0.8).
- Excluded from the sitemap:
  - **Aggregated items** — their on-site landing pages (excerpt + attribution + link-out
    button, design §3.5) canonicalize to the publisher; the publisher's page is canonical.
  - **Info/legal pages** (despre-noi, contact + the legal set) — placeholder copy, noindex
    for now; a sitemap must never list noindex URLs. Re-add once finalized.
  - **/cautare** — internal search results stay noindex permanently.

## Status of the original „change later” list (step-14 refresh)

**Done:**

- `sitemap.ts` switched from `@/lib/mock-data` to Payload queries (`getPublishedOriginals()`);
  mock data replaced end to end (smoke.sh verifies: originals in the sitemap, aggregated not).
- Aggregated items got their on-site landing pages (`/stiri/<slug>`) with
  canonical → publisher, exactly per the policy above.

**Still open:**

- `robots.ts` — add `disallow: '/admin'` (+ Payload API routes) so the editorial backend is
  never crawled. Planned for the Payload step, not yet done.
- JSON-LD `dateModified` / sitemap `lastModified` — still mirror `publishedAt`; Payload's
  real `updatedAt` should flow through the `FeedItem` mapper (and article pages could show
  „Actualizat: …" when edited).
- `websiteJsonLd()` (`WebSite` schema) is exported but **not wired** — render it once on `/`;
  `/cautare` accepts `?q=` now, so a `SearchAction` can be added at the same time.
- Per-author pages (`/autor/<slug>`): add them to the sitemap and upgrade JSON-LD `author`
  with a `url` pointing at the author page.
- Legal texts are still placeholders (noindex): once finalized, lift the noindex and add the
  legal pages to the sitemap.
- Consider Google News-specific surfaces (news sitemap) only once original-article volume
  justifies it.
