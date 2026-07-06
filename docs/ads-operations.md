# Ads Operations — AdSense units, consent behaviour, Amazon tags, revenue reporting

Owner-facing runbook for the ad stack (PROJECT_BRIEF §6.4 / §17). Code owners:
`src/lib/ads/engine.ts` (per-request decisions), `src/components/ads/AdSlot.tsx` +
`AdSenseUnit.tsx` (rendering), site-config global (`src/globals/SiteConfig.ts`) for
every knob. Nothing below requires a code change or a deploy — it is all
`/admin` configuration.

## Current state (until AdSense review passes)

- The **site review for newsromania.info is PENDING**. This is expected.
- The AdSense **site tag** is already live in the app shell
  (`src/app/(frontend)/layout.tsx`) with publisher id `ca-pub-8098077913729716`
  (public, not a secret; overridable via `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`).
- Every ad position renders a **reserved, visibly labelled „Publicitate" box
  that stays empty** — no unit id, no fill request, no fake/placeholder ads.
  Do not try to "fix" empty boxes before approval; that is the compliant state.
- Google Consent Mode v2 defaults are **denied** before any choice, so the
  site tag sets no cookies pre-consent.

## After AdSense approval — exact steps

### 1. Create the ad units in the AdSense dashboard

AdSense → **Ads → By ad unit**. Create one unit per placement (names are
suggestions; the type/format is what matters):

| Placement on site         | Dashboard unit type             | Suggested name     | Notes                                                                   |
| ------------------------- | ------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| `feed` (between articles) | **In-feed ad**                  | `nr-feed-1`        | Copy the `data-ad-layout-key` from the generated snippet (see step 2).  |
| `article` (inside body)   | **In-article ad**               | `nr-article-1`     | Two positions exist per article (after 3rd paragraph + at article end). |
| `rail` (right column)     | **Display ad → Fixed, 300×250** | `nr-rail-300x250`  | The layout reserves exactly 300×250.                                    |
| `leaderboard` (top strip) | **Display ad → Fixed, 728×90**  | `nr-leader-728x90` | Desktop-only strip; mobile never shows it.                              |

From each generated snippet you only need the **`data-ad-slot` number**
(10 digits) — the code renders everything else itself.

### 2. Paste the ids into `/admin` → „Configurare site"

Group **„Rețele de publicitate" → „Unități AdSense"**. Add one row per unit:

- **Poziție (slot):** `feed`, `article`, `rail` or `leaderboard` — this maps
  the unit 1:1 to the placement above.
- **ID unitate (unitId):** the `data-ad-slot` number from the snippet.
- **format** (optional — leave empty to use the placement default):

  | Value                      | Renders as                                                                                                       |
  | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | _(empty)_                  | Placement default: feed→`fluid`, article→`in-article`, rail→`rectangle`, leaderboard→`horizontal`                |
  | `fluid` or `in-feed`       | Responsive in-feed (`data-ad-format="fluid"`)                                                                    |
  | `fluid:<layout-key>`       | In-feed **with** the dashboard's `data-ad-layout-key`, e.g. `fluid:-6t+ed+2i-1n-4w` — recommended for feed units |
  | `in-article`               | Fluid in-article (`data-ad-layout="in-article"`)                                                                 |
  | `rectangle` or `300x250`   | Fixed 300×250                                                                                                    |
  | `horizontal` or `728x90`   | Fixed 728×90                                                                                                     |
  | any `WxH` (e.g. `300x600`) | Fixed custom size (make sure the layout box fits it)                                                             |
  | `auto`                     | Fully responsive auto format                                                                                     |

- **Rotation:** you may add **several rows with the same Poziție**. The engine
  rotates them **deterministically by position on the page**: the 1st in-feed
  slot shows unit 1, the 2nd shows unit 2, the 3rd unit 3, then it wraps —
  same page, same visitor, same result (no flicker, no randomness). Same for
  the two in-article positions. This is how you A/B-compare units per
  placement once reporting data flows.

### 3. Wait ≤ 5 minutes, then verify

