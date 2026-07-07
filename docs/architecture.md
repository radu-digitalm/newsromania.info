# newsromania.info — Architecture Contract (steps 2–14)

Single source of truth for module boundaries, data shapes, and service
interfaces. Every builder codes TO this contract. PROJECT_BRIEF.md governs
requirements; CLAUDE.md governs server rules. Design: docs/design-direction.md.

## 1. Topology

- **One Next.js 16 app** (this repo) containing: public site (`(frontend)` route
  group), Payload 3.85 admin + API (`(payload)` route group), first-party API
  routes (`/api/*`).
- **Workers** (no separate Express server): standalone Node scripts under
  `scripts/worker/*.mjs` using Payload's Local API via `getPayload({ config })`,
  scheduled by **systemd user timers** named `newsromania-*`.
- **PostgreSQL 17 + Redis 7**: own rootless-Docker compose services
  (`compose.yaml`), internal network, resource limits.

### Ports (reserved range 3100–3199; 3000–3002 are another tenant's — never touch)
| Port | Binding | Service |
|------|---------|---------|
| 3100 | published (nginx proxies to it) | Next app (dev & prod) |
| 3132 | 127.0.0.1 only | Postgres (host-side dev/workers/backup access) |
| 3179 | 127.0.0.1 only | Redis (host-side dev/workers access) |

Only :3100 is ever exposed beyond loopback. Loopback DB/Redis binds stay
inside the allowed 3100–3199 range.

### Env perspective
`.env` holds HOST-perspective URLs (`127.0.0.1:3132` / `127.0.0.1:3179`).
The app container in compose overrides `DATABASE_URL`/`REDIS_URL` with
service-DNS values (`postgres:5432`, `redis:6379`). Never hardcode either.

## 2. Runtime rules (apply to ALL code)

- `export PATH="$HOME/bin:$PATH"` before any node/npm in shells.
- Redis keys ALWAYS prefixed `newsromania:` (use `REDIS_KEY_PREFIX`). Never
  FLUSHALL/FLUSHDB.
- Secrets only from env. Never printed/logged. AdSense publisher id is public.
- Romanian UI copy, comma-below diacritics. WCAG AA everywhere.
- Content routes render dynamically (`export const dynamic = 'force-dynamic'`)
  — ad decisions are per-request. Hot data cached in Redis, not Next ISR.
- All systemd user units/timers named `newsromania-*`. User-level only.

## 3. Payload collections (slugs fixed — code to these)

- `users` — auth; `role: admin | editor | author` (select, required,
  default author). Access: admin all; editor read/write all content +
  publish; author create/update OWN drafts only, never publish, never delete
  published. Only admin manages users/config.
- `media` — uploads to `media/` dir; `alt` (text, required); sharp sizes
  thumbnail 480w / card 960w / hero 1600w. Owned images only.
- `articles` — ORIGINAL articles. Fields: `title`, `slug` (unique, ro-slugified),
  `category` (rel → categories), `tags` (rel → tags, many), `author`
  (rel → users), `excerpt` (textarea ≤ 300), `body` (Lexical richText),
  `featuredImage` (rel → media), `status` via Payload drafts
  (versions+drafts+autosave, schedulePublish enabled), SEO group:
  `metaTitle`, `metaDescription`, `focusKeyword`, `seoScore`
  (`green|amber|red|unscored`, admin-readonly, shown in list), `seoReport`
  (json, hidden). Access: published readable by all; drafts by owner/editor+.
  Hook afterChange: revalidate/purge Redis feed caches.
- `aggregated-items` — third-party stories. Fields: `title`, `slug`, `guid`
  (unique, indexed — dedup key), `sourceUrl` (canonical at publisher),
  `sourceName`, `sourceHomepage`, `feed` (rel → feeds), `excerpt` (AI, may be
  empty when linkOnly), `linkOnly` (bool), `category` (rel), `tags`,
  `imageUrl` + `imageAllowed` (bool — only rss enclosure/media:content),
  `publishedAt`, `clusterKey` (indexed — near-dup clustering),
  `contentHash` (skip re-summarization), `archived` (bool, default false).
  NEVER stores full third-party text.
