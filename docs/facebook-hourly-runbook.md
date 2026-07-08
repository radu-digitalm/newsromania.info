# Facebook Hourly „Impact of the Hour” Runbook — Claude in Chrome posts the queue

Operating procedure for the hourly Facebook job (PROJECT_BRIEF §9). Every
hour the worker picks the single most impactful story of the last hour and
**prepares** one queue entry per Facebook destination — the NewsRomania
**page** plus the (up to 5) member **groups**. The actual posting is done by
Claude in Chrome, supervised, when the owner's Facebook-logged-in Chrome is
connected. **The server never posts headlessly — there is no Meta API in this
codebase and none may be added.**

Code owners: `scripts/worker/social.mjs` (`--impact` mode),
`scripts/worker/lib/impact.mjs` (the pure impact scorer),
`scripts/worker/lib/social-plan.mjs` (Facebook fan-out helpers),
`deploy/systemd/newsromania-social.{service,timer}` (hourly schedule).
For the 3×/day multi-platform caption queue see
`docs/social-posting-runbook.md`; this document is only the hourly Facebook
page+groups flow.

## What the hourly worker does (automatic — no browser needed)

`newsromania-social.timer` fires **hourly** (`OnCalendar=hourly`,
`Persistent=true`, randomized ≤5 min jitter). Each run executes two passes in
one oneshot:

1. **`--impact`** — the impact-of-the-hour Facebook fan-out (this document).
2. **default queue** — the 3×/day facebook/twitter/instagram caption queue
   (the other runbook). The second pass runs even if the first fails.

The impact pass:

1. Loads originals + non-archived aggregated items from the last **48 h** (the
   clustering window) and counts **cross-source cluster sizes** by
   `clusterKey` — how many independent outlets ran the same story.
2. Scores every item **published in the last hour** by, in descending weight:
   **cluster size** (each extra outlet dominates) → **source tier** (national
   wire/broadcast/reference = tier 1) → **has-image** → **recency**. Picks the
   single top story. If the hour is thin, it falls back to the **newest item
   with an image**, else the newest item overall.
3. Generates the Facebook caption via `writeCaptions()` (Romanian,
   comma-below diacritics, ends with the link to **our** site,
   `/stiri/<slug>` — social traffic lands on newsromania.info).
4. Enqueues **one `social-queue` row per Facebook target**: the page (`page`)
   and each group (`group1`…`group5`). Each row is `platform: facebook`,
   `status: queued`, `scheduledFor = now` (due this hour), image = the story's
   image or `/og-default.png`, link = `/stiri/<slug>`.
   - `refId` = `impact:<contentType>:<storyId>:<YYYY-MM-DDTHH>:<target>` — so a
     row is **idempotent per story, per target, per hour** and never collides
     with the daily caption queue (which uses the bare story id).

Manual run / preview:

```
npx payload run scripts/worker/social.mjs -- --impact --dry-run   # no LLM, no writes
SOCIAL_MODE=impact npx payload run scripts/worker/social.mjs      # env equivalent
```

## What the owner must provide (one-time)

The live browser step and the group fan-out need owner-specific data the build
agent does not have:

1. **`SOCIAL_FB_GROUPS`** in `.env` — the (up to 5) Facebook **group** URLs the
   account is a member of, newline/comma/space-separated. Only
   `https://facebook.com/groups/…` URLs are accepted; others are dropped.
   Example (`.env`, chmod 600, never committed):

   ```
   SOCIAL_FB_GROUPS="https://facebook.com/groups/aaa
   https://facebook.com/groups/bbb
   https://facebook.com/groups/ccc
   https://facebook.com/groups/ddd
   https://facebook.com/groups/eee"
   ```

   **Until this is filled, only the `page` row is queued** and the worker logs
   „grupurile rămân în așteptare”. Add the URLs and the next hourly run fans
   out to the groups automatically — no code change, no restart.

2. **The NewsRomania Facebook page URL** in `/admin` → „Configurare site” →
   „Rețele sociale” → „Pagini oficiale” → `facebook`. If missing, the `page`
   row is still queued but has no destination URL to open.

