# Operations runbook — newsromania.info

Day-2 operations for the running platform. Deployment itself (image build,
nginx, certbot, DNS) lives in `deploy/DEPLOY.md`; this document covers
everything after that. Environment recap: shared VPS, dedicated user
`newsagent`, **no sudo**, rootless Docker, ports 3100/3132/3179 only.

Every shell snippet assumes:

```bash
export PATH="$HOME/bin:$PATH"
export DOCKER_HOST=unix:///run/user/1004/docker.sock
cd /home/newsagent/workspace/newsromania
```

## 1. Start / stop the stack

**Production** (compose profile `app` via the systemd wrapper):

```bash
systemctl --user start newsromania-app     # docker compose --profile app up -d
systemctl --user stop  newsromania-app     # docker compose --profile app down
systemctl --user enable newsromania-app    # start at boot (linger is enabled)
curl -s http://127.0.0.1:3100/api/health   # {"ok":true,"db":true,"redis":true,...}
```

Container supervision stays with dockerd (`restart: unless-stopped`); the
systemd unit only brings the compose stack up/down.

**Dev** (data services only, app on the host):

```bash
docker compose up -d postgres redis
npm run dev                                # :3100
```

**Workers/timers** (installed by `deploy/systemd/install-user-units.sh`):

```bash
systemctl --user list-timers 'newsromania-*'          # 5 timers expected
systemctl --user start newsromania-ingest.service     # force one run now
systemctl --user disable --now newsromania-ingest.timer   # pause ingestion
```

Timer schedule: ingest every 20 min · profiles every 10 min · social hourly ·
backup daily 04:15 · health every 5 min (details: README table).

## 2. Logs

```bash
docker logs --tail 100 newsromania-app                   # app (json-file, 10m x 3)
docker logs --tail 50 newsromania-postgres
docker logs --tail 50 newsromania-redis
journalctl --user -u newsromania-ingest.service -n 50    # any worker run
journalctl --user -u newsromania-social.service -n 50
tail -20 ~/.local/state/newsromania/health.log           # OK/FAIL every 5 min
```

The health log self-truncates above 1 MB (keeps the newest 512 KB), so it can
never fill the shared disk. Docker logs rotate at 10 MB × 3 files per
container.

## 3. Backups

- **Automatic:** `newsromania-backup.timer` — daily 04:15,
  `scripts/db-backup.sh` runs `pg_dump -Fc` through `docker exec` into
  `backups/` (gitignored) and keeps the **newest 14** dumps.
- **Manual:** `./scripts/db-backup.sh` — run it **before every migration**
  (hard rule) and before any risky data operation.
- **Media:** uploads live outside the DB in `./media` (bind-mounted into the
  app container) — include that directory in any off-site backup strategy.

**Restore** (DESTRUCTIVE — stop the app first, confirm with the owner):

```bash
systemctl --user stop newsromania-app
set -a; . ./.env; set +a                    # loads POSTGRES_* without printing
docker exec -i newsromania-postgres pg_restore -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" --clean --if-exists < backups/newsromania-<STAMP>.dump
systemctl --user start newsromania-app
curl -s http://127.0.0.1:3100/api/health
```

## 4. Migrations discipline

Dev uses the Payload adapter's `push` mode; production runs generated
migrations (architecture §8). **Rule: back up first, always** (CLAUDE.md /
arch §7 — restoring the pre-migration dump is the rollback path).

```bash
./scripts/db-backup.sh                       # mandatory before any migration
set -a; . ./.env; set +a
npx payload migrate:create                   # generate migration files (commit them)
npx payload migrate                          # apply (DATABASE_URL in .env already
                                             # points at 127.0.0.1:3132 — host side)
```

If a bad release shipped together with a migration, roll back the image
(`deploy/DEPLOY.md` §7) AND restore the pre-migration dump.

