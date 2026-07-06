# newsromania.info

News platform: RSS aggregation with fair-use AI excerpts (always attributed),
original in-house articles via Payload CMS, geo/behaviour-targeted ads
(AdSense + Amazon Creators API), strict GDPR consent, and a social posting
queue. See `PROJECT_BRIEF.md` (source of truth) and `CLAUDE.md` (server rules).

## Server facts

- Runs as dedicated user `newsagent` on a shared VPS — **no sudo**; root-level
  needs are batched hand-over blocks in `deploy/`.
- Project root: `/home/newsagent/workspace/newsromania` · web root: `/var/www/newsromania`.
- Containers: **rootless Docker** (binaries in `~/bin`); own PostgreSQL + Redis
  on an internal compose network. Host Postgres :5432 / MySQL :3306 are off-limits.

## Ports (reserved range 3100–3199)

| Port | Service | Exposure |
|------|---------|----------|
| 3100 | Next.js + Payload app | published on loopback; nginx proxies newsromania.info → :3100 |
| —    | PostgreSQL, Redis | internal compose network only, never published |

Verified free before reservation (`ss -tlnp`, 2026-07-06): nothing listens in
3100–3199. Ports 3000/3001/3002 belong to the other tenant — never touch.

## Toolchain (user-local, no root)

- Node via nvm — version pinned in `.nvmrc`.
- Docker 29.6.1 static + rootless extras in `~/bin`.
  One-time finish after the owner applies `deploy/sudo-block-1-container-runtime.sh`:
  `bash scripts/setup-rootless-docker.sh`

## Layout

- `assets/` — brand logos (`logo-full.png`: header + OG images; `logo-symbol.png`: favicon/app-icon source)
- `vendor/` — vendored Amazon Creators API Node.js SDK (zip; extracted at build step 10)
- `deploy/` — hand-over material for the owner (sudo blocks, nginx config template)
- `scripts/` — operational scripts run as `newsagent` (setup, seed, maintenance)

## Secrets

All credentials live in `.env` (chmod 600, git-ignored, owner-filled).
`.env.example` documents every variable.
