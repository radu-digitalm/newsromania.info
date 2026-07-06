# CLAUDE.md — newsromania.info

## First action
Read `PROJECT_BRIEF.md` (repo root) before planning or coding. It is the source of truth for architecture, legal gates, and build order. Re-read the relevant section before starting each build step.

## What this project is
News platform: RSS aggregation + AI excerpts (fair-use, always attributed) + original in-house articles (Payload CMS) + geo/behaviour-targeted ads (AdSense + Amazon Creators API) + strict GDPR consent + social posting queue.
Stack: Next.js + Payload, Node services, PostgreSQL + Redis (own rootless containers — see server rules).

## ⚠️ IMPORTANT — server rules (dedicated user, NO sudo)
You run as **`newsagent`** on a shared VPS. This project lives at `/home/newsagent/workspace/newsromania` · web root: `/var/www/newsromania` (owned `newsagent:www-data`). Another tenant (`hermes`) runs digitalm.eu (:3000), its staging (:3001) and Umami analytics (:3002) — their files are OS-protected and off-limits; never probe them.

1. **Scope per project.** `newsagent` will host OTHER websites as sibling folders under `~/workspace/`. In this project's sessions, work ONLY inside `/home/newsagent/workspace/newsromania` and `/var/www/newsromania`. Never read or modify sibling projects, other users' files, or anything outside the project root without explicit user approval in the current session.
2. **NO sudo — never run or request `sudo`/`su`.** Anything requiring root (nginx config, certbot, system packages, firewall, system-level systemd, reboots) is a HAND-OVER: write the exact files/commands into `deploy/` and give the user ONE consolidated copy-paste block. **Batch root needs — never dribble sudo requests one by one.** Expected across the whole project: at most ~2 blocks (container runtime if missing; nginx + certbot at deploy). nginx config template lives at `deploy/nginx/newsromania.conf`; the user installs it to `/etc/nginx/sites-available/newsromania` and reloads.
3. **Web-root permissions:** keep `/var/www/newsromania` group-readable for nginx — preserve `newsagent:www-data` ownership, `g+rX`, and setgid on directories. Never `chmod -R` tighter.
4. **Ports:** bind ONLY within **3100–3199**. 3000/3001/3002 belong to the other tenant. Check `ss -tlnp` before binding; record chosen ports in the README.
5. **Containers: rootless only.** Rootless Docker (preferred — standard compose workflow) or Podman. **NEVER request membership in the `docker` group** — it is root-equivalent and forbidden. Own PostgreSQL + Redis run via compose on an internal network; only the app's 31xx port is published. Never `FLUSHALL`/`FLUSHDB`; use the `newsromania:` key prefix.
6. **Host services are off-limits:** never connect to host PostgreSQL :5432 (Umami's) or host MySQL :3306.
7. **systemd/cron:** user-level only (`systemctl --user`, own crontab), entries named `newsromania-*`; linger is already enabled. Never touch system units.
8. Verify `pwd` before any destructive command. NEVER run `rm -rf`, `chmod -R`, `chown -R`, `find -delete`, or glob deletes at or above `~/workspace`. Absolute paths only.
9. **STOP AND ASK before:** anything on the hand-over list (#2), any cross-project action, DNS changes, or deleting data.

## Where you run — detect, then adapt (maximum autonomy)
Run `whoami && hostname` first.
- **On the owner's laptop** (user is not `newsagent`): operate the server over SSH — `ssh -i ~/.ssh/newsagent.key newsagent@92.222.91.167`. Develop in the local repo; sync local → server with git or rsync. You are expected to do ALL server setup yourself over SSH, including the user-local toolchain (nvm, Node per `.nvmrc`, git config, and Claude Code for future server-native sessions) — none of that needs sudo. NEVER copy, print, cat, or commit the private key.
- **On the server as `newsagent`**: you are in the project root; all rules above apply directly.
- **Autonomy contract:** the owner's involvement is limited to (a) pasting the bootstrap prompt, (b) filling `.env` on the server once, (c) applying your batched sudo blocks (≤2 expected, ever). Do everything else yourself without asking, within the rules above.

## Secrets
- All credentials live in `.env` (chmod 600) — never committed, never hardcoded, never printed to terminal, logs, or files.
- Amazon Creators API env vars: `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET`, `AMAZON_CREATORS_CREDENTIAL_VERSION=3.2` (EU region, LWA auth).
- Never attempt to access other users' or sibling projects' `.env` files, credentials, or key files.
- The AdSense publisher ID `ca-pub-8098077913729716` is public-facing and fine to have in code.

## Fixed integration decisions (do not re-litigate)
- Amazon Creators API via the vendored official SDK at `/vendor/creatorsapi-nodejs-sdk` (`file:` dependency; `npm install && npm run build` inside it). Marketplace is set per request and the `partnerTag` must match that marketplace. Cache product results in Redis — never call the API per page view.
- AdSense site review is PENDING: ad slots render blank until approval. This is expected — never insert fake or placeholder ads.
- Social posting is executed by Claude in Chrome from a prepared posting queue — do NOT build Meta/X API posting.
- GDPR: Refuse must be as easy as Accept; zero tracking or cookie reads before consent.
- Editorial backend: Payload (Next.js-native). Original articles and aggregated items are distinct content types — aggregated items are excerpt + attribution + link out, never full text.
- Runtime: the app + its OWN PostgreSQL + Redis run via **rootless** Docker/Podman compose (resource limits, internal network); only the app's port from 3100–3199 is published for nginx. The host's Postgres (:5432 = Umami) and host MySQL are never used.

## Assets & content seed
- Brand logo provided in `assets/` — use it for the site header, favicon derivation, and OG/social images.
- One-time content seed at build step 5 (PROJECT_BRIEF.md Section 22): import the last ~14 days of posts from the existing site `https://newsromania.info` (the owner's WordPress site) via its REST API (`/wp-json/wp/v2/posts`), RSS as fallback. Classify on import: third-party aggregated stories → aggregated type (fresh AI excerpt, original publisher attribution + link out — never carry over third-party full text); owner-written posts → original articles. Idempotent script in `scripts/seed/`, deduped by source URL/GUID.

## Workflow
- Follow the build order in `PROJECT_BRIEF.md` Section 13. Small commits per step; run tests before marking a step done.
- If a command could affect anything outside this repo, propose it and wait for approval before running it.