**Rebuild checklist rule:** the app container starts with plain `node
server.js` — it NEVER auto-migrates. Any image rebuild that ships new files
in `src/migrations/` MUST run the backup + `npx payload migrate` block above
before (re)starting the container, then verify with read-only psql that
`select name from payload_migrations` lists every registered migration.
Skipping this leaves new enum values/columns missing in prod (admin saves
fail, dependent features stay silently inert). Every image build also ends
with `docker image prune -f` + a `df -h /` check (disk discipline, §7 /
DEPLOY.md §2).

## 5. Enabling RSS feeds (legal gate — PROJECT_BRIEF 0.1)

All feeds are seeded **disabled** (`active: false`) with
`excerptPolicy: 'link-only'`. The ingest worker ignores inactive feeds, so
nothing is fetched until the owner acts. Per publisher, in this order:

1. Review the publisher's terms & conditions / robots / RSS reuse policy.
2. If aggregation is acceptable: `/admin` → „Surse RSS” (feeds) → open the
   feed → set **Activ** = on. It is picked up on the next 20-min ingest run.
3. `excerptPolicy` stays `link-only` (title + attribution + link out, no AI
   text) unless the T&Cs also permit short excerpts — only then flip it to
   `ai-excerpt` (transformative ≤70-word Romanian summary, attributed).
   These are two separate decisions; document each review.

Aggregated items NEVER store third-party full text, and images are used only
from the feed's own enclosure/media:content fields (on-site display at most).

## 6. Social posting

`newsromania-social.timer` only **prepares** the queue (status `queued`);
nothing is posted without a human. An editor approves entries in `/admin` →
„Coadă socială”, then Claude in Chrome executes the due, approved entries at
human pace. The full operating procedure, pacing/account-safety rules, and
troubleshooting live in **`docs/social-posting-runbook.md`**. Preview run:

```bash
npx payload run scripts/worker/social.mjs -- --dry-run    # no LLM, no writes
```

## 7. Ops dashboard

The Payload admin landing page (`/admin`) shows the operational panel
(`src/components/admin/OpsDashboard.tsx` → `GET /api/admin/ops-stats`,
Redis-cached 60 s, auto-refresh 60 s):

- **Feed health** — per-feed `active`, `lastFetchedAt`,
  `consecutiveFailures`, `lastError` (first place to look on ingest issues)
- **Content** — originals / aggregated counts, published today
- **LLM usage** — last 7 days: calls, tokens, estimated USD (from the
  `llm-usage` collection, incremented by every LLM call)
- **CDP & consent** — events 24 h, profiles, accepted/refused/withdrawn
- **Social queue** — queued / approved / posted today
- **Ad config** — AdSense units and Amazon tags configured

## 8. LLM budget knobs

All spend is bounded by config, not code:

- **Ingest excerpts:** `/admin` → „Configurare site” → „Agregare” →
  `maxSummariesPerRun` (default **40**) — hard cap per 20-min ingest run;
  overflow items are stored `linkOnly` and picked up by later runs.
- **Social captions:** hard-capped at **15 stories/run** in the worker
  (`CAPTION_BUDGET_PER_RUN`); manual `-- --limit N` never exceeds it.
- **WordPress import (one-time):** `IMPORT_MAX_SUMMARIES` (default 60),
  re-runs are idempotent and spend nothing on existing items.
- **Monitoring:** `llm-usage` collection + the dashboard's LLM card. If cost
  trends up, lower `maxSummariesPerRun` and/or switch more feeds to
  `link-only` — both take effect on the next run, no deploy.

## 9. Disk hygiene (~5 GB free on a shared 39 GB disk)

```bash
df -h /                          # check BEFORE any docker build; <3 GB free = STOP
docker image prune -f            # immediately after every image build — the classic
                                 # builder leaves stage images dangling (keep the
                                 # :prev rollback tag!); `docker builder prune -f`
                                 # only covers BuildKit cache and reclaims ~0 here
docker ps -a --filter status=exited   # a FAILED build also leaves a stopped
                                 # intermediate container behind (random name, can
                                 # hold 100s of MB) — `docker rm <name>` any leftover
                                 # that is not a newsromania-* container
npm cache verify                 # npm cache in ~/.npm; `npm cache clean --force` if needed
du -sh backups media .next node_modules   # the usual growth spots
```

