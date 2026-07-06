# DEPLOY.md — production runbook (newsromania.info)

End-to-end path from a built repo to the live site, plus day-2 operations
(backup/restore, rollback, health). Environment: shared VPS, dedicated user
`newsagent`, **no root** — the only root step is
[`deploy/sudo-block-2-nginx-certbot.sh`](sudo-block-2-nginx-certbot.sh).

Every shell snippet assumes:

```bash
export PATH="$HOME/bin:$PATH"
export DOCKER_HOST=unix:///run/user/1004/docker.sock
cd /home/newsagent/workspace/newsromania
```

## 0. Prerequisites (already done)

- **Sudo block 1** applied (`deploy/sudo-block-1-container-runtime.sh`):
  rootless Docker runs as the user unit `docker.service`; `newsromania-postgres`
  and `newsromania-redis` are up (compose, internal network, loopback dev
  ports 3132/3179).
- `.env` filled by the owner (chmod 600, never committed/printed).
- Baseline seed + WordPress import executed (steps 5/8 of the build order).
- systemd user units installed (`deploy/systemd/install-user-units.sh`):
  timers `ingest`, `profiles`, `social`, `backup` (daily 04:15), `health`
  (5 min) are **enabled**; `newsromania-app.service` is installed but **not
  enabled** — enabling it is step 3 below.
- Linger is enabled for `newsagent`, so enabled user units survive logout and
  start at server boot.

## 1. Database migrations (before the first prod boot, and on schema changes)

Dev used the adapter's `push` mode; production runs generated migrations
(arch §8). **Rule: back up first, always.**

```bash
./scripts/db-backup.sh                        # mandatory before any migration
# host-side, against the loopback dev port of the postgres container:
DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:3132/$POSTGRES_DB" \
  npx payload migrate:create                  # generate (commit the files)
DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:3132/$POSTGRES_DB" \
  npx payload migrate                         # apply
```

(Read `$POSTGRES_*` from `.env` with `set -a; . ./.env; set +a` — never paste
values.)

## 2. Build the production image (ONE build — disk discipline)

The VPS disk is shared and tight. Check first, clean after:

```bash
df -h /                                  # need >= 3 GB free — otherwise STOP
docker compose --profile app build       # multi-stage, no secrets in layers
docker image prune -f                    # drop dangling stage images immediately
                                         # (classic builder; `builder prune` is a no-op here)
df -h /                                  # report the delta
```

Notes:

- `.dockerignore` keeps `node_modules`, `.git`, `.next`, `media`, `backups`,
  `docs`, `deploy`, `vendor/*/node_modules` and **`.env`** out of the context.
- Build-time env vars are dummy ARG defaults (shape-valid only); real values
  come from `.env` at runtime via compose. `NEXT_PUBLIC_*` defaults baked into
  the client bundle are public-facing by design.

### Media directory permission (first deploy only)

The container runs as non-root `node` (uid 1000), which rootless Docker maps
to a subordinate uid on the host — it is NOT `newsagent`. The bind-mounted
`./media` must therefore be writable by "other":

```bash
chmod o+rwx media
```

Uploaded files will appear on the host owned by the mapped subuid; they stay
world-readable (default umask), so host-side workers and backups can read
them.

## 3. Start the app + make it boot-persistent

```bash
systemctl --user start newsromania-app        # docker compose --profile app up -d
curl -s http://127.0.0.1:3100/api/health      # expect {"ok":true,...}
systemctl --user enable newsromania-app       # start at boot (via linger)
```

`newsromania-app.service` is a oneshot+RemainAfterExit wrapper: systemd
starts/stops the compose stack; container supervision (restarts) stays with
dockerd (`restart: unless-stopped`).

## 4. nginx + HTTPS — sudo block 2 (owner, root)

```bash
sudo bash deploy/sudo-block-2-nginx-certbot.sh
```

- Steps 1–4 (vhost → `/etc/nginx/sites-available/newsromania`, web root
  `/var/www/newsromania` `newsagent:www-data` 2775, `nginx -t` + reload,
  certbot install) succeed **before** DNS points here.
- Step 5 (`certbot --nginx --redirect`) needs DNS. If it fails now, re-run
  after cutover:
  `sudo certbot --nginx -d newsromania.info -d www.newsromania.info --redirect`

## 5. DNS cutover — OWNER DECISION

The old WordPress site keeps serving `newsromania.info` until the owner
switches the A/AAAA records to this VPS (92.222.91.167). Nothing in this
repo touches DNS. Suggested order: verify everything through
`http://127.0.0.1:3100` first (or a hosts-file override), then cut over,
then finish certbot (step 4.5). Keep the WP export/backup until the owner is
satisfied.

## 6. Post-deploy checks

```bash
docker ps                                          # postgres, redis, app healthy
curl -s http://127.0.0.1:3100/api/health           # {"ok":true,"db":true,"redis":true}
curl -sI https://newsromania.info | head -5        # 200 + security headers
systemctl --user list-timers 'newsromania-*'       # 5 timers active
tail -3 ~/.local/state/newsromania/health.log      # OK lines every 5 min
docker logs --tail 50 newsromania-app              # no error spam
```

Also: open `/admin` (Payload login), publish a test draft, upload a test
image (verifies the `media` bind-mount + sharp), check the homepage and one
category page.

## 7. Rollback

Keep the previous image tagged before every rebuild:

```bash
docker tag newsromania-app:latest newsromania-app:prev   # BEFORE building new
```

To roll back:

```bash
systemctl --user stop newsromania-app                    # compose --profile app down
docker tag newsromania-app:prev newsromania-app:latest
systemctl --user start newsromania-app
curl -s http://127.0.0.1:3100/api/health
```

If a migration was applied with the bad release, restore the pre-migration
dump (below) — that is why backups before migrations are mandatory.

## 8. Backup & restore

- Automatic: `newsromania-backup.timer`, daily 04:15, keeps the newest 14
  dumps in `backups/` (gitignored). Manual run: `./scripts/db-backup.sh`.
- Health log: `~/.local/state/newsromania/health.log` (self-truncating at
  1 MB).

Restore a dump (DESTRUCTIVE — stop the app first, confirm with the owner):

```bash
systemctl --user stop newsromania-app
set -a; . ./.env; set +a
docker exec -i newsromania-postgres pg_restore -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" --clean --if-exists < backups/newsromania-<STAMP>.dump
systemctl --user start newsromania-app
```

Media files live outside the DB in `./media` — include that directory in any
off-site backup strategy.

## 9. Known deferred items

- **CSP header**: deliberately not set (see comment in
  `deploy/nginx/newsromania.conf`) — build the allowlist after AdSense
  approval; a wrong CSP silently blanks ad slots.
- **GeoIP freshness**: geoip-lite ships a snapshot; a future user timer can
  refresh it with the MaxMind key (documented in `src/lib/geo.ts`).
- **AdSense review pending**: slots render blank until approval — expected.
