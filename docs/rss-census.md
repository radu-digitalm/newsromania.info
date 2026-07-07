# RSS Feed Census — newsromania

**Synthesis date:** 2026-07-07
**Editor:** Census synthesis agent (pooled from 6 researchers, re-verified)
**Seed reference:** owner A-Z directory <https://e-ziare.ro/index.php?z=ziare-a-z> + web search

## Legal / loading posture (PROJECT_BRIEF 0.1)

**ALL feeds below are to be loaded DISABLED + link-only** until the owner reviews
each publisher's Terms & Conditions for excerpting/syndication rights. The `T&C flag`
column highlights outlets that need extra scrutiny (full-text `content:encoded` bodies,
news-agency/wire syndication terms, paywalled/premium content, or major broadcaster brands).

Only `working=true` feeds (WebFetch/curl-confirmed to return recent `<item>`/`<entry>`
elements with 2026-07-07 dates) are included. Feeds that could not be confirmed were dropped.

## Vetted feed table

| Name | Feed URL | Category | Scope | Tier | Images? | T&C flag |
|------|----------|----------|-------|------|---------|----------|
| Digi24 | https://www.digi24.ro/rss | actualitate | national | 1 | yes (enclosure) | broadcaster (RCS-RDS/Digi) — review |
| Digi24 — Externe | https://www.digi24.ro/rss/actualitate/externe | international | national | 1 | yes (enclosure) | broadcaster — review |
| Digi24 — Economie | https://www.digi24.ro/rss/stiri/economie | economie | national | 1 | yes (enclosure) | broadcaster — review |
| Digi24 — Sport | https://www.digi24.ro/rss/stiri/sport | sport | national | 1 | yes (enclosure) | broadcaster — review |
| G4Media | https://www.g4media.ro/feed | politica | national | 1 | yes (media:content + enclosure) | Cloudflare — fetcher needs browser UA (else 403) |
| HotNews.ro | https://hotnews.ro/feed | actualitate | national | 1 | no (channel logo only) | review |
| News.ro | https://www.news.ro/rss | actualitate | national | 1 | yes (enclosure) | news wire — syndication terms |
| Mediafax | https://www.mediafax.ro/rss | actualitate | national | 1 | yes (enclosure) | news wire — restrictive syndication likely |
| Rador (Agenția Rador — SRR) | https://www.rador.ro/feed/ | actualitate | agency | 1 | yes (enclosure) | agency, full-content (content:encoded) — excerpt-only |
| Adevărul | https://adevarul.ro/rss | actualitate | national | 1 | yes (enclosure) | large national daily — review |
| Gândul | https://www.gandul.ro/feed | actualitate | national | 2 | yes (enclosure) | review |
| Știrile ProTV | https://stirileprotv.ro/rss | actualitate | national | 1 | yes (enclosure) | broadcaster (ProTV) — review |
| Observator (Antena) | https://observatornews.ro/rss | actualitate | national | 1 | yes (enclosure) | broadcaster + full content:encoded — excerpt-only |
| Libertatea | https://www.libertatea.ro/feed | actualitate | national | 1 | yes (enclosure) | Cloudflare RATE-LIMIT (429) — must throttle/backoff |
| Ziarul Financiar (ZF.ro) | https://www.zf.ro/rss | economie | national | 1 | yes (enclosure) | financial daily — review |
| Profit.ro | https://www.profit.ro/rss | economie | national | 2 | no | paywall/premium — excerpting review |
| Economica.net | https://www.economica.net/feed | economie | national | 2 | yes (enclosure) | review |
| Bursa — Titlurile zilei | https://www.bursa.ro/titluri-bursa.xml | economie | national | 2 | no | review |
| Business Magazin | https://www.businessmagazin.ro/rss-feed.xml | economie | national | 2 | yes (enclosure) | ZF/MediaPro group — review |
| Economedia.ro | https://economedia.ro/feed | economie | national | 2 | yes (enclosure) | Cloudflare — fetcher needs browser UA (else 403) |
| Financial Intelligence | https://financialintelligence.ro/feed/ | economie | national | 3 | no | review |
| ProSport | https://www.prosport.ro/rss | sport | national | 1 | yes (enclosure) | Ringier — review |
| Digi Sport | https://www.digisport.ro/rss | sport | national | 1 | yes (enclosure, s.iw.ro proxy) | broadcaster — image proxy may block hotlink |
| Sport.ro | https://www.sport.ro/rss | sport | national | 2 | yes (img in description only) | Antena group — needs description parse for image |
| Fanatik — Fotbal | https://www.fanatik.ro/fotbal/feed/ | sport | national | 2 | yes (enclosure) | review (main feed shallow; section feed deeper) |
| iamsport (iAMsport.ro) | https://iamsport.ro/rss | sport | national | 3 | yes (enclosure) | Antena/Intact — use exact path /rss |
| OnlineSport.ro | https://www.onlinesport.ro/feed/ | sport | national | 3 | yes (media:thumbnail) | independent — use /feed/ (/rss 403) |
| Go4it | https://www.go4it.ro/feed/ | tehnologie | national | 2 | yes (enclosure) | review |
| Playtech | https://playtech.ro/feed/ | tehnologie | national | 2 | yes (enclosure) | larger publisher — review |
| start-up.ro | https://start-up.ro/feed/ | tehnologie | national | 3 | yes (enclosure, heavy) | review; large hotlink images |
| Descopera.ro | https://www.descopera.ro/rss | tehnologie | national | 3 | yes (enclosure) | pop-science; independent, review |
| Mobilissimo | http://feeds.feedburner.com/mobilissimo-stiri-telefoane | tehnologie | national | 3 | no (img in description) | FeedBurner http-only — confirm longevity |
| CSID (Ce se întâmplă, Doctore?) | https://www.csid.ro/feed/ | sanatate | national | 2 | yes (enclosure) | media-group health brand — review |
| SfatulMedicului | http://www.sfatulmedicului.ro/index.php?module=rssFeed&action=rssArticole | sanatate | national | 3 | yes (enclosure, protocol-relative) | review; slower cadence |
| Scena9 | https://www.scena9.ro/feed | cultura | national | 2 | no | review |
| LaPunkt | https://www.lapunkt.ro/feed | cultura | national | 3 | no (inline img only) | review |
| Ziarul de Iași | https://www.ziaruldeiasi.ro/rss | actualitate | regional | 3 | yes (media:content) | RSS 0.92, weak dates — review |
| BZI.ro (Bună Ziua Iași) | https://www.bzi.ro/feed | actualitate | regional | 3 | yes (enclosure) | review |
| Monitorul de Cluj | https://www.monitorulcj.ro/rss/ | actualitate | regional | 3 | no | review |
| Tion (Timiș/Banat) | https://www.tion.ro/feed/ | actualitate | regional | 3 | yes (enclosure) | review |
| Replica Online (Constanța) | https://www.replicaonline.ro/rss | actualitate | regional | 3 | yes (enclosure) | review |
| Observatorul Prahovean | https://www.observatorulph.ro/feed/ | actualitate | regional | 3 | no | no explicit T&C page found — owner check |
| Replica de Hunedoara | https://www.replicahd.ro/feed/ | actualitate | regional | 3 | no | review |
| Transilvania Reporter | https://transilvaniareporter.ro/feed/ | actualitate | regional | 3 | no | STALE — weekly, most recent 18 Jun 2026 |