Already bounded automatically: backup rotation (newest 14), health.log
(1 MB cap), docker json-file logs (10 MB × 3), Redis `maxmemory 200mb`
(allkeys-lru). `.dockerignore` keeps `node_modules`, `.git`, `.next`,
`media`, `backups`, `docs`, `deploy`, `vendor/*/node_modules` and `.env`
out of build contexts.

## 10. Incident basics

| Symptom | Where to look | Likely fix |
| --- | --- | --- |
| `FAIL` lines in `~/.local/state/newsromania/health.log` | `docker ps`, `docker logs newsromania-app`, `curl -s 127.0.0.1:3100/api/health` | restart the app service; if `db:false`/`redis:false`, check that container |
| Feed shows `consecutiveFailures` climbing in the dashboard | feed's `lastError` in `/admin` → „Surse RSS”; `journalctl --user -u newsromania-ingest.service` | publisher moved/blocked the feed URL — fix the URL or deactivate the feed |
| No new aggregated items | `systemctl --user list-timers 'newsromania-*'` (timer active?), feed `active` flags | re-enable the timer / activate feeds (legal gate §5) |
| Empty ad boxes | expected while AdSense review is pending; after approval see `docs/ads-operations.md` | configuration in `/admin`, not code |
| Social queue empty or drifting | `journalctl --user -u newsromania-social.service`; runbook troubleshooting section | approve/skip aggressively, add posting hours |
| Disk >90 % | §9 above; `du -sh` the growth spots | prune build cache/images, check `backups/` |
| App won't start after deploy | `docker logs newsromania-app`; migration state | rollback per `deploy/DEPLOY.md` §7 (+ restore pre-migration dump if needed) |

Escalation floor: never touch other tenants' processes, host :5432/:3306, or
system units. Anything needing root goes into a `deploy/` hand-over block for
the owner.

## 11. Umami self-hosted analytics (PROJECT_BRIEF §7)

Umami is our **cookieless, GDPR-friendly** analytics — self-hosted as the
`umami` compose service (`ghcr.io/umami-software/umami:postgresql-latest`), on
the internal network, published only to `127.0.0.1:3141`. It is served
**same-origin** at `/stats/*` via a `next.config` rewrite, so the tracker
script (`/stats/script.js`), its collector (`/stats/api/send`) AND the human
dashboard at `/stats` are all first-party — no nginx change, no third-party
host. Umami sets **no cookies** and stores no personal data, so it runs
**consent-free** (no CMP gate), unlike the consent-gated first-party CDP.

**Subpath routing — `BASE_PATH=/stats` + a full-path rewrite (they pair).**
Umami is a Next.js app; by default it emits **root-absolute** asset URLs
(`/_next/*`, `/favicon.ico`, …). Under the `/stats` subpath the browser then
requests those at the site root, where OUR app answers → 404 → the dashboard is
a **blank white page**. The fix is to run Umami itself under the subpath by
setting **`BASE_PATH: /stats`** on the `umami` service (`compose.yaml`); Umami
3.x reads `process.env.BASE_PATH` and prefixes EVERYTHING with it — the
dashboard HTML, every `/_next/*` asset, the tracker (`/stats/script.js`) and the
collector (`/stats/api/send`). Because Umami now expects the `/stats` prefix on
incoming requests, the `next.config.ts` rewrite must forward the **full** path
(keep the prefix) rather than stripping it:

```
source:      '/stats/:path*'
destination: 'http://umami:3000/stats/:path*'   # NOT '.../:path*'
```

These two changes are a matched pair — changing only one leaves `/stats`
broken. The rewrite reads `UMAMI_INTERNAL_URL` (server-runtime, not
`NEXT_PUBLIC`), so the app must be rebuilt/redeployed for the rewrite change to
take effect; the compose `BASE_PATH` change needs the `umami` container
recreated. After deploy, verify all three resolve `200`:
`/stats/script.js`, `/stats/api/send` (POST), and `/stats` (dashboard).

