# Automated Facebook PAGE posting (Graph API) — setup

The server posts the **impact-of-the-hour** to the NewsRomania **page**
automatically, every hour: a **photo** post (the article's image) with the
headline + `Link în primul comentariu`, then the **article link as the first
comment**. This is official, unattended, and ban-safe (API posting to your own
page is the sanctioned path).

**GROUPS are not done here** — Meta removed publishing to groups via the Graph
API in April 2024, so the 5–6 group fan-out stays manual/browser
(`docs/facebook-posting-agent-prompt.md`, run locally). Owner decision 2026-07
revises the earlier "no Meta API" rule for the page only.

The worker is **dormant** until you set `FB_PAGE_ID` + `FB_PAGE_ACCESS_TOKEN` —
it ships live and simply no-ops until then.

## One-time: get a non-expiring Page token

1. **developers.facebook.com → My Apps → Create App → Business.** Note the
   **App ID** and **App Secret** (Settings → Basic).
2. **Graph API Explorer** (Tools menu): pick your app → **Generate Access
   Token** → grant **`pages_manage_posts`** + **`pages_read_engagement`** →
   select the **NewsRomania** page. Copy the short-lived **user** token it gives.
   - For posting to **your own** page as the app admin/developer, **Standard
     Access (dev mode) is enough — no App Review**. (App Review is only needed to
     act on *other people's* pages. Verify against current Meta docs; they tighten
     periodically.)
3. Turn that short token into a permanent **Page** token (a page token derived
   from a long-lived user token doesn't expire):
   ```bash
   FB_APP_ID=<your-app-id> FB_APP_SECRET=<your-app-secret> \
     node scripts/facebook-longlived-token.mjs <SHORT_USER_TOKEN> "News Romania"
   ```
   It prints `FB_PAGE_ID=…` and `FB_PAGE_ACCESS_TOKEN=…`. **Keep these secret.**
4. Put them in `.env` (chmod 600):
   ```
   FB_PAGE_ID=...
   FB_PAGE_ACCESS_TOKEN=...
   # FB_GRAPH_VERSION=v21.0   # optional, defaults to a recent version
   ```

## Install the hourly timer (one-time)

```bash
export PATH="$HOME/bin:$PATH"
bash deploy/systemd/install-user-units.sh        # picks up newsromania-facebook.{service,timer}
systemctl --user list-timers | grep facebook
```

## Verify

```bash
export PATH="$HOME/bin:$PATH"; cd /home/newsagent/workspace/newsromania
# Safe: logs the chosen story + message, posts NOTHING:
npx payload run scripts/worker/facebook-page.mjs -- --dry-run
# Real run (only after the token is set) — posts one story to the page:
npx payload run scripts/worker/facebook-page.mjs
```

## Notes
- One story per run, hourly (`OnCalendar=*:05`). Never reposts a story
  (per-story dedup in Redis, `newsromania:fbpage:posted:*`, 4-day TTL — longer
  than the 48h candidate window).
- Selection reuses the same impact scorer as the queue
  (`scripts/worker/lib/impact.mjs`): cross-source cluster size, source tier,
  image, recency — breaking/among-many-outlets wins.
- The photo is the article's `og:image` (same image the site + shares use),
  falling back to `/og-default.png`.
- If a comment fails, the photo post stays up (logged), and the story is still
  marked posted so it isn't duplicated next hour.
- Token rotation: if you reset your Facebook password or lose page admin, the
  token dies — re-run the helper in step 3.
