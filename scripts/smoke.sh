#!/usr/bin/env bash
#
# smoke.sh — black-box smoke test against a RUNNING app (architecture.md §10).
#
#   bash scripts/smoke.sh                 # target http://127.0.0.1:3100
#   SMOKE_BASE_URL=http://127.0.0.1:3100 bash scripts/smoke.sh
#
# It does NOT start or stop anything — the stack must already be up
# (docker compose / next start on 127.0.0.1:3100). Every assert prints a
# PASS/FAIL line; the exit code is 0 only when everything passed.
#
# What it checks (the §10 contract):
#   /                       200, lang="ro", <main> landmark, NO Set-Cookie for
#                           anonymous visitors (GDPR: nothing before consent)
#   consent refuse (form)   303 back, nr_consent=refused, nr_vid cleared
#   consent accept (JSON)   200, nr_vid issued, then /api/cdp/events -> 204
#   /stiri/<original>       200 + NewsArticle JSON-LD (slug from sitemap.xml)
#   /stiri/<aggregated>     canonical -> the ORIGINAL PUBLISHER, never us
#   /categorie/actualitate  200
#   /cautare?q=test         200
#   robots/sitemap/manifest 200
#   /api/health             200 + "ok":true
#   /admin                  200 (after redirects)
#   /api/users (anonim)     401/403
#   geo ad spacing          GB gets MORE in-feed ads than RO (everyNth 3 vs 5)
#   404                     branded Romanian page
#
# NOTE (cleanup): the two consent POSTs create rows in the consent-records
# collection — acceptable dev/staging data, nothing to clean up automatically.

set -u