- `categories` — `name`, `slug` (the 8 canonical slugs seeded; extensible).
- `tags` — `name`, `slug`.
- `feeds` — RSS sources: `name`, `url` (unique), `homepage`, `active` (bool,
  default false), `excerptPolicy` (`link-only` default | `ai-excerpt` — owner
  flips after checking publisher T&Cs; legal gate 0.1), `defaultCategory`
  (rel), `pollMinutes` (default 30), health: `lastFetchedAt`, `lastItemAt`,
  `lastError`, `consecutiveFailures` (admin-readonly).
- `consent-records` — `choice` (`accepted|refused|withdrawn`), `ts`,
  `visitorId` (nullable — only if accepted), `ipHash` (sha256(ip+PAYLOAD_SECRET),
  never raw IP), `userAgent` (truncated 160). Create-only via API; no public read.
- `cdp-events` — `visitorId` (indexed), `type` (`page_view|article_click|
  scroll_depth|time_on_page|category_read|ad_impression|ad_click`), `path`,
  `articleId?`, `category?`, `value?` (number), `region`, `ts`. Insert-only.
- `cdp-profiles` — `visitorId` (unique, indexed), `interests` (json:
  {categorySlug: weight}), `lastRegion`, `lastSeenAt`, `visits`,
  `consentState`. Upserted by profile aggregation.
- `social-queue` — `contentType` (`original|aggregated`), `refId`, `platform`
  (`facebook|instagram|twitter`), `caption` (per-platform formatted),
  `imageUrl`, `link`, `scheduledFor`, `status`
  (`queued|approved|posted|skipped`), `postedAt?`. Executed manually via
  Claude in Chrome — NO Meta/X APIs anywhere.
- `llm-usage` — `day` (YYYY-MM-DD, indexed), `provider`, `model`, `purpose`
  (`summarize|categorize|captions|seed`), `inputTokens`, `outputTokens`,
  `calls`, `estCostUsd`. Incremented by the LLM service.

### Global: `site-config` (Section 10 admin schema — all knobs, no code changes)
Groups: `adNetworks` { adSensePublisherId (default from env), adUnitIds:
array of {slot, unitId, format}, amazonPartnerTags: array of {marketplace,
tag} (seeded: www.amazon.de → newsr01-21 pending owner confirmation) },
`localeRules`: array {country, region, adSet}, `adFrequency`: array {region,
everyNth} (seeded UK:3, RO:5, default:4), `behaviouralTargeting` { enabled:
true, requiresConsent: true (readonly true) }, `socialPlatforms` { pageUrls,
postingSchedule: array of HH:mm (seeded 09:00/13:00/18:00/21:00) },
`gdpr` { consentVersion (int, bump to re-prompt), cookieRetentionDays: 180 },
`cdp` { retentionDays: 365 }, `editorial` { seoLanguage: 'ro', minWordCount:
300, blockPublishOnRed: false }, `aggregation` { itemTtlDays: 14,
frontPageMaxAgeHours: 72, maxSummariesPerRun: 40 }.

## 4. Service interfaces (exact module paths)

- `src/lib/payload.ts` → `getPayloadClient()` (cached `getPayload({config})`).
- `src/lib/redis.ts` → `getRedis()` (ioredis, lazy singleton), `rkey(...parts)`
  → `newsromania:<parts.join(':')>`; helpers `cacheJson(key, ttlSec, fn)`.
- `src/lib/geo.ts` → `resolveGeo(ip): { country: string, region: string,
  adSet: string }`. Provider chain: `x-geo-country` header override (dev) →
  geoip-lite lookup → 'default'. Region/adSet resolved via site-config
  localeRules. Cached `newsromania:geo:<ip>` TTL 6h. Nginx passes
  `X-Real-IP`; use it (fallback: connection remote).
- `src/lib/consent.ts` → cookie `nr_consent` (JSON {v, choice, ts},
  SameSite=Lax, 180d). `readConsent(cookies): 'accepted'|'refused'|'unknown'`.
  Server + client safe. NOTHING reads/writes any other cookie before
  choice === 'accepted' (visitor id cookie `nr_vid` only when accepted).
