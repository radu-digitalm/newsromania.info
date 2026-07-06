# newsromania.io — AI-Driven News Aggregation & Monetization Platform
### Context & System Prompt Brief for Claude Code

---

## ⚠️ SECTION 0 — LEGAL, COMPLIANCE & COMMERCIAL VIABILITY (READ FIRST)

These items can undermine the entire model if not handled up front. They are not optional.

### 0.1 Publisher copyright & AI-summary risk
- AI-generated summaries of news articles are a **legally contested area**. Several major publishers are actively litigating against AI companies over exactly this practice.
- Some outlets **forbid republishing excerpts even with attribution**. Attribution does NOT automatically equal permission.
- **Hard gate:** maintain a per-publisher allow/deny policy. Only aggregate from feeds that explicitly permit excerpting, or where the RSS feed is clearly intended for syndication. When in doubt, link-only (headline + link, no AI excerpt).
- Keep excerpts genuinely short and transformative. Never reproduce full articles or large verbatim passages.

### 0.2 Image rights
- Pulling publisher thumbnails carries its **own copyright exposure**, separate from the text.
- Prefer the image the publisher explicitly exposes in the RSS `media:content`/`enclosure` tag (implies syndication intent). Avoid scraping images from article HTML.
- Consider a fallback: publisher logo or a neutral category placeholder when image rights are unclear.

### 0.3 Google AdSense policy risk (THREAT TO THE WHOLE MODEL)
- AdSense **prohibits ads on "scraped" or "thin"/low-value content**. A pure aggregator with little original value is a classic violation and can get the account banned.
- Mitigation: the AI summaries, categorization, curation, and editorial framing must add **genuine original value**. Consider adding original elements — context blurbs, "why this matters", topic clustering, original commentary — so pages are not just restated feeds.
- **Validate the model against current AdSense program policies before relying on it for revenue.** Have a backup ad network in mind (e.g. Ezoic, Media.net) in case AdSense rejects the site.
- **Primary mitigation (decided): the editorial layer (Section 19).** Original in-house articles make the site a genuine publisher rather than a thin aggregator — the strongest defence against a scraped/thin-content rejection, and the reason the editorial backend is built early (see Build Order).

### 0.4 Required legal pages
- Privacy Policy, Terms of Service, Cookie Policy, and an **imprint / legal mentions** page (mandatory in the EU; under French law *mentions légales* are required and must identify the publishing entity — relevant if the French SASU or a Romanian entity owns the site).
- Clearly state the entity, contact, hosting provider, and data controller.

### 0.5 Unit economics gate
- Model the cost of LLM summarization **at scale** vs projected ad revenue before committing. At thousands of articles/day, API costs can exceed early ad income (see Section 18).

---

## 1. PROJECT OVERVIEW

Build an intelligent news platform — **aggregation PLUS original publishing** — that:

- Publishes **original in-house articles** (written by the owner and other authors) through a full editorial backend with roles, draft→publish workflow, and a built-in Yoast-style SEO analyzer (Sections 19–20)
- Pulls from multiple public RSS feeds (media outlets)
- Generates AI summaries / excerpts **within fair-use legal limits**, always attributing and linking back to the original publisher
- Pulls thumbnail images and redirects readers to the publisher's page (new tab)
- Intelligently injects **geo-targeted, locale-aware, and behaviour-targeted** ads (Google AdSense + Amazon Associates)
- Tracks visitor behaviour via a lightweight first-party **CDP**
- Enforces **explicit GDPR consent** with no dark patterns
- Auto-distributes content to social media (Facebook, Instagram, X/Twitter)
- Is fully **parametrizable** via an admin config — feeds, affiliate IDs, AdSense IDs, rules — with no code changes required

All orchestrated by an **agentic AI layer** that drives the entire flow.

---

## 2. CORE PRINCIPLE: AI ORCHESTRATION

A single agentic layer sits above everything. It takes admin parameters as input and orchestrates the full pipeline: fetch RSS → summarize → detect locale/behaviour → match ad rules → inject creative → distribute to social → log to CDP.

Everything is **driven by configuration and prompts, not hard-coded logic**. The admin pastes in feed URLs, affiliate IDs, AdSense IDs, sets rules, and the agent handles placement intelligently.