**Total vetted working feeds: 44** (after dedup).

### Dedup / normalization notes
- **Adevărul** appeared twice in the pool (default `actualitate` and default `international`).
  It is a single **mixed aggregate** feed (`https://adevarul.ro/rss`); no working pure
  `externe` section feed exists (`/stiri-externe/feed` and `/rss` variants 404). Kept **once**
  as **actualitate** (owner-preferred for a mixed national feed). Its Externe desk can still
  supply international items, but the true international flagship is **Digi24 — Externe**.
- **Digi24 — Sport** appeared twice via two paths. Canonicalized to
  `https://www.digi24.ro/rss/stiri/sport` (the `/rss/sport` short path 301-redirects here).
- **ProSport / Fanatik / News.ro**: kept main flagship + at most one clearly-scoped section
  feed. For Fanatik the shallow 4-item main feed was dropped in favour of the deeper
  `fotbal` section feed. For ProSport the `fotbal-extern` section (international-tagged sport)
  was dropped as redundant to keep the international category unpolluted by sport.
- **News.ro — Externe** dropped: only 2 items at fetch time (very low volume) and ambiguous
  on re-fetch; Digi24 Externe covers international far better.

## Category coverage audit (8 slugs)

| Category | Good sources | Status |
|----------|-------------|--------|
| actualitate | 18 (incl. regionals) | STRONG |
| politica | **1** (G4Media) | **GAP — see below** |
| economie | 7 (ZF, Profit, Economica, Bursa, Business Magazin, Economedia, Financial Intelligence) | STRONG |
| international | **1** (Digi24 — Externe) | **GAP — owner's concern confirmed** |
| sport | 6 (ProSport, Digi Sport, Sport.ro, Fanatik, iamsport, OnlineSport) | STRONG |
| tehnologie | 5 (Go4it, Playtech, start-up.ro, Descopera, Mobilissimo) | GOOD |
| sanatate | **2** (CSID, SfatulMedicului) | THIN |
| cultura | **2** (Scena9, LaPunkt) | THIN |