BASE="${SMOKE_BASE_URL:-http://127.0.0.1:3100}"
CURL=(curl -sS --max-time 30)
PASS=0
FAIL=0

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() {
  PASS=$((PASS + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  FAIL=$((FAIL + 1))
  printf 'FAIL  %s\n' "$1"
}

check() { # check <description> <command...>
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$desc"; else fail "$desc"; fi
}

status_of() { # status_of <url> [curl args...]
  local url="$1"
  shift
  "${CURL[@]}" -o /dev/null -w '%{http_code}' "$@" "$url" 2>/dev/null || echo 000
}

# Strip \r so grep/sed work on HTTP headers regardless of curl version.
fetch_with_headers() { # fetch_with_headers <url> <headers-file> <body-file> [curl args...]
  local url="$1" headers="$2" body="$3"
  shift 3
  "${CURL[@]}" -D - -o "$body" "$@" "$url" 2>/dev/null | tr -d '\r' >"$headers"
}

cookie_value() { # cookie_value <headers-file> <name>  -> value (may be empty)
  sed -n "s/^[Ss]et-[Cc]ookie: $2=\([^;]*\).*/\1/p" "$1" | head -n 1
}

echo "== Smoke test NewsRomania — ${BASE} =="

# Abort early with a clear message when nothing listens on the port.
if ! "${CURL[@]}" -o /dev/null "$BASE/api/health" 2>/dev/null; then
  fail "aplicația nu răspunde pe ${BASE} (pornește stack-ul înainte de smoke)"
  echo "== ${PASS} PASS / ${FAIL} FAIL =="
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Homepage: 200, Romanian, landmark, zero cookies for anonymous visitors
# ---------------------------------------------------------------------------
fetch_with_headers "$BASE/" "$TMP/home.h" "$TMP/home.html"
home_status="$(head -n 1 "$TMP/home.h" | awk '{print $2}')"
check "/ răspunde 200 (a fost: ${home_status})" test "$home_status" = 200
check '/ are lang="ro"' grep -q 'lang="ro"' "$TMP/home.html"
check '/ are landmark <main>' grep -q '<main' "$TMP/home.html"
check '/ NU setează cookie-uri pentru vizitatori anonimi' \
  bash -c '! grep -qi "^set-cookie:" "$1"' _ "$TMP/home.h"

# ---------------------------------------------------------------------------
# 2. Consent REFUSE (form POST, ca din bannerul fără JS)
# ---------------------------------------------------------------------------
fetch_with_headers "$BASE/api/consent" "$TMP/refuse.h" "$TMP/refuse.b" \
  -X POST -H 'content-type: application/x-www-form-urlencoded' \
  -H "referer: ${BASE}/" --data 'choice=refused'
refuse_status="$(head -n 1 "$TMP/refuse.h" | awk '{print $2}')"
check "consent refuz: form POST răspunde 303 (a fost: ${refuse_status})" \
  test "$refuse_status" = 303
refuse_consent="$(cookie_value "$TMP/refuse.h" nr_consent)"
check 'consent refuz: nr_consent stochează alegerea „refused”' \
  bash -c 'printf %s "$1" | grep -q refused' _ "$refuse_consent"
check 'consent refuz: nr_vid este șters (Max-Age=0)' \
  bash -c 'grep -i "^set-cookie: nr_vid=" "$1" | grep -q "Max-Age=0"' _ "$TMP/refuse.h"

# ---------------------------------------------------------------------------
# 3. Consent ACCEPT (jar proaspăt) -> nr_vid -> eveniment CDP acceptat (204)
# ---------------------------------------------------------------------------
fetch_with_headers "$BASE/api/consent" "$TMP/accept.h" "$TMP/accept.b" \
  -X POST -H 'content-type: application/json' --data '{"choice":"accepted"}'
accept_status="$(head -n 1 "$TMP/accept.h" | awk '{print $2}')"
check "consent accept: JSON POST răspunde 200 (a fost: ${accept_status})" \
  test "$accept_status" = 200
accept_consent="$(cookie_value "$TMP/accept.h" nr_consent)"
accept_vid="$(cookie_value "$TMP/accept.h" nr_vid)"
check 'consent accept: nr_vid este emis (non-gol)' test -n "$accept_vid"

cdp_status="$(status_of "$BASE/api/cdp/events" \
  -X POST -H 'content-type: application/json' \
  -H "Cookie: nr_consent=${accept_consent}; nr_vid=${accept_vid}" \
  --data '{"events":[{"type":"page_view","path":"/"}]}')"
check "CDP: eveniment cu consimțământ răspunde 204 (a fost: ${cdp_status})" \
  test "$cdp_status" = 204

# ---------------------------------------------------------------------------
# 4. Primul articol ORIGINAL (din sitemap): 200 + JSON-LD
# ---------------------------------------------------------------------------
"${CURL[@]}" -o "$TMP/sitemap.xml" "$BASE/sitemap.xml" 2>/dev/null || true
original_url="$(grep -o '<loc>[^<]*</loc>' "$TMP/sitemap.xml" 2>/dev/null |
  sed 's/<[^>]*>//g' | grep '/stiri/' | head -n 1)"
if [ -n "$original_url" ]; then
  original_path="/stiri/${original_url##*/stiri/}"
  fetch_with_headers "$BASE$original_path" "$TMP/orig.h" "$TMP/orig.html"
  orig_status="$(head -n 1 "$TMP/orig.h" | awk '{print $2}')"
  check "articol original ${original_path} răspunde 200 (a fost: ${orig_status})" \
    test "$orig_status" = 200
  check 'articolul original emite JSON-LD (application/ld+json)' \
    grep -q 'application/ld+json' "$TMP/orig.html"
else
  fail 'sitemap.xml nu conține niciun articol original (/stiri/…) — rulați seed-ul'
  fail 'articolul original nu a putut fi verificat (JSON-LD)'
fi

# ---------------------------------------------------------------------------
# 5. Pagina AGREGATĂ: canonical -> publicatorul original
# ---------------------------------------------------------------------------
"${CURL[@]}" -o "$TMP/agg.json" \
  "$BASE/api/aggregated-items?limit=1&depth=0&where%5Barchived%5D%5Bnot_equals%5D=true" \
  2>/dev/null || true
agg_slug="$(node -e '
  try {
    const doc = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).docs?.[0]
    if (doc?.slug) process.stdout.write(doc.slug)
  } catch {}
' "$TMP/agg.json")"
agg_source_url="$(node -e '
  try {
    const doc = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).docs?.[0]
    if (doc?.sourceUrl) process.stdout.write(doc.sourceUrl)
  } catch {}
' "$TMP/agg.json")"
if [ -n "$agg_slug" ] && [ -n "$agg_source_url" ]; then
  "${CURL[@]}" -o "$TMP/agg.html" "$BASE/stiri/$agg_slug" 2>/dev/null || true
  canonical="$(node -e '
    const html = require("fs").readFileSync(process.argv[1], "utf8")
    const m = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)
    if (m) process.stdout.write(m[1].replace(/&amp;/g, "&"))
  ' "$TMP/agg.html")"
  check "pagina agregată /stiri/${agg_slug}: canonical -> publicator" \
    test "$canonical" = "$agg_source_url"