- `src/lib/ads/engine.ts` → `getAdPlan({ region, adSet, categorySlug,
  consent, profile }): AdPlan` where `AdPlan = { everyNth: number,
  slots: AdDecision[] }`, `AdDecision = { placement: 'feed'|'article'|
  'rail'|'leaderboard', network: 'adsense'|'amazon'|'house', adsense?:
  { unitId?, format, npa: boolean }, amazon?: { keywords: string[],
  marketplace, partnerTag } }`. No consent ⇒ npa=true and no
  profile-derived keywords (category-contextual only — that is not
  behavioural). Consent ⇒ blend profile top-interests.
- `src/lib/ads/amazon.ts` → wraps vendored SDK (`vendor/creatorsapi-nodejs-sdk`,
  `file:` dep). `searchProducts({ keywords, marketplace, partnerTag, count })`
  cached `newsromania:amazon:<marketplace>:<hash>` TTL 24h; throttle-aware
  (SDK throttle exception → backoff + serve stale). NEVER called per-view
  uncached. Marketplace map: GB→co.uk, FR→fr, US→com, else→de.
- `src/lib/llm.ts` → OpenAI (env OPENAI_API_KEY, OPENAI_MODEL_CHAT).
  `summarizeExcerpt(item)` (≤ 55 Romanian words, transformative, no verbatim
  >8-word runs), `categorizeAndTag(item)` (one of the 8 slugs + ≤4 tags),
  `writeCaptions(story)` (per-platform), all logging to `llm-usage`.
  Provider switch via AI_DEFAULT_PROVIDER_* env (only 'openai' implemented;
  interface ready for others).
- `src/lib/cdp.ts` → `trackEvents(events[])` (validates consent server-side,
  inserts cdp-events), `getProfile(visitorId)` (Redis-cached 10min).
- `src/lib/seo-analyzer/` → pure TS, no DOM: `analyze(input: { title,
  metaTitle, metaDescription, slug, focusKeyword, bodyText, headings[],
  images[{alt}], links[{internal}], wordCount }): { score: 'green'|'amber'|
  'red', checks: Check[] }`; Romanian calibration (diacritic-insensitive
  keyword matching, RO transition words list, sentence length ≤ 25 words
  target, passive-voice heuristic for RO ('a fi' + participle), min 300
  words). Admin UI component renders it live in the article editor and
  writes seoScore/seoReport on save. Publish gate honors blockPublishOnRed.

## 5. API routes (first-party only)

- `POST /api/consent` { choice } → sets/clears cookies, writes consent-record.
- `POST /api/cdp/events` { events[] } → 204; drops silently if no consent;
  rate-limit 60/min/IP via Redis.
- `GET /api/health` → { ok, db, redis, version } (used by newsromania-health
  timer; no secrets).
- Payload's own /api/* (REST) stays under the (payload) group defaults.

## 6. Frontend integration (replaces mock)

- `src/lib/content.ts` → `getFeed({ page, categorySlug? })` merging published
  articles + non-archived aggregated-items sorted by publishedAt,
  Redis-cached 60s (`newsromania:feed:<cat>:<page>`); `getArticle(slug)`;
  `getAggregated(slug)`; `search(q)` (Postgres ILIKE, diacritic-insensitive
  via unaccent-style normalization in JS on a fetched window — keep simple).
- `src/lib/mock-data.ts` is DELETED from runtime paths; its 6 evergreen
  originals + fixtures move to `scripts/seed/fixtures.ts` (dev seed + tests).
- ArticleCard/pages keep their exact rendering contracts (byline vs Sursa;
  canonical rules; JSON-LD via serializeJsonLd) but read Payload shapes via
  a mapper `toFeedItem()` preserving the existing `FeedItem` type.
