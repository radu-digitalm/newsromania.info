# newsromania.info

Romanian news platform: RSS aggregation with fair-use AI excerpts (always
attributed, never full third-party text), original in-house articles via
Payload CMS, geo/behaviour-targeted ads (AdSense + Amazon Creators API),
strict GDPR consent, and a human-supervised social posting queue.

Authoritative documents:

- `PROJECT_BRIEF.md` — requirements and legal gates (source of truth)
- `CLAUDE.md` — shared-server rules (no sudo, ports, rootless containers)
- `docs/architecture.md` — the code contract (collections, services, workers)
- `docs/operations.md` — day-2 runbook (start/stop, logs, backups, incidents)
- `deploy/DEPLOY.md` — production deployment runbook

## Stack

| Layer      | Choice                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- |
| App        | **Next.js 16** (App Router, standalone output) + **React 19** + Tailwind v4            |
| CMS        | **Payload 3.85** (Next-native — admin at `/admin`, Postgres adapter, Lexical richtext) |
| Data       | **PostgreSQL 17** + **Redis 7** — own containers via **rootless Docker** compose       |
| Workers    | Plain Node scripts (`scripts/worker/*.mjs`, Payload Local API) on systemd user timers  |
| AI         | OpenAI (excerpts ≤ 55 Romanian words, categorization, social captions)                 |
| Ads        | AdSense (site review pending) + Amazon Creators API (vendored SDK, Redis-cached)       |

There is no separate backend server — Payload runs inside the Next app and
workers use its Local API directly.

## Server facts (shared VPS, dedicated user)

- Runs as dedicated user `newsagent` — **no sudo**. Root-level needs are
  batched hand-over blocks in `deploy/` (only one remains:
  `deploy/sudo-block-2-nginx-certbot.sh`).
- Project root: `/home/newsagent/workspace/newsromania` · web root:
  `/var/www/newsromania` (owned `newsagent:www-data`, `g+rX`, setgid dirs).
- Rootless Docker (binaries in `~/bin`; socket
  `unix:///run/user/1004/docker.sock`). Host Postgres :5432 / MySQL :3306
  belong to other tenants and are off-limits.
- Every shell needs: `export PATH="$HOME/bin:$PATH"` (docker additionally:
  `export DOCKER_HOST=unix:///run/user/1004/docker.sock`).

## Ports (reserved range 3100–3199)

| Port | Binding                    | Service | Rationale                                                          |
| ---- | -------------------------- | ------- | ------------------------------------------------------------------ |
| 3100 | 127.0.0.1 (nginx proxies)  | Next.js + Payload app (dev & prod)     | the ONLY port exposed beyond the compose network    |
| 3132 | 127.0.0.1 only             | PostgreSQL (container port 5432)       | host-side access for workers, migrations, backups   |
| 3179 | 127.0.0.1 only             | Redis (container port 6379)            | host-side access for workers and dev                |

Rationale: 3000–3002 belong to the other tenant (digitalm.eu + Umami) — this
project owns 3100–3199 and even loopback DB/Redis binds stay inside that
range. Verified free before reservation (`ss -tlnp`, 2026-07-06).

`.env` holds HOST-perspective URLs (`127.0.0.1:3132` / `127.0.0.1:3179`);
the app container overrides them with service-DNS values in `compose.yaml`.

## Quickstart (dev)

```bash
export PATH="$HOME/bin:$PATH"
export DOCKER_HOST=unix:///run/user/1004/docker.sock
cd /home/newsagent/workspace/newsromania

cp .env.example .env && chmod 600 .env   # fill in values (owner)
docker compose up -d postgres redis      # data services only (no app profile)
npm install
npm run dev                              # dev server on :3100

# one-time database seeds (idempotent, safe to re-run):
npx payload run scripts/seed/baseline.mjs          # categories, admin, config, feeds
npx payload run scripts/seed/import-wordpress.mjs  # 14-day WP import (see scripts/seed/)
```

Other scripts:

```bash
npm run build      # production build (standalone)
npm run start      # serve the production build on :3100
npm run lint && npm run typecheck
npm run icons      # regenerate favicon/app icons/OG/placeholders from assets/
```

## Admin

Payload admin lives at **`/admin`** (`http://127.0.0.1:3100/admin` before DNS
cutover). Credentials are the `PAYLOAD_ADMIN_EMAIL` / `PAYLOAD_ADMIN_PASSWORD`
values from `.env` (account created by the baseline seed — never printed
anywhere). Roles: `admin` (everything), `editor` (all content + publish),
`author` (own drafts only). All operational knobs live in the „Configurare
site” global — no code changes needed for ad units, ad frequency, posting
hours, GDPR versions, or aggregation budgets. An ops dashboard (feed health,
LLM cost, CDP, social queue) renders on the admin landing page.

## Workers & systemd user units

Installed/refreshed by `bash deploy/systemd/install-user-units.sh`
(symlinks into `~/.config/systemd/user`, enables the timers). User-level
only (`systemctl --user`); linger is enabled so they survive logout/reboot.