3. **A Facebook-logged-in Chrome** with the Claude extension connected, signed
   in to the account that owns the page and belongs to all 5 groups. Confirm
   the account is logged in before starting a session. Credentials are never
   stored in this repo or given to scripts.

## Execution with Claude in Chrome (runs only when the browser is connected)

**Preconditions:** the three items above, plus a logged-in `/admin` session
(editor or admin role). The server cannot do this step — it is supervised,
human-paced browser posting.

### The exact operating procedure (give this to Claude in Chrome)

1. **Open the due impact rows.** Navigate to
   `https://newsromania.info/admin/collections/social-queue`, filter „Platformă”
   = **Facebook**, „Stare” = **Aprobat**, „Programat pentru” ≤ now, sorted
   ascending by „Programat pentru”. Only rows an editor flipped to **Aprobat**
   are posted — review the caption/diacritics/image/link first and set „Stare”
   = **Aprobat** (or **Omis** to drop). The hourly `impact:…` rows are the ones
   whose „ID referință” starts with `impact:`.

2. **Map each row to its destination.** The `refId` suffix names the target:
   - `…:page` → the NewsRomania **Facebook page** (URL from site-config →
     „Pagini oficiale” → `facebook`).
   - `…:group1` … `…:group5` → the **Nth** URL in `SOCIAL_FB_GROUPS`, in order.

   Post the **`page` row first**, then the groups.

3. **For each due row, one at a time** (open the row to read its full caption,
   `imageUrl` and `link`):

   - Open the destination (page composer, or the group's „Write something…”).
   - Click „Create post” / „Creează o postare” / „Scrie ceva…”.
   - Paste the caption **exactly as stored** (comma-below diacritics ș/ț — do
     not „fix” them to cedilla forms). It ends with the article link on its own
     line — **wait for the link-preview card to render**, keep the URL in the
     text.
   - „Post” / „Postează”.

4. **Immediately after each successful post**, back in the admin tab: open that
   row, set „Stare” = **Postat** (`posted`), set „Postat la” (postedAt) to now,
   **Save**. Never batch this — the status flip is the only thing preventing
   double-posting.

5. **If a post fails** (composer error, media rejected, not a member of the
   group): leave the row **Aprobat** to retry next session, or set **Omis**
   (`skipped`) if it should never go out. Do not retry more than once per
   session. **Only post to groups the account actually belongs to** — skip any
   group where you are not a member.

### Pacing & safety (account protection — brief §9)

Heavy unattended automation flags accounts. Stay human-paced:

- **A few seconds between rows** (aim 30–60 s; at minimum a few), longer if
  Facebook shows any friction.
- **Stop immediately** on any captcha, identity re-verification, „unusual
  activity” / rate-limit warning, or a „you can't post to this group” message —
  finish nothing else this session, tell the owner, leave the rest **Aprobat**.
- Posting stays **supervised**: a human watches; Claude in Chrome never runs
  this unattended.
- Post to the **page + your member groups only** — never join groups or post
  where the account is not already a member.

## Troubleshooting

- **Only a `page` row appears (no groups)** — `SOCIAL_FB_GROUPS` is empty or
  malformed. Check `.env` (URLs must be `facebook.com/groups/…`) and
  `journalctl --user -u newsromania-social.service -n 50` for „grupurile rămân
  în așteptare”.
- **No impact row this hour** — the last hour had no items; the worker logs
  „niciun candidat”. Nothing to do; the next hour tries again.
- **Duplicate rows for the same story/hour** — impossible: the
  `impact:<type>:<id>:<hour>:<target>` refId is idempotent per hour. A re-run
  in the same hour logs „deja existente”.
- **Wrong story chosen** — the scorer favors cross-source coverage; a story on
  one outlet won't beat one carried by several. Tune tiers in
  `scripts/worker/lib/impact.mjs` (`SOURCE_TIERS`) if an outlet is mis-ranked.
- **Timer status** — `systemctl --user list-timers 'newsromania-*'` and
  `journalctl --user -u newsromania-social.service`.