- The engine caches the config in Redis (`newsromania:ads:config`, TTL 5 min);
  changes go live on their own within 5 minutes. To force it immediately
  (Redis requires auth; `$REDIS_PASSWORD` is already set inside the container):

  ```bash
  docker exec newsromania-redis sh -c \
    'redis-cli -a "$REDIS_PASSWORD" DEL newsromania:ads:config'
  ```

  Only ever `DEL` that one key — never `FLUSHALL`/`FLUSHDB`.
- Open the site: each configured slot's `<ins class="adsbygoogle">` now has a
  `data-ad-slot` attribute and requests a fill (one `adsbygoogle.push()` per
  slot, idempotent). New units can take **hours up to ~1 day** on Google's
  side before they serve; unfilled slots simply keep the labelled empty box.

## NPA / consent behaviour (recap — do not change)

Decided **server-side per request** by the ad engine; strictly enforced
(PROJECT_BRIEF §6.3/§8):

- **No choice yet or „Refuz":** Consent Mode v2 stays fully `denied`,
  `requestNonPersonalizedAds=1` is set globally before the AdSense tag runs
  (`src/components/consent/ConsentModeScript.tsx`), every decision carries
  `npa=true` (audit attribute `data-npa="1"` on each `<ins>`), no cookies are
  read or written, no CDP profile is consulted, Amazon keywords are
  **contextual only** (page category, never the visitor).
- **„Accept":** consent update grants `ad_storage`/`ad_user_data`/
  `ad_personalization`, `npa=false`, and — only if „Targetare
  comportamentală → Activă" is on in site-config — the CDP interest profile
  blends into Amazon keywords.
- Refusing never degrades the reading experience; visitors get the same pages
  with generic ads. Withdrawal at `/setari-cookies`.

## Amazon Creators API — tag/marketplace confirmation (owner action)

The `partnerTag` sent with each API request **must be registered for that
request's marketplace**, or links pay nothing (PROJECT_BRIEF §6.4). Current
seed: `www.amazon.de` → `newsr01-21` — **pending your confirmation**.

1. Log into **Associates Central** and confirm which marketplace the tracking
   id `newsr01-21` actually belongs to (likely amazon.de; there is no
   amazon.ro — Romanian visitors buy on amazon.de).
2. Create per-marketplace tracking ids for the markets we serve:
   **amazon.co.uk** (UK visitors), **amazon.fr** (France), keep **amazon.de**
   (Romania + rest of EU default). US (amazon.com) only if that program
   membership exists.
3. Enter them in `/admin` → „Configurare site" → „Rețele de publicitate" →
   **„Taguri partener Amazon"**: one row per marketplace, e.g.
   `www.amazon.co.uk` / `newsruk-21`. Marketplace strings must be the full
   host (`www.amazon.de`, `www.amazon.co.uk`, `www.amazon.fr`).
4. Behaviour to expect: a placement only shows Amazon product ads when a tag
   exists for the visitor's marketplace — otherwise AdSense keeps the slot.
   All affiliate links render with `rel="sponsored noopener nofollow"`,
   `target="_blank"`, inside „Publicitate"-labelled boxes.
5. API discipline (already enforced in code, keep it that way): product
   results are Redis-cached 24 h and throttle-aware — the Creators API is
   **never** called per page view.

## Where revenue reporting will appear

- **Admin ops dashboard (shipped, step 13):** the `/admin` landing page shows
  the operational panel (`OpsDashboard` → `/api/admin/ops-stats`) with the ad
  **configuration** state (units configured, Amazon tags) plus CDP counters
  that include `ad_impression`/`ad_click` events. It does NOT pull
  revenue/CTR figures — the groundwork for that is in place (every rendered
  slot is auditable in the DOM via `data-ad-slot`/`data-npa`, placements are
  deterministic, CDP events give per-category traffic denominators), but
  revenue itself lives in the networks' own dashboards below.
- **AdSense:** revenue lives in the AdSense dashboard (Reports → by ad unit —
  this is why units are named per placement above). No AdSense reporting API
  integration is planned short-term; check it alongside the dashboard.
- **Amazon:** real earnings data comes from the Creators API
  `listReports`/`getReport` operations (vendored SDK,
  `vendor/creatorsapi-nodejs-sdk`) — a scheduled fetch into the ops
  dashboard remains a future enhancement; until then use the Associates
  Central reports UI.