| Unit                  | Schedule            | What it does                                                                       |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `newsromania-ingest`  | every 20 min        | RSS ingest: fetch active feeds, dedup/cluster, AI excerpts per policy, feed health |
| `newsromania-profiles`| every 10 min        | CDP profile aggregation, event retention, GDPR deletion on consent withdrawal      |
| `newsromania-social`  | hourly              | Fills the social queue (captions, schedule slots) — posting itself stays manual    |
| `newsromania-backup`  | daily 04:15         | `scripts/db-backup.sh` — `pg_dump -Fc` into `backups/`, keeps newest 14            |
| `newsromania-health`  | every 5 min         | Curls `/api/health`, logs OK/FAIL to `~/.local/state/newsromania/health.log`       |
| `newsromania-app`     | (no timer; service) | `docker compose --profile app up/down` wrapper — the production stack              |

`newsromania-app` is installed but NOT enabled by the install script;
enabling it (boot persistence) is a deploy step — see `deploy/DEPLOY.md`.

## Tests & smoke

```bash
npm test           # vitest — SEO analyzer, ad engine, consent, ingest, LLM guards, geo…
npm run smoke      # scripts/smoke.sh — black-box checks against a RUNNING app on :3100
```

The smoke script asserts the key invariants: no cookies before consent,
consent accept/refuse flow, aggregated canonical → publisher, JSON-LD on
originals, geo ad spacing (GB denser than RO), health endpoint, branded 404.

## Deploy

Full runbook: **`deploy/DEPLOY.md`** (migrations → single disk-disciplined
image build → `systemctl --user start newsromania-app` → sudo block 2 for
nginx/certbot → DNS cutover, which stays the owner's manual decision).
Day-2 operations (logs, backups/restore, incidents): **`docs/operations.md`**.

## Project layout

- `src/app/(frontend)/` — public site (home, `/stiri/[slug]`, categories, search, legal)
- `src/app/(payload)/` — Payload admin + REST/GraphQL API
- `src/app/api/` — first-party routes: consent, CDP events, health, admin ops-stats
- `src/collections/`, `src/globals/` — Payload schema (see `docs/architecture.md` §3)
- `src/lib/` — services: content, ads engine, amazon, llm, geo, consent, cdp, seo-analyzer
- `scripts/worker/` — ingest / profiles / social workers (systemd timers)
- `scripts/seed/` — baseline seed + one-time WordPress import (own README)
- `scripts/` — db-backup.sh, smoke.sh, setup-rootless-docker.sh, icons, dev helpers
- `deploy/` — DEPLOY.md, nginx template, systemd units, sudo hand-over blocks
- `docs/` — architecture contract, operations runbook, design, SEO, ads, social runbooks
- `vendor/` — vendored Amazon Creators API Node.js SDK (`file:` dependency)
- `assets/` — brand logos (header/OG + favicon source)

## Build-order status (PROJECT_BRIEF §13)

| #   | Step                                              | Status |
| --- | ------------------------------------------------- | ------ |
| 1   | Next.js frontend skeleton + design system         | ✅ done („Broadsheet Tricolor”, `docs/design-direction.md`) |
| 2   | Backend + PostgreSQL schema                       | ✅ done (as Payload collections — no separate Express, by design) |
| 3   | Editorial backend (roles, drafts, media)          | ✅ done (Payload 3.85, `/admin`) |
| 4   | SEO analyzer live in the editor (Romanian)        | ✅ done (`src/lib/seo-analyzer/`) |
| 5   | RSS parser + AI excerpts + one-time content seed  | ✅ done (ingest worker + `scripts/seed/`) |
| 6   | Basic ad injection (geo + locale, server-side)    | ✅ done (`src/lib/ads/engine.ts`) |
| 7   | GDPR consent banner (strict, no dark patterns)    | ✅ done (Consent Mode v2, `/setari-cookies`) |
| 8   | CDP visitor tracking + interest profiling         | ✅ done (consent-gated, profiles worker) |
| 9   | Behavioural targeting layer (consent-gated)       | ✅ done (profile keywords only after „Accept”) |
| 10  | AdSense + Amazon Creators API integrations        | ✅ done (units blank until AdSense review passes — expected) |
| 11  | Agentic orchestration layer                       | ✅ done (config-driven workers + per-request ad engine) |
| 12  | Social queue + Claude in Chrome publishing        | ✅ done (`docs/social-posting-runbook.md`) |
| 13  | Admin dashboard for all config parameters         | ✅ done (site-config global + ops dashboard) |
| 14  | Tests, deploy + monitor (shared-server guardrails)| ✅ done (vitest + smoke; deploy assets ready — DNS cutover pending owner) |

Still pending outside the code: AdSense site review, owner confirmation of
the Amazon partner-tag marketplace, per-feed T&C review before activating
RSS sources (legal gate — see `docs/operations.md`), and the DNS cutover.

## Secrets

All credentials live in `.env` (chmod 600, git-ignored, owner-filled) —
never committed, never printed. `.env.example` documents every variable.
