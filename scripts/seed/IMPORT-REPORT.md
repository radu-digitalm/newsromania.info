# Raport import WordPress — seed unic (Section 22)

Script: `scripts/seed/import-wordpress.mjs` · Rulare: `npx payload run scripts/seed/import-wordpress.mjs`
Sursă: `https://newsromania.info/wp-json/wp/v2/posts` (REST, paginat prin `X-WP-TotalPages`, `_embed`, 1 cerere/secundă, UA `newsromania-import/1.0`; fallback RSS `/feed` implementat, dar nefolosit — REST a răspuns 200).
Fereastră: ultimele 14 zile (calculată la rulare; la 2026-07-06 ≈ postări după 2026-06-22T20:11 UTC).

## Ce am găsit la explorare (2026-07-06)

- REST funcțional: 90 de postări în fereastră la explorare (84 la rularea propriu-zisă — fereastra de 14 zile e mobilă, iar postările din 22–23 iunie au ieșit din ea între timp).
- **Toate postările sunt agregări**: titluri prefixate `HOTNEWS.RO:` (≈½) sau `www.g4media |` (≈½), autor WP unic (`RaduCIOCOIU`), corp format dintr-un singur paragraf introductiv + link extern „Citeste articolul integral pe {sursă}”.
- **Zero articole proprii** în fereastra de 14 zile.
- Toate postările stau în categoria WP `fara-categorie` (id 1) — nicio taxonomie utilă.
- Unele postări G4Media au în corp o imagine hotlink-uită direct de pe `g4media.ro` (drepturi terți — NU a fost preluată); unele postări HotNews au `featured_media` urcat în WP-ul proprietarului (irelevant aici: elementele agregate nu primesc imagini, vezi mai jos).

## Regula de clasificare (decisă după explorare)

Un post este **AGREGAT** dacă corpul citează clar o sursă externă, în această ordine de încredere:

1. **Ancoră externă în coada corpului** (semnalul real pe acest site): ultimul `<a href>` către un host non-`newsromania.info`, preferat cel al cărui text conține „citește/citeste articolul integral” sau „sursa”. Acel URL devine `sourceUrl`; numele publicației se derivă din host (`hotnews.ro` → HotNews.ro, `www.g4media.ro` → G4Media.ro; fallback: hostul fără `www.`).
2. **Semnal slab, fără URL fiabil**: mențiune „Sursa:” / „sursa foto” în text sau titlu prefixat cu un nume de domeniu → `sourceUrl` = linkul WP al postării, `sourceName` = „NewsRomania (arhivă)”, consemnat ca anomalie.

Altfel, postul este **ORIGINAL** (scris de proprietar) → colecția `articles` (corp integral ca paragrafe Lexical, byline Redacția, imaginea reprezentativă descărcată din WP — upload propriu, permis; plafon 30 imagini).

Pe datele reale: **84/84 agregate prin regula 1** (ancoră externă în coadă), 0 prin regula 2, 0 originale.

## Porți legale respectate (PROJECT_BRIEF 0.1/0.2)

- Textul terț (paragraful introductiv, fără boilerplate-ul „Citeste articolul integral…”) este folosit **doar în memorie** ca intrare pentru `summarizeExcerpt` din `src/lib/llm.ts` și **nu este stocat nicăieri**.
- Rezumatele sunt transformative, ≤55 de cuvinte românești, atribuite; post-validate (fără rulaje verbatim >8 cuvinte). Când validarea eșuează de două ori, elementul devine `linkOnly: true` cu rezumat gol.
- `imageUrl` rămâne **gol** la toate elementele agregate (drepturi de imagine terțe neclare — inclusiv pentru `featured_media` din WP, care la aceste posturi provine tot din materialele publicațiilor citate).
- Titlurile sunt curățate de prefixul de publicație (`HOTNEWS.RO:`, `www.g4media |`) doar când prefixul corespunde hostului sursei detectate — atribuirea se face prin `sourceName` + link.

## Tabel de mapare categorii (WP → cele 8 sluguri canonice)

