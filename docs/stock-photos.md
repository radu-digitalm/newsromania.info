# Stock photos for AI-written articles

Policy + code owner for royalty-free lead images. Code: `src/lib/stock-photos.ts`
(`searchStockPhoto({ query, orientation? })`). Keys live in `.env`
(`PEXELS_API_KEY`, `PIXABAY_API_KEY`) and are **owner-provided** — both are free.

This is the narrow slice of the broader image policy (see
`docs/architecture.md` §4, "Image policy") that concerns **our own AI-written
articles**. Nothing here touches aggregated items.

## Where a photo comes from (the whole policy in one place)

Every post should show a photo. Which one depends on the content type:

- **Aggregated items** — the image is ALWAYS a **hotlink** to the source's own
  image (RSS `enclosure` / `media:content`, or the publisher article's
  `og:image`). We NEVER download or store an aggregated image into our media
  library.
- **Original articles written by a human** — our own uploaded photo in Payload
  media. "Only our stories have our photos."
- **Original articles written by AI** — pull a **royalty-free stock photo
  first**, via `searchStockPhoto()`: **Pexels first, Pixabay as fallback**. The
  returned `url` is a **hotlink** to the provider CDN — we do not re-host it.

If a photo is genuinely impossible to obtain (no keys configured, or neither
provider returns a match), the post shows **NO image at all** — a text-only
card with no lead image. We NEVER fall back to a branded category placeholder;
placeholders as an image fallback have been removed everywhere.

## How `searchStockPhoto()` behaves

```
searchStockPhoto({ query, orientation? })
  -> { url, attribution, source: 'pexels' | 'pixabay', width, height } | null
```

- **Provider order is fixed**: Pexels (`PEXELS_API_KEY`) is tried first, then
  Pixabay (`PIXABAY_API_KEY`). The first provider that returns a usable result
  wins. A provider with no key is skipped silently.
- **Best landscape/large result**: `orientation` defaults to `landscape` (lead
  images are wide) and the largest available render is chosen (Pexels
  `large2x`, Pixabay `largeImageURL`).
- **Redis-cached 24h** under `newsromania:stock:<source>:<sha1(query|orientation)>`,
  keyed independently per provider. Cache/Redis failures degrade to a live
  fetch — caching never breaks image resolution.
- **Returns `null` gracefully, never throws.** No keys, an empty/whitespace
  query, a non-2xx response, an empty result set, or a network error all resolve
  to `null` → the article renders imageless.
- **Pexels auth quirk**: the key travels as the **raw** value of the
  `Authorization` header (NOT `Bearer <key>`). Pixabay takes its key as the
  `key` query param.

## Attribution (REQUIRED) and rendering

Both Pexels and Pixabay require **visible attribution**. `searchStockPhoto()`
returns an `attribution` string already formatted for display, e.g.:

- `Foto: Ana Popescu / Pexels`
- `Foto: Pixabay` (when the provider gives no author name)

Render it as the **article image caption**. It is not optional — a stock photo
shown without its credit line violates the provider's terms.

## Trademark / logo caution (legal)

API-sourced photos MUST NOT be used in a way that implies endorsement or shows a
**trademark or logo in a commercial context**. Practically, for AI articles:

- Build the search `query` from **neutral, concept-level terms** — e.g.
  "parliament building", "wind turbines", "stock market chart" — never a brand,
  product, or logo name.
- Do not use a stock photo to illustrate a specific company/person in a way that
  could imply they posed for or endorsed our content.

When in doubt, prefer imageless over a risky match.

## Keys (owner-provided)

Both keys are **free** and **blank until the owner adds them** to `.env`:

```
PEXELS_API_KEY=      # from https://www.pexels.com/api/ — raw key in Authorization header
PIXABAY_API_KEY=     # from https://pixabay.com/api/docs/ — key= query param
```

With no keys set the module is a no-op that returns `null`, so AI articles ship
imageless until the owner enables it — nothing breaks in the meantime.