- Ad slots become server-decided: FeedList/article/rail slots take an
  `AdDecision` and render `<AdSlot>` (AdSense `<ins>` w/ unitId or empty
  reserved box) or `<AmazonProductAd>` (clearly labelled „Publicitate").
- Consent banner: bottom sheet, equal-weight „Accept" / „Refuz" buttons +
  link to /politica-de-cookies; zero cookies before choice; Google Consent
  Mode v2 defaults denied, updated on accept; withdraw at /setari-cookies.

## 7. Workers (systemd user timers)

- `newsromania-ingest` (every 20 min): scripts/worker/ingest.mjs — for each
  active feed: fetch (rss-parser, 15s timeout, etag/last-modified), dedup by
  guid, normalize legacy cedilla diacritics (ş/ţ → ș/ț) in stored titles/
  excerpts, cluster near-dups (normalized-title Jaccard ≥ 0.6 → same
  clusterKey, keep earliest), respect excerptPolicy (link-only ⇒ no LLM),
  summarize+categorize via llm.ts (≤ maxSummariesPerRun), image only from
  enclosure/media:content, update feed health, archive items older than
  itemTtlDays.
- `newsromania-social` (hourly): scripts/worker/social.mjs — new published
  originals + top aggregated → queued social-queue entries with captions at
  next schedule slots. Idempotent (one entry per story+platform).
- `newsromania-health` (every 5 min): curl /api/health; log to
  ~/.local/state/newsromania/health.log (rotate: keep 7 days).
- `newsromania-backup` (daily 04:15): scripts/db-backup.sh — pg_dump via
  docker exec to backups/ (gitignored), keep 14; ALSO run manually before
  every migration.
- Orchestrator note: ingest+social ARE the Section 11 pipeline; the
  „agentic layer" = these config-driven workers + per-request ad engine.

## 8. Seed & migration

- `scripts/seed/baseline.mjs` — idempotent: categories, site-config defaults,
  admin user (PAYLOAD_ADMIN_EMAIL/PASSWORD from .env), 6 evergreen originals
  from fixtures (owner: Redacția), starter Romanian feeds (all
  `active:false`, `excerptPolicy:'link-only'` — owner enables after T&C check).
- `scripts/seed/import-wordpress.mjs` — Section 22: last 14 days from
  https://newsromania.info/wp-json/wp/v2/posts (paginated, `_embed`), RSS
  fallback; classify owner-written → articles (full text→Lexical, byline)
  vs third-party → aggregated-items (fresh AI excerpt, attribution,
  NO third-party full text); dedup by source URL/GUID; preserves dates;
  imports images ONLY into originals (owner's own uploads).
- Migrations: dev uses adapter push; the committed baseline in
  `src/migrations/` captures the push-created schema. On schema changes
  generate `npx payload migrate:create` and run `npx payload migrate`
  HOST-SIDE against the loopback port (deploy/DEPLOY.md §1) — the container
  entrypoint runs only the server. Backup first (rule).

## 9. Deploy shape (step 14)

- `Dockerfile` — multi-stage, `output:'standalone'`, non-root user, sharp ok.
- `compose.yaml` — services: postgres (pg17-alpine, mem 512m), redis
  (7-alpine, mem 256m, maxmemory 200mb allkeys-lru, requirepass), app
  (build ., mem 1g, publishes 127.0.0.1:3100:3100, env overrides, bind-mount
  ./media). Internal network; healthchecks; log rotation (json-file 10m×3).
- systemd user: `newsromania-app.service` = `docker compose up` wrapper
  (Restart=always) + the timers above.
- `deploy/nginx/newsromania.conf` — server_name newsromania.info
  www.newsromania.info; proxy → 127.0.0.1:3100; /_next/static + /icons +
  /placeholders long-cache; ACME webroot /var/www/newsromania;
  security headers; gzip. `deploy/sudo-block-2-nginx-certbot.sh` — install
  conf, nginx -t, reload, certbot --webroot for newsromania.info (single
  consolidated block #2). DNS cutover stays the owner's manual decision.

## 10. Testing (step 14)

- vitest: seo-analyzer checks, ad engine (region/frequency/consent gating),
  consent cookie logic, ingest dedup/clustering, llm excerpt post-validation
  (word count, no long verbatim runs), geo mapping. LLM calls mocked.
- smoke: scripts/smoke.sh — boots stack, curls all public routes + health +
  consent flow (cookie set/clear) + one cdp event, asserts key invariants.