| Slug WP                            | Slug canonic    | Observații                                         |
| ---------------------------------- | --------------- | -------------------------------------------------- |
| `fara-categorie`                   | `actualitate`   | singura categorie folosită pe site (84/84 postări) |
| `actualitate`, `stiri`             | `actualitate`   | identitate/robustețe                               |
| `politica`                         | `politica`      | robustețe (nefolosit)                              |
| `economie`                         | `economie`      | robustețe (nefolosit)                              |
| `externe`, `international`         | `international` | robustețe (nefolosit)                              |
| `sport`                            | `sport`         | robustețe (nefolosit)                              |
| `sanatate`                         | `sanatate`      | robustețe (nefolosit)                              |
| `tehnologie`, `stiinta-tehnologie` | `tehnologie`    | robustețe (nefolosit)                              |
| `cultura`                          | `cultura`       | robustețe (nefolosit)                              |
| _orice altceva_                    | `actualitate`   | implicit                                           |

Toate cele 84 de elemente importate au primit categoria `actualitate`.

## Contoare

Test de dezvoltare prealabil (`IMPORT_LIMIT=2`): 2 elemente create, 2 rezumate — incluse în totaluri.

| Metrică                   | Rularea 1 (completă)   | Rularea 2 (idempotență) |
| ------------------------- | ---------------------- | ----------------------- |
| Postări preluate (REST)   | 84                     | 84                      |
| Clasificate ORIGINAL      | 0                      | 0                       |
| Clasificate AGREGAT       | 84                     | 84                      |
| `articles` create         | 0                      | **0**                   |
| `aggregated-items` create | 82 (+2 din testul dev) | **0**                   |
| Sărite ca existente       | 2                      | **84**                  |
| Rezumate AI reușite       | 53 (+2 dev = 55 total) | 0                       |
| `linkOnly: true`          | 29                     | 0                       |
| Imagini descărcate        | 0 (niciun original)    | 0                       |

- **Total importat: 84 elemente agregate** (42 HotNews.ro, 42 G4Media.ro), interval 2026-06-23 → 2026-07-06, toate cu `publishedAt` păstrat din `date_gmt`.
- **55 cu rezumat AI** (`linkOnly: false`), **29 doar link** (`linkOnly: true`).
- Buget LLM: max 60 rezumate/rulare (`IMPORT_MAX_SUMMARIES`). S-au consumat 60 de sloturi pe cele mai noi postări: 53 rezumate valide + 7 respinse de validatorul fair-use (rulaj verbatim >8 cuvinte după 2 încercări) → `linkOnly`. Cele 22 mai vechi de peste buget → `linkOnly` (recuperabile ulterior de workerul de ingest sau dintr-o rulare cu buget mărit — dedup pe `guid` le sare oricum).
- Consum real (colecția `llm-usage`, purpose `seed`, 2026-07-06): 73 apeluri (60 sloturi + reîncercări + 2 test dev), ~28,9k tokeni intrare / ~5,6k ieșire, cost estimat ≈ $0.018.

## Anomalii

1. **Niciun articol original în fereastră** — ramura ORIGINAL (Lexical + imagine reprezentativă + byline Redacția) este implementată și testabilă, dar nu a avut date reale; 0 imagini descărcate din plafonul de 30.
2. **7 rezumate respinse de validator** (sursa fiind un singur paragraf scurt, modelul tinde să-l reproducă aproape verbatim; după 2 încercări → `linkOnly`, conform porții legale). Comportament corect, nu eroare.
3. Fereastra fiind mobilă, 6 postări văzute la explorare (22–23 iunie) nu au mai intrat în rulare — la o rulare mai timpurie ar fi fost incluse.
4. Postările G4Media hotlink-uiau imagini de pe `g4media.ro` în corp — ignorate deliberat (drepturi terți).
5. Containerul `newsromania-redis` apare `unhealthy` (healthcheck-ul folosește o parolă veche), dar conexiunea aplicației din `.env` funcționează (PING → PONG); hook-ul `purgeFeedCache` a rulat normal. De remediat în pasul de deploy (recreare container cu healthcheck sincronizat).

## Re-rulare / butoane

- `npx payload run scripts/seed/import-wordpress.mjs` — idempotent (dedup: `articles.slug`, `aggregated-items.guid`).
- `IMPORT_MAX_SUMMARIES` (implicit 60), `IMPORT_MAX_IMAGES` (implicit 30), `IMPORT_LIMIT` (doar cele mai noi N postări — pentru test).