> This is OUR OWN Umami on OUR OWN postgres container — unrelated to the other
> tenant's Umami on the host `:5432`, which stays off-limits (CLAUDE.md §6).

### 11.1 One-time DB setup (Integrate agent — run BEFORE first `up`)

Umami needs a **separate `umami` database + role** on the EXISTING
`newsromania-postgres` container — never the app DB/schema. Fill
`UMAMI_DB_PASSWORD` (+ `UMAMI_APP_SECRET`) in `.env` first, then run this
one-time block (uses the app's `POSTGRES_USER` as the bootstrap superuser; no
secret is printed):

```bash
export PATH="$HOME/bin:$PATH"
export DOCKER_HOST=unix:///run/user/1004/docker.sock
cd /home/newsagent/workspace/newsromania
set -a; . ./.env; set +a
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i newsromania-postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v umami_pw="$UMAMI_DB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE umami LOGIN PASSWORD ' || quote_literal(:'umami_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'umami')\gexec
SELECT 'CREATE DATABASE umami OWNER umami'
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'umami')\gexec
SQL
```

(Idempotent: re-running is a no-op once the role/DB exist. `CREATE DATABASE`
cannot run inside a transaction, hence the `\gexec` pattern rather than a
`DO` block.) Umami applies its own schema migrations automatically on first
container start, into that `umami` DB.

### 11.2 First run (create admin, add the site, set the id)

The website id lives in `.env` as **`UMAMI_WEBSITE_ID`** (a UUID). It is read at
**runtime** by a server component (`src/components/analytics/UmamiScript.tsx`
reads `process.env.UMAMI_WEBSITE_ID` when the layout renders) — it is **NOT** a
`NEXT_PUBLIC_*` build-time value. Changing it therefore only needs an app
**restart**, never a rebuild. The id is public (it appears verbatim as
`data-website-id` in the page HTML), so a server-runtime read is fine. With no
id the tracker renders nothing, so the site is fine before Umami is configured.

> **INTEGRATE automates this.** During integration, INTEGRATE creates the
> `newsromania.info` website in Umami (via the Umami admin API against
> `127.0.0.1:3141`, after the container is healthy) and writes the generated
> UUID into `.env` as `UMAMI_WEBSITE_ID`, then restarts the app. The manual
> steps below are the fallback / reference for doing it by hand.

1. Start the stack (the `umami` service is in the `app` profile, so it comes
   up with `systemctl --user start newsromania-app`). Verify:
   ```bash
   curl -s http://127.0.0.1:3141/api/heartbeat        # {"ok":true} when ready
   docker logs --tail 50 newsromania-umami
   ```
2. Log into the Umami admin **through the site** at
   `https://newsromania.info/stats/` (same-origin; works over TLS with no extra
   nginx config — the dashboard now renders thanks to `BASE_PATH=/stats`).
   Default credentials on a fresh install are `admin` / `umami` — **change the
   password immediately** on first login.
3. Umami admin → **Settings → Websites → Add website**: Name `NewsRomania`,
   Domain `newsromania.info`. Save, then open it and copy the **Website ID**
   (a UUID).
4. Put that id into `.env` as `UMAMI_WEBSITE_ID=<uuid>` and **restart the app**
   (`systemctl --user restart newsromania-app` — no rebuild needed; it is a
   runtime var). Reload the site and confirm hits appear in the Umami
   dashboard. (The literal `stats` is NOT a valid id — it must be the UUID.)

### 11.3 Ops notes

- Backups: the `umami` DB lives on the same postgres container. `pg_dump -Fc`
  it alongside the app DB if analytics history matters
  (`docker exec newsromania-postgres pg_dump -Fc -U umami umami`); it is not
  covered by the app's `scripts/db-backup.sh` (which dumps `$POSTGRES_DB`).
- Direct `:3141` access is for first-run/admin only; public traffic always uses
  the same-origin `/stats/*` path.
- Umami is memory-limited to 384m; if it OOM-restarts under load, raise
  `mem_limit` in `compose.yaml`.