---

## 3. TECH STACK

| Layer | Choice |
|---|---|
| Frontend | **Next.js (React)** — granular ad placement + SSR geo-routing + consent UI |
| Backend | Node.js + Express |
| Server user | `newsagent` — dedicated OS user, **no sudo**; rootless containers; nginx/certbot via `deploy/` hand-over (Section 21) |
| Database | PostgreSQL — **own Docker container** (host cluster :5432 belongs to Umami analytics — off-limits; host MySQL unused) |
| Editorial CMS | **Recommended: Payload (19.3)** — Next.js-native; Strapi or fully custom as alternatives |
| Article editor | If custom route: a rich-text/block editor library (e.g. TipTap or Lexical) |
| SEO analyzer | Yoast-style live checker built into the editor (Section 20); evaluate the open-source `yoastseo` JS analysis library |
| AI Orchestration | Claude (tool use) or LangChain agent |
| Summarization LLM | TBD — *research required* (Claude vs GPT vs open-source Llama; balance speed/cost/quality) |
| Social publishing | **Claude in Chrome** (browser agent posts via the platforms' own web UIs — no Meta app review, no paid X API); n8n optional for queue/scheduling |
| Ad Networks | Google AdSense + **Amazon Creators API** (official Node.js SDK v1.2.0, vendored; EU credentials v3.2) |
| Consent | GDPR/CCPA-compliant cookie consent library |
| Caching | Redis — own Docker container, `newsromania:` prefix (geo-routing + ad-rule + Amazon product cache) |

---

## 4. DESIGN & UX/UI REQUIREMENTS  ⭐ (non-negotiable)

- **Clean, modern design** — minimal, editorial, content-first. Whitespace-led, no clutter.
- **Mobile-first / fully mobile-optimized** — design for the phone viewport first, scale up to desktop. Touch-friendly tap targets (min 44×44px).
- **High contrast text only** — NO low-contrast / grey-on-grey text. Meet **WCAG AA minimum** (4.5:1 for body text, 3:1 for large text). Test every text/background pair.
- **Strong typographic hierarchy** — clear distinction between headlines, excerpts, metadata.
- **Ads must blend tastefully** — native-feeling, clearly labelled "Ad/Sponsored", never intrusive, never disrupting reading flow.
- **Fast** — performance is a UX feature. Lazy-load images, cache geo logic server-side, minimize layout shift (CLS).
- **Accessible** — semantic HTML, alt text on all images, keyboard navigable, respects `prefers-reduced-motion`.
- **Brand logo provided** (repo `assets/`) — drives the site header, favicon derivation, and OG/social-card imagery.
- **Responsive ad slots** — ad placements adapt to screen size; no horizontal scroll, no broken layouts on mobile.

---

## 5. NEWS AGGREGATION (DATA LAYER)

1. Ingest items from configured public RSS feeds.
2. Generate a concise **AI summary / excerpt within legal fair-use limits** — transformative, never reproducing full articles.
3. Extract content **category + topic tags** from each item.
4. Pull a thumbnail image.
5. **Always** display clear attribution + link back to the original publisher (opens in new tab).
6. Add a visible "Source: [Publisher]" credit on every item.

⚠️ Respect publisher T&Cs and copyright at all times. Excerpt only, never beyond legal limits.

---

## 6. MONETIZATION & INTELLIGENT AD PLACEMENT

### 6.1 Signals used to target ads
- **Current location** (IP geolocation) — *where the visitor physically is*, NOT where they're from. A Romanian visitor in the UK gets **UK** Amazon/AdSense ads.
- **Locale / language preference** (browser).
- **Behavioural profile** (consent required) — what they've read/searched/clicked, on-site events from the CDP, and cookie data (AdSense interest signals, Amazon browsing relevance).
- **Content category** of the article the ad sits beside.

### 6.2 Placement logic
- Inject ads **between articles** and within listings at region-specific frequency (e.g. UK: every 3rd item; RO: every 5th item — configurable).
- Match ad **category** to article category + visitor interest profile.
- Serve the correct affiliate ID / ad unit per region.
- Geo-routing done **server-side** and cached for performance.

### 6.3 Consent-gated behaviour
- **No consent** → serve baseline generic AdSense / non-targeted Amazon links only. No cookies read, no profile built.
- **Consent given** → pull CDP profile + cookies, match behaviour to ad rules, serve fully targeted creative.

### 6.4 Live account details & integration status (REAL IDs — build with these)

**Google AdSense** — account exists; **newsromania.info site review is PENDING**.
- Embed the site-level code in the app shell (Next.js root layout `<head>`) from day one:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8098077913729716" crossorigin="anonymous"></script>
```
- Until review passes, ad slots render blank/unfilled — **this is expected**; do not fill them with fake placeholder ads.
- Review is judged on content quality → submit/expect approval **after original articles are live** (another reason editorial ships at build steps 3–4).
- Ad **unit** IDs are created in the AdSense dashboard after site approval; drop them into config then.

**Amazon Creators API** — active account; application `newsromania` registered, credentials issued (Credential ID + Secret; **version 3.2 = EU region, LWA auth** per the SDK README). Tracking ID **`newsr01-21`**.
- **Secrets discipline:** credentials live ONLY in environment variables — `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET`, `AMAZON_CREATORS_CREDENTIAL_VERSION=3.2`. **Never commit the credentials CSV or hardcode the secret** in the repo, config files, or this brief. Rotate in Associates Central if ever exposed.
- **Official Node.js SDK:** `@amzn/creatorsapi-nodejs-sdk` v1.2.0 (Apache-2.0, Node ≥14; `npm install && npm run build`). Distributed as a download, not on public npm → **vendor the zip into the repo** (e.g. `/vendor/creatorsapi-nodejs-sdk`) and reference it as a `file:` dependency.
- **Operations available:** `searchItems`, `getItems`, `getVariations`, `getBrowseNodes`, `listFeeds`/`getFeed`, `listReports`/`getReport`.
  - `searchItems` (keywords + searchIndex + resources) → powers article-topic → product-ad matching (6.2).
  - `getBrowseNodes` → Amazon's category tree; map article categories to product categories for smarter matching.
  - `listReports`/`getReport` → real Amazon earnings data for the Section 17 ad-performance dashboard.
- **Marketplace is specified per request** (e.g. `www.amazon.co.uk`) and the `partnerTag` must match that marketplace → create per-marketplace tags (.co.uk / .fr / .de) in Associates Central and **confirm which marketplace `newsr01-21` belongs to**. (OneLink remains relevant only for static, non-API links.)
- **The API throttles** (the SDK ships a throttle-exception model) — check current rate limits in the Creators API docs and **cache product results in Redis**; never call the API per page view.
- Note: there is no amazon.ro — Romanian visitors are typically served by amazon.de; a local Romanian affiliate program (e.g. eMAG's) can cover RO inventory later.

---

## 7. CUSTOMER DATA PLATFORM (CDP)

Lightweight, first-party, built from scratch.

- Capture events: page views, article clicks, time on page, scroll depth, category read, device type, location, locale.
- Build per-visitor interest profiles (e.g. "tech + finance + health, currently in UK").
- Recognize repeat visitors via first-party ID / cookie (consent required).
- Feed profiles into the ad-matching engine for interest-targeted serving.
- Stack: Node backend logging to PostgreSQL. (Segment/Mixpanel optional later; start custom.)
- Store consent state + retention policy flags alongside profile.

---

## 8. GDPR CONSENT (STRICT — NO DARK PATTERNS)

- On first visit, show a **clear consent banner**.
- The choice is binary and honest: **Accept** tracking/targeted ads, **or Refuse**.
- **If they refuse, they can still read the site** — they simply get generic, non-targeted ads. **Do NOT force agreement and do NOT force them off the page.**
- No pre-ticked boxes, no buried "reject", no confusing wording. Reject must be as easy as Accept.
- The agent **must check consent status BEFORE** reading any cookie or building any profile.
- Store consent records (timestamp, choice) in PostgreSQL for compliance.
- Provide a way to withdraw consent at any time + link to cookie policy.

---

## 9. SOCIAL DISTRIBUTION (TRAFFIC LAYER)

**Execution route (decided): Claude in Chrome.** Posts go out through the platforms' own web UIs via the browser agent — avoiding Meta's app-review process and X's limited/paid API entirely.

- The pipeline **prepares a posting queue**: for each story (aggregated or original), a pre-formatted caption per platform + image + link back to the site.
- **Claude in Chrome executes the queue** in the browser. Be clear about the trade-off: this is supervised/semi-automated (runs when triggered in the browser), not a headless cron job. n8n can optionally remain for queue management, scheduling reminders, and webhooks.
- Tailor per platform: longer captions for Facebook, short/snappy for X, visuals-first for Instagram.
- Stagger posts through the day to maximize reach; schedule lives in admin config.
- ⚠️ Review each platform's automation rules; keep posting supervised and human-paced — heavy unattended automation can flag accounts.

> Traffic strategy runs **after** the build is live. Organic search + social push together.

---

## 10. ADMIN CONFIG SCHEMA

```jsonc
{
  "feeds": [
    { "url": "https://...", "name": "Publisher Name", "active": true }
  ],
  "adNetworks": {
    "adSensePublisherId": "ca-pub-8098077913729716",  // REAL — account exists, site review pending
    "adUnitIds": [],                                   // create in AdSense dashboard after site approval
    "amazonAffiliateIds": {
      "default": "newsr01-21"                          // REAL tag — confirm marketplace; add per-market tags or enable OneLink
    }
  },
  "localeRules": {
    // map current visitor location -> region + ad preference
    "UK": { "region": "UK", "adSet": "uk" },
    "RO": { "region": "EU", "adSet": "ro" }
  },
  "adFrequency": {
    "UK": "every_3rd_article",
    "RO": "every_5th_article",
    "default": "every_4th_article"
  },
  "behaviouralTargeting": {
    "enabled": true,
    "requiresConsent": true
  },
  "socialPlatforms": {
    "executionRoute": "claude-in-chrome",
    "facebook": { "pageUrl": "" },
    "instagram": { "profileUrl": "" },
    "twitter": { "profileUrl": "" },
    "postingSchedule": ["09:00", "13:00", "18:00", "21:00"]
  },
  "gdpr": {
    "consentText": "...",
    "cookiePolicyUrl": "https://...",
    "cookieRetentionDays": 180,
    "rejectAsEasyAsAccept": true
  },
  "cdpSettings": {
    "retentionDays": 365,
    "privacyFlags": []
  },
  "editorial": {
    "roles": ["admin", "editor", "author"],
    "seoAnalyzer": {
      "language": "ro",
      "minWordCount": 300,
      "blockPublishOnRed": false
    }
  }
}
```

---

## 11. AGENT DECISION TREE

1. Ingest RSS feed items from active feeds.
2. Summarize with AI (fair-use excerpt) + extract category/topic tags + pull image.
3. Detect visitor **current location** (IP) + locale.
4. **Check GDPR consent status.**
5. If consent → retrieve CDP profile + cookie behaviour. If no consent → generic ads only.
6. Match content category + visitor location + interest profile against ad rules.
7. Select correct creative (AdSense unit / Amazon product) for the visitor's **current region**.
8. Inject ad at correct position + frequency per region rules.
9. Format summary (image + attribution link) for the feed and for each social platform's spec.
10. Queue social posts (pre-formatted per platform) for execution by Claude in Chrome per schedule.
11. Log the interaction to the CDP for future profiling (consent permitting).

---

## 12. SYSTEM PROMPT FOR THE AGENT

> You are an AI orchestration agent for a news aggregation and monetization platform. You manage the entire workflow from RSS ingestion to monetized, localized content delivery. You have access to configuration parameters, ad rules, visitor data, and RSS feeds.
>
> Your responsibilities:
> 1. Fetch and parse RSS feeds from configured sources.
> 2. Generate concise AI summaries within fair-use limits, always attributing and linking to the original publisher. Never reproduce full articles.
> 3. Extract content categories and topic tags from each summary.
> 4. **Check GDPR consent before reading any cookie or building any profile.** If no consent, serve only generic, non-targeted ads.
> 5. Accept visitor current-location and locale data and match against ad-serving rules. Always target the region the visitor is *currently in*, not their origin.
> 6. With consent, pull the visitor's CDP profile and cookie behaviour and match it to ad rules for interest-targeted serving.
> 7. Select and inject the appropriate creative — Google AdSense or Amazon Associates — based on current region, locale, behaviour, and content-category match.
> 8. Determine ad injection frequency and placement per region-specific rules. Ads must be tasteful, clearly labelled, and never intrusive.
> 9. Format summaries with images and per-platform specs; maintain the social posting queue for execution by Claude in Chrome (browser agent) at scheduled times, for Facebook, Instagram, and X/Twitter.
> 10. Log all interactions to the CDP for future profiling (consent permitting).
> 11. Adapt to admin config changes — new feeds, affiliate IDs, ad rules — without requiring code changes.
> 12. Treat original in-house articles as first-class content: surface them in the main feed (fully rendered on-site, with author byline, visually distinct from aggregated items) and queue them for social distribution alongside aggregated stories. **Never modify or rewrite author-written article content.**
>
> Always prioritize visitor experience and accessibility. Always respect publisher attribution and copyright limits. Always respect consent.

---

## 13. BUILD ORDER (MVP → FULL)

1. Next.js frontend skeleton + mobile-first, high-contrast, accessible design system.
2. Node/Express backend + PostgreSQL schema (config, CDP, consent, articles, authors, media).
3. **Editorial backend** — auth + roles (admin/editor/author), article editor, draft → review → publish workflow, media library. (Custom build or headless CMS per the 19.3 decision.)
4. **SEO analyzer** wired live into the editor (Section 20), calibrated for Romanian.
5. RSS parser + AI summarization engine (fair-use excerpts + attribution) + one-time content seed from the existing site (Section 22).
6. Basic ad injection (geo + locale, server-side routing) — across both content types.
7. GDPR consent banner (strict, no dark patterns) gating everything downstream.
8. CDP visitor tracking + interest profiling.
9. Behavioural/cookie targeting layer (consent-gated).
10. AdSense integration + Amazon Creators API integration (vendored SDK, env-var credentials, Redis-cached product lookups).
11. Agentic orchestration layer tying it together (aggregated items + original articles → feed + social queue).
12. Social posting queue + Claude in Chrome publishing workflow (original + aggregated); n8n optional for scheduling.
13. Admin dashboard UI for all config parameters.
14. Test geo-targeting, ad injection, consent flows, editorial workflow + SEO analyzer, mobile UX. Deploy + monitor — **strictly per Section 21 shared-server guardrails**.

> Editorial sits early (steps 3–4) deliberately: the site should launch already carrying original content — the clearest signal of genuine original value for ad-network review and for SEO from day one.

---

## 14. OPEN RESEARCH ITEMS

- **Summarization LLM selection** — compare Claude vs GPT vs open-source (Llama) on speed, cost per summary at scale, and summary quality for news.
- **Editorial build route** — headless CMS (Strapi / Payload) vs fully custom (Section 19.3). Decide before step 3 of the build order.
- **SEO analyzer engine** — verify whether the open-source `yoastseo` JS library covers Romanian readability rules; plan custom rules for any gaps (Section 20).
- Confirm per-publisher RSS T&Cs and excerpt limits.
- **Amazon tags** — confirm which marketplace `newsr01-21` is registered to; create .co.uk/.fr/.de tags for per-marketplace API requests (6.4). Check current Creators API rate limits in the official docs.
- **AdSense site review** — pending for newsromania.info; expect approval only once original articles are live (6.4).
- **Hosting: DECIDED — shared VPS, dedicated user `newsagent` (no sudo), rootless containers (own Postgres + Redis).** Section 21 carries the server facts and hand-over workflow.

---

## 15. CONTENT DEDUPLICATION & FRESHNESS

- RSS feeds repeat. The **same story often appears across multiple outlets** — detect and cluster duplicates (fuzzy title/content matching or embeddings) so the feed doesn't show the same news five times.
- Decide a **re-poll interval** per feed (e.g. every 15–30 min) and avoid re-summarizing unchanged items (cache by GUID/hash).
- Define a content **time-to-live**: how long a story stays on the front page before it's archived/demoted.
- Handle missing fields gracefully (no image, no description, malformed feed).

## 16. SEO FOUNDATION (BAKE IN, DON'T BOLT ON)

Even though traffic work comes later, these must be in the build from day one:
- Server-side rendering (Next.js) for crawlability.
- **Structured data** (JSON-LD), split by content type: original in-house articles get full `Article` schema with the real author/byline; aggregated items must be marked honestly and must NOT claim authorship of others' work.
- **Canonical tags**, split by content type: aggregated items point to the original publisher to avoid duplicate-content penalties; original articles are self-canonical — this site IS their source.
- Auto-generated `sitemap.xml` + `robots.txt`.
- Clean semantic URLs, meta titles/descriptions per page, Open Graph + Twitter Card tags (also powers the social previews in Section 9).
- Fast Core Web Vitals (ties directly to the UX/perf rules in Section 4).

## 17. ANALYTICS, MONITORING & AD PERFORMANCE

Beyond the CDP:
- **Error/uptime monitoring** (e.g. Sentry + an uptime check) for the backend, RSS ingestion failures, and the AI pipeline.
- **Ad performance dashboard** — which placements, regions, and categories actually earn (impressions, CTR, revenue per slot). You need this to optimize placement frequency.
- Feed health monitoring — alert when a source stops returning items or changes format.
- LLM usage/cost tracking per day (ties to Section 18).

## 18. COST MODEL (DECIDE BEFORE SCALING)

- Estimate articles/day × tokens/summary × LLM price → **daily summarization cost**. Re-run for each candidate model (Claude vs GPT vs open-source self-hosted).
- Open-source/self-hosted (e.g. Llama) trades API cost for infra cost — model both.
- Add hosting, database, Redis, image bandwidth, n8n hosting.
- Compare against **realistic** early ad revenue (low traffic at launch). Expect costs > revenue initially; know your runway.
- Lever to control cost: link-only for low-value items, summarize only items likely to get traffic, batch/cheap-model for bulk + premium model for top stories.

---

## 19. EDITORIAL BACKEND & ORIGINAL ARTICLES

**Why this exists:** newsromania is a **publisher, not just an aggregator**. Original in-house articles are the primary defence against the AdSense thin-content risk (0.3) and the engine of long-term SEO authority. Aggregation drives volume; original articles build the brand.

### 19.1 Two content types, side by side

| | Original article | Aggregated item |
|---|---|---|
| Body | Full article, rendered entirely on-site | AI excerpt only, within fair-use limits |
| Ownership | Owned by newsromania | Belongs to the publisher |
| Attribution | Author byline | "Source: [Publisher]" + link out (new tab) |
| Images | Own uploads from the media library (fully owned) | Publisher RSS image, rights-checked (0.2) |
| Canonical | Self-canonical | Points to the original publisher |
| Structured data | Full `Article` JSON-LD with real author | Must NOT claim authorship |
| SEO analyzer | **Yes — runs before publish** | No |

Both types appear in the same feed, **visually distinct** (byline vs "Source:" line); original articles can be pinned/featured. Ads inject across both per the same region/frequency rules.

### 19.2 Authoring & workflow

- **Roles:** admin (full control) · editor (edit + publish anything) · author (write + edit own drafts, cannot publish). Login-protected backend.
- **Workflow:** draft → review → publish, plus **scheduled publishing**.
- **Editor:** rich-text / block editor — headings, paragraphs, images, embeds, links, quotes, lists.
- **Media library:** upload own images (fully owned — zero rights exposure), **alt text required** at upload.
- **Article metadata:** title, slug, category, tags, byline, featured image, meta title, meta description, focus keyword, status, publish date.

### 19.3 Build route — RECOMMENDED: Payload (Option A)

**Recommendation: Payload.** v3 installs *inside* the Next.js app — same repo, same deployment — so it delivers Option B's single codebase AND Option A's ready-made admin (auth, roles, drafts, scheduled publishing, versioning, media library). Its React admin panel accepts custom components, giving the Section 20 SEO analyzer a natural place to live inside the editor. Default rich-text editor is Lexical. Has a PostgreSQL adapter, aligning with the stack — **verify current v3 state and the Postgres adapter at build time before scaffolding.**

- **Option A — headless CMS (Payload preferred; Strapi as alternative):** auth, roles, drafts, media library, and an admin UI come ready-made; the custom Next.js frontend stays on top. Strapi runs as a separate service and deep editor-UI customization is heavier — choose it only if the CMS must serve multiple frontends.
- **Option B — fully custom in Next.js/Node:** total control, but auth, RBAC, editor, and media library are all hand-built — weeks spent on solved problems instead of the differentiating work (ad engine, agent, SEO analyzer). Editor library if custom: TipTap or Lexical.
- Either way, the **SEO analyzer is custom work** — Yoast itself is a WordPress plugin. Its analysis engine is, however, available as an open-source JavaScript library (`yoastseo` on npm) that can be embedded in a custom editor — evaluate it first before writing checks from scratch, and verify its Romanian-language coverage **and licence fit**.

---

## 20. BUILT-IN SEO ANALYZER (YOAST-STYLE)

Runs **live inside the article editor**, re-scoring on every change. Applies to original articles only.

### 20.1 Checks

**Keyword / on-page**
- Focus keyword present in: meta/SEO title, slug, H1, first paragraph, subheadings, and body at a sensible density (also flag keyword stuffing).
- Meta title length (commonly recommended ≈50–60 characters) and meta description length (≈150–160 characters); keyword present in both.
- **Live snippet preview** — how the title, URL, and description would render in a Google result.

**Readability**
- Sentence length distribution, paragraph length, passive-voice share, transition-word usage, subheading distribution (no long unbroken walls of text), minimum word count (configurable, default 300).
- ⚠️ **Readability rules are language-dependent** — classic formulas are calibrated for English. The analyzer must be calibrated for **Romanian** (assumed primary content language — flag if EN/FR articles are also planned). If using the `yoastseo` library, verify its Romanian coverage and supplement with custom rules where it falls short.

**Links & media**
- At least one internal link; outbound links flagged/handled; alt text present on every image.

### 20.2 Scoring & enforcement

- Each check returns pass / warn / fail → aggregated into a **traffic-light overall score** (green / amber / red).
- **Configurable publish gate:** warn on amber; block or require-confirmation on red (`blockPublishOnRed` in config).
- Score is **stored with the article and shown in the article list**, so weak content is visible at a glance.

---

## 21. 🛡️ SERVER & ISOLATION MODEL (SHARED VPS · DEDICATED USER `newsagent` · NO SUDO)

**Context:** newsromania runs under its **own OS user, `newsagent`**, on a VPS shared with another tenant (`hermes`, running its own Claude Code agent for digitalm.eu). Home directories are `chmod 750`, so the projects are **isolated at the OS level** — the rules below are defence-in-depth on top of a real wall. `newsagent` has **no sudo**, and will also host **other websites** as sibling folders under `~/workspace/` later.

**Server facts (ground truth):**
- User: `newsagent`. Project root: `/home/newsagent/workspace/newsromania` · web root: `/var/www/newsromania` (owned `newsagent:www-data`, group-readable so nginx serves it).
- Other tenant (`hermes` — OS-protected, off-limits, never probe): digitalm.eu prod **:3000**, d3v.digitalm.eu staging **:3001**, Umami analytics **:3002**. newsromania's reserved port range: **3100–3199**.
- **Host PostgreSQL :5432 (Umami's) and host MySQL :3306 are off-limits/unused** — Payload's supported adapters are Postgres/SQLite/Mongo, so Postgres in an own container is the choice.
- **No sudo** → nginx (`/etc/nginx/sites-available/newsromania`), certbot, system packages, firewall, and system-level systemd are **hand-over operations**: the agent prepares exact files/commands in `deploy/`; the owner applies them.
- User-level systemd is available: linger is enabled for `newsagent` (`systemctl --user`, units named `newsromania-*`).

**Enforcement:** these rules live in the repo's `CLAUDE.md`, which Claude Code reads automatically at every session start. `~/.claude/` now belongs to `newsagent` alone — keep only cross-site preferences there; project rules stay in each repo's own `CLAUDE.md`.

### 21.1 Hard boundaries (non-negotiable)
- **Per-project scope.** In this project's sessions, all work happens inside `/home/newsagent/workspace/newsromania` (+ `/var/www/newsromania`). Sibling site folders under `~/workspace/` are other projects — never read or modify them, other users' files, or anything outside the project root without explicit approval that session.
- **NO sudo, ever.** Never run or request `sudo`/`su`; root-level needs go through the `deploy/` hand-over (21.5).
- **Launch discipline:** always start the Claude Code session from inside the project root; never blanket-auto-approve commands that touch paths outside it.
- **No destructive commands at/above `~/workspace`:** no `rm -rf`, `chmod -R`, `chown -R`, `find -delete`, or glob deletes outside the project root. Absolute paths only; verify `pwd` before any destructive operation.

### 21.2 Services — scope strictly
- **PostgreSQL & Redis:** own **rootless** containers (compose in repo root, internal network; only the app port published). Host :5432 and :3306 never touched. Dedicated DB + role in-container; migrations scoped; **backup before every migration**. Never `FLUSHALL`/`FLUSHDB`; `newsromania:` key prefix.
- **nginx (hand-over):** the agent maintains `deploy/nginx/newsromania.conf` in the repo; the owner installs it to `/etc/nginx/sites-available/newsromania`, runs `nginx -t`, and reloads. The agent never edits `/etc/nginx` directly.
- **TLS/certbot (hand-over):** the agent prepares the exact certbot command for newsromania.info only; the owner runs it.
- **Web-root permissions:** preserve `newsagent:www-data` ownership, `g+rX`, and setgid on directories under `/var/www/newsromania` so nginx keeps serving.
- **cron/systemd:** user-level only (own crontab, `systemctl --user`), entries named `newsromania-*`.
- **Tooling:** per-user only — `nvm` + project `.nvmrc`; system-wide installs are hand-over items.

### 21.3 Runtime isolation
- **Ports:** 3000/3001/3002 belong to the other tenant. newsromania binds within **3100–3199** only; check `ss -tlnp` before binding; record chosen ports in the README.
- **Containers: rootless only** — rootless Docker (preferred: keeps the standard compose workflow) or Podman. **NEVER join the `docker` group** — it is root-equivalent and would demolish the user isolation the server was just set up for.
- **Process names:** compose services / user units named `newsromania-web`, `newsromania-worker`. Manage by name only; never unscoped kills or restarts.
- **Memory/CPU caps:** container limits so a runaway RSS/summarization job cannot starve the host.
- **Disk hygiene:** log rotation + container log limits + periodic disk checks — a full disk hurts every tenant on the box.

### 21.4 Secrets separation
- Own `.env` in project root, `chmod 600`, never committed, never printed to terminal/logs. Never attempt to access other users' or sibling projects' `.env` files or credentials.
- Distinct DB/Redis credentials per project — never reused across sites.

### 21.5 Hand-over list (agent prepares, owner executes with sudo)
nginx config install/reload · certbot for newsromania.info · system package installs · firewall (ufw/iptables) · fail2ban · DNS changes · system-level systemd units · reboots. The agent writes the exact files and commands into `deploy/`, explains what they do, and stops there. **Batching rule:** root needs are consolidated into as few paste-blocks as possible — expected total for this project: **~2** (container runtime, if missing; nginx + certbot at deploy). Everything else the agent does itself, including installing its own user-local server toolchain (nvm, Node, git config, Claude Code) over SSH — no sudo needed for any of it.

---

## 22. CONTENT SEED FROM THE EXISTING SITE (ONE-TIME)

The current newsromania.info (the owner's WordPress site) stays live until cutover. At build step 5, run a **one-time import of the last ~14 days of posts** so the new site doesn't launch empty:

- Pull via the WordPress REST API (`https://newsromania.info/wp-json/wp/v2/posts?after=...`, paginated), with the RSS feed as fallback.
- **Classify on import:** third-party aggregated stories → **aggregated type** (generate a fresh AI excerpt, keep the original publisher's attribution + link out — never carry over third-party full text). Owner-written posts → **original articles** (full text, byline).
- Preserve original publish dates and map categories where possible; import images only where rights allow (Section 0.2 rules apply — prefer owner-uploaded media).
- Idempotent script in `scripts/seed/` — re-runnable, deduplicated by source URL/GUID.

---

*End of brief. Paste this into the new Claude Code session as project context.*