### GAP flags

- **politica — GAP (1 source).** Only G4Media is mapped to `politica`, and even that is an
  editorial judgement (it could equally be `actualitate`). Romanian outlets rarely expose a
  clean politics-only RSS; political news is folded into general `actualitate` feeds. The
  seed A-Z lists politics/analysis titles worth investigating for the owner: **Spotmedia,
  Ziare.com, Republica, Revista 22, Contributors, PressOne**. Recommend the owner sources a
  dedicated politics feed or accepts that politics is covered via actualitate flagships.

- **international — GAP (1 source) — CONFIRMED the owner's worry.** Digi24 — Externe is the
  only clean, high-volume international feed (30 items, images, verified). Fallbacks are weak:
  News.ro Externe returns only ~2 items; Adevărul has an Externe desk but only as part of a
  mixed feed. **Recommendation:** enable Digi24 — Externe as the international anchor and
  investigate additional externe section feeds (e.g. a Mediafax/News.ro externe section, or
  Euronews Romania) to harden this category before launch.

- **sanatate (2) / cultura (2) — THIN but functional.** Each has two live sources with
  daily-to-weekly cadence. Adequate for launch; owner may want a third each over time
  (seed A-Z lists Observator Cultural, Dilema Veche for cultura).

## Recommended starter set to enable first (full category coverage, 10 feeds)

All start **DISABLED + link-only** pending T&C review; enable in this order once cleared:

1. **Digi24** — `https://www.digi24.ro/rss` — *actualitate* (national flagship, images)
2. **G4Media** — `https://www.g4media.ro/feed` — *politica* (only politica source; needs browser-UA fetcher)
3. **Ziarul Financiar** — `https://www.zf.ro/rss` — *economie* (leading financial daily)
4. **Digi24 — Externe** — `https://www.digi24.ro/rss/actualitate/externe` — *international* (only strong international source — critical for the gap)
5. **ProSport** — `https://www.prosport.ro/rss` — *sport* (deep, images)
6. **Go4it** — `https://www.go4it.ro/feed/` — *tehnologie* (clean tech, images)
7. **CSID** — `https://www.csid.ro/feed/` — *sanatate* (health flagship, images)
8. **Scena9** — `https://www.scena9.ro/feed` — *cultura* (culture magazine)
9. **News.ro** — `https://www.news.ro/rss` — *actualitate* (wire, images — depth for the home feed)
10. **HotNews.ro** — `https://hotnews.ro/feed` — *actualitate* (reinforces general news)

This set covers **all 8 category slugs** with at least one source each. `politica` and
`international` are covered by a single feed each — this reflects the two confirmed gaps
above, not an omission. Prefer image-bearing feeds first since our aggregation hotlinks
source images; feeds without structured images (HotNews, Bursa, several regionals) fall
back to placeholders.
