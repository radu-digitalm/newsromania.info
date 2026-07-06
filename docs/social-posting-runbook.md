# Social Posting Runbook — Claude in Chrome executes the queue

Operating procedure for publishing the social-queue (PROJECT_BRIEF §9,
architecture.md §7). Code owners: `scripts/worker/social.mjs` (fills the
queue hourly), `src/collections/SocialQueue.ts` (the `social-queue`
collection). **Fixed decision: posts go out through the platforms' own web
UIs via Claude in Chrome — there are NO Meta/X APIs anywhere in this
codebase, and none may be added.** This is supervised, human-paced
publishing, not a headless cron job.

## The lifecycle of a queue entry

```
worker (hourly)          editor (/admin)          Claude in Chrome
  status: queued   →   status: approved    →   status: posted (+ postedAt)
                          └→ skipped                └→ skipped (if unpostable)
```

- `scripts/worker/social.mjs` runs hourly (`newsromania-social.timer`) and
  creates entries with `status: queued`: one per story per platform
  (facebook / twitter / instagram), Romanian caption from
  `writeCaptions()` (max 15 stories captioned per run), a link to OUR site
  (`/stiri/<slug>` — also for aggregated stories: social traffic lands on
  newsromania.info, never directly at the publisher), an absolute image URL
  (featured image for originals, category placeholder otherwise), and a
  `scheduledFor` slot from site-config `socialPlatforms.postingSchedule`
  (default 09:00 / 13:00 / 18:00 / 21:00; max 1 story per slot per platform).
- **Nothing is ever posted without a human decision:** only entries an
  editor flipped to `approved` in `/admin` are executed.
- Manual run / preview:
  `npx payload run scripts/worker/social.mjs -- --dry-run` (no LLM, no
  writes) · `-- --limit N` caps the stories per run (never above 15).
  Env equivalents: `SOCIAL_DRY_RUN=1`, `SOCIAL_LIMIT=N`.

## Step 1 — Editorial review (owner/editor, in /admin)

1. Open **`/admin/collections/social-queue`** — the list is sorted by
   „Programat pentru” (scheduledFor) by default, so the next thing due is on
   top.
2. Review each `queued` entry: caption tone/diacritics, correct link, image.
   Edit the caption in place if needed (keep X/Twitter ≤ 240 chars including
   the link; Instagram: no link, ≤ 5 hashtags).
3. Set „Stare” to **Aprobat** (`approved`) — or **Omis** (`skipped`) for
   stories that should not go out. Only `approved` entries get posted.

## Step 2 — Execution with Claude in Chrome

### Preconditions

- Chrome with the Claude extension, signed in to: the NewsRomania
  **Facebook page**, the **X/Twitter** account, the **Instagram** account
  (page/profile URLs live in site-config → „Rețele sociale” → „Pagini
  oficiale”). Credentials are never stored in this repo or given to scripts.
- A logged-in `/admin` session (editor or admin role).

### The exact operating procedure (give this to Claude in Chrome)

1. **Open the due queue.** Navigate to
   `https://newsromania.info/admin/collections/social-queue`, filter
   „Stare” = **Aprobat** and „Programat pentru” ≤ now, sorted ascending by
   „Programat pentru”. Equivalent direct URL:

   ```
   /admin/collections/social-queue?where[and][0][status][equals]=approved&where[and][1][scheduledFor][less_than_equal]=<NOW-ISO>&sort=scheduledFor
   ```

   Only entries that are BOTH approved AND due (scheduledFor in the past)
   are executed. Leave future-scheduled approvals for the next session.

2. **For each due entry, one at a time** (open the entry to read its full
   caption, imageUrl and link):

   **Facebook** — open the NewsRomania page (from site-config), click
   „Create post” / „Creează o postare”, paste the caption exactly as stored
   (it ends with the article link on its own line — wait for the link
   preview card to render, keep the URL in the text), then „Post”.

   **X / Twitter** — open `https://x.com/compose/post`, paste the caption
   (already ≤ 240 chars including the link — never append anything), then
   „Post”.

   **Instagram** — download the entry's `imageUrl` to a local file first
   (open the URL in a tab → save image). Open `https://www.instagram.com`,
   „Create” → „Post”, upload the image, paste the caption (it has NO link by
   design — Instagram captions aren't clickable; the profile bio links to
   newsromania.info), then „Share”.

3. **Immediately after each successful post**, back in the admin tab: open
   that entry, set „Stare” = **Postat** (`posted`), set „Postat la”
   (postedAt) to the current date/time, **Save**. Never batch this step —
   the status flip is the only thing preventing double-posting.

4. **If a post fails** (platform error, media rejected): leave the entry
   `approved` to retry next session, or set „Stare” = **Omis** (`skipped`)
   if it should never go out. Do not retry more than once per session.

### Pacing rules (account safety — brief §9)

Heavy unattended automation flags accounts. Stay human-paced:

- **Max 4 posts per hour in total, max 2 per platform per hour.**
- **Wait 3–5 minutes between consecutive posts**, longer between posts on
  the same platform; vary the order (don't always go FB → X → IG).
- One queue session per schedule slot is the intended rhythm (4 slots/day
  ⇒ roughly 4 short sessions); never fire the whole backlog in one burst.
- **Stop immediately** on any captcha, identity re-verification, „unusual
  activity” warning or rate-limit message — finish nothing else on that
  platform, tell the owner, and leave remaining entries `approved`.
- Posting stays **supervised**: a human watches the session; Claude in
  Chrome never runs this unattended.

### Platform notes

| Platform    | Caption shape (as generated)                                                  | Gotchas                                                            |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Facebook    | 2–3 informative sentences, link on its own line                               | Longer copy is fine; let the link-preview card load before posting |
| X / Twitter | One punchy sentence + link, **≤ 240 chars total**                             | Never add hashtags/text on top — the limit is already used         |
| Instagram   | Visual-first: short first line, 2–4 lines, ≤ 5 Romanian hashtags, **no link** | Needs the image file uploaded; link lives in the profile bio       |

All captions are Romanian with comma-below diacritics (ș, ț) — do not
"fix" them into cedilla forms when pasting.

## Configuration knobs (no code changes)

- **Posting hours**: `/admin` → „Configurare site” → „Rețele sociale” →
  „Ore de postare” (HH:mm rows). The worker only schedules into future
  slots; changes apply from the next hourly run.
- **Page URLs**: same group → „Pagini oficiale” (facebook / instagram /
  twitter).
- **Caption volume**: hard-capped at 15 stories/run in the worker
  (`CAPTION_BUDGET_PER_RUN`) to bound LLM cost; per-run override for manual
  runs via `-- --limit N` (never above 15).

## Troubleshooting

- **Queue is empty** — check `systemctl --user list-timers 'newsromania-*'`
  and `journalctl --user -u newsromania-social.service -n 50`; the worker
  only queues stories from the last 24 h that have no entries yet.
- **Duplicate-looking entries** — impossible for the same
  contentType+refId+platform (idempotency key); an original and an
  aggregated item about the same event are separate stories by design (the
  ingest worker already clusters near-duplicate aggregated items).
- **Slots drift into the far future** — the backlog is longer than the
  schedule; approve/skip aggressively or add more „Ore de postare” rows.
- **Wrong/missing image** — originals need a featured image in Payload;
  everything else intentionally uses the category placeholder (publisher
  RSS thumbnails are licensed for on-site display at most — brief §0.2 —
  so they are never re-uploaded to social platforms).
