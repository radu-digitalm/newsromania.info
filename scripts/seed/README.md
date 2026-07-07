# Seed — baseline

Idempotent baseline seed per `docs/architecture.md` §8. Populates a fresh
database with everything the app needs to boot with real content shapes.

## How to run (and re-run)

From the project root, with the compose stack up (Postgres on
`127.0.0.1:3132`, Redis on `127.0.0.1:3179`) and `.env` filled in:

```bash
export PATH="$HOME/bin:$PATH"
npx payload run scripts/seed/baseline.mjs
```

`payload run` loads `.env` and handles the TypeScript config import
(`src/payload.config.ts`); the script additionally has its own minimal `.env`
fallback loader (fills only missing keys, never prints values), so it also
works under plain `node` given a TS-capable loader.

**Re-running is always safe.** Every entity is matched by a natural key first
and only created when missing — a second run creates zero new rows (verified
against all tables, including the articles versions table):

| Entity             | Natural key                                                     |
| ------------------ | --------------------------------------------------------------- |
| categories         | `slug`                                                          |
| users              | `email`                                                         |
| site-config global | row existence (`id`/`createdAt` — defaults-on-read don't count) |
| articles           | `slug`                                                          |
| aggregated-items   | `guid`                                                          |
| feeds              | `url`                                                           |

Because the site-config global is only written when the row does not exist
yet, re-runs never overwrite knobs the owner has since tuned in the admin.

## What it creates

- **8 categories** — the canonical slugs, in `src/config/site.ts` order:
  actualitate, politica, economie, externe, sport, sanatate, tehnologie,
  cultura.
- **2 users**
  - the admin, from `PAYLOAD_ADMIN_EMAIL` / `PAYLOAD_ADMIN_PASSWORD` (role
    `admin`);
  - „Redacția NewsRomania” (`redactia@newsromania.info`, role `author`) — the
    byline account for the evergreen originals. Its password is random and is
    never printed or stored anywhere; an admin can reset it from the Payload
    admin if the account ever needs to log in.
- **`site-config` global defaults** (arch §3, v2.2): adFrequency UK:3 / RO:3 /
  default:3 (owner decision: an ad block between max 3 news, still tunable in
  admin); amazonPartnerTags `www.amazon.de` → `AMAZON_PARTNER_TAG_DEFAULT`
  from env (pending owner confirmation); postingSchedule 09:00 / 13:00 /
  18:00 / 21:00; GDPR consentVersion 1, cookie retention 180 days; CDP
  retention 365 days; editorial ro / 300 words / blockPublishOnRed off;
  aggregation TTL 14 days / front page 72 h / max 40 summaries per run.
- **6 original articles** (`scripts/seed/fixtures.ts`, frozen from the old
  mock data in `fixtures-source.ts`) — published, bylined to Redacția,
  paragraphs converted to Lexical, fixture dates preserved via `createdAt`
  (articles have no `publishedAt` field). `featuredImage` is intentionally
  left empty — no media import in the baseline; the frontend's category
  placeholder fallback renders instead.
- **2 aggregated items** — only the freshest two fixtures (fictional
  `example.org` publishers, never real outlets), `guid` = source URL,
  `linkOnly: false` (they ship with excerpts), no image.
- **5 starter Romanian RSS feeds** — Digi24, HotNews, G4Media, Agerpres,
  Libertatea, each with correct feed URL + homepage, `pollMinutes: 30`,
  default category „Actualitate”.

## ⚠️ Feeds ship DISABLED (legal gate)

All starter feeds are seeded with `active: false` and
`excerptPolicy: 'link-only'`. Per PROJECT_BRIEF 0.1, the owner must review
each publisher's terms & conditions / excerpt policy before flipping a feed
to `active` (and, separately, before allowing `ai-excerpt`). The ingest
worker ignores inactive feeds, so nothing is fetched until that manual
confirmation happens in the Payload admin.

## Files

- `baseline.mjs` — the runnable seed (Node ESM, Payload Local API).
- `fixtures.ts` — the seed data consumed by `baseline.mjs` and tests.
- `fixtures-source.ts` — frozen verbatim copy of the old mock data
  (reference only; not imported at runtime).
- `import-wordpress.mjs` — separate one-time WordPress import (arch §8 /
  brief §22): last 14 days from the owner's WP site, classified
  original vs aggregated, idempotent (originals dedup by slug, aggregated
  by guid). Run: `npx payload run scripts/seed/import-wordpress.mjs`.
  Optional budgets via env: `IMPORT_MAX_SUMMARIES` (default 60),
  `IMPORT_MAX_IMAGES` (default 30), `IMPORT_LIMIT` (dev/test).
  Execution report: [`IMPORT-REPORT.md`](IMPORT-REPORT.md).