else
  fail 'nu există niciun element agregat ne-arhivat — canonical nu a putut fi verificat'
fi

# ---------------------------------------------------------------------------
# 6-8. Rute publice: categorie, căutare, robots/sitemap/manifest
# ---------------------------------------------------------------------------
for path in '/categorie/actualitate' '/cautare?q=test' '/robots.txt' '/sitemap.xml' '/manifest.webmanifest'; do
  st="$(status_of "$BASE$path")"
  check "${path} răspunde 200 (a fost: ${st})" test "$st" = 200
done

# ---------------------------------------------------------------------------
# 9. /api/health: ok:true (Postgres + Redis amândouă în viață)
# ---------------------------------------------------------------------------
fetch_with_headers "$BASE/api/health" "$TMP/health.h" "$TMP/health.json"
health_status="$(head -n 1 "$TMP/health.h" | awk '{print $2}')"
check "/api/health răspunde 200 (a fost: ${health_status})" test "$health_status" = 200
check '/api/health raportează ok:true' grep -q '"ok":true' "$TMP/health.json"

# ---------------------------------------------------------------------------
# 10. /admin: 200 (după redirect-uri — login sau create-first-user)
# ---------------------------------------------------------------------------
admin_status="$(status_of "$BASE/admin" -L)"
check "/admin răspunde 200 (a fost: ${admin_status})" test "$admin_status" = 200

# ---------------------------------------------------------------------------
# 11. /api/users anonim: refuzat (401/403) — REST-ul nu expune conturile
# ---------------------------------------------------------------------------
users_status="$(status_of "$BASE/api/users")"
check "/api/users anonim este refuzat cu 401/403 (a fost: ${users_status})" \
  bash -c 'test "$1" = 401 || test "$1" = 403' _ "$users_status"

# ---------------------------------------------------------------------------
# 12. Geo -> frecvența reclamelor: GB (everyNth 3) > RO (everyNth 5) pe /
#     Dev: header-ul x-geo-country este suficient. Producție îl ignoră
#     deliberat, deci refacem testul prin X-Real-IP + GeoLite2 (IP-uri reale
#     GB/RO); numărăm sloturile marcate aria-label="Publicitate".
# ---------------------------------------------------------------------------
ad_count() { # ad_count <extra curl header args...>
  # Whole-page HTML is a single line — count occurrences, not lines.
  "${CURL[@]}" "$@" "$BASE/" 2>/dev/null | grep -o 'aria-label="Publicitate"' | wc -l
}
gb_ads="$(ad_count -H 'x-geo-country: GB')"
ro_ads="$(ad_count -H 'x-geo-country: RO')"
geo_method='header x-geo-country'
if [ "$gb_ads" = "$ro_ads" ]; then
  gb_ads="$(ad_count -H 'X-Real-IP: 81.2.69.142')" # bloc londonez (GeoLite2)
  ro_ads="$(ad_count -H 'X-Real-IP: 5.2.128.1')"   # bloc RCS&RDS România
  geo_method='header X-Real-IP + GeoLite2'
fi
check "geo schimbă spațierea reclamelor: GB=${gb_ads} > RO=${ro_ads} sloturi (${geo_method})" \
  bash -c 'test "$1" -gt "$2"' _ "$gb_ads" "$ro_ads"

# ---------------------------------------------------------------------------
# 13. 404 cu brand (copie română, nu pagina implicită)
# ---------------------------------------------------------------------------
missing_path="/pagina-inexistenta-smoke-$$"
fetch_with_headers "$BASE$missing_path" "$TMP/404.h" "$TMP/404.html"
nf_status="$(head -n 1 "$TMP/404.h" | awk '{print $2}')"
check "URL necunoscut răspunde 404 (a fost: ${nf_status})" test "$nf_status" = 404
check 'pagina 404 este cea cu brand („Pagina nu a fost găsită”)' \
  grep -q 'Pagina nu a fost găsită' "$TMP/404.html"

# ---------------------------------------------------------------------------
echo "== ${PASS} PASS / ${FAIL} FAIL =="
test "$FAIL" -eq 0
