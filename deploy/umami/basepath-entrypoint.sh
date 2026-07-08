#!/bin/sh
# Umami /stats basePath shim (owner fix round — /stats was a blank white page).
#
# WHY: the stock ghcr.io/umami-software/umami:postgresql-latest image is a
# Next.js **standalone** build with basePath baked in as "" at BUILD time. Its
# `server.js` sets process.env.__NEXT_PRIVATE_STANDALONE_CONFIG from an embedded
# nextConfig literal whose `basePath` and `assetPrefix` are "". The container's
# start-docker script (check-db → update-tracker → start-server) NEVER rebuilds,
# so a runtime `BASE_PATH=/stats` env var is a NO-OP: Umami keeps serving at root
# and emits ROOT-absolute /_next/* asset URLs that 404 under the app's /stats
# rewrite → the dashboard is a blank white page (exactly the owner's report).
#
# FIX: before Umami starts, patch the three keys in that embedded config to
# "/stats" so the standalone server routes everything under /stats AND emits
# /stats/_next/* asset URLs (assetPrefix). Idempotent — re-patching an already
# patched file is a no-op — so it is safe on every (re)start and survives image
# re-pulls (it edits whatever server.js the image ships). Mounted read-only by
# compose as the container `entrypoint`; it hands off to the image's real
# entrypoint (docker-entrypoint.sh) + CMD unchanged.
#
# PAIRED CHANGES (must stay in lockstep):
#   - next.config.ts rewrites(): /stats/:path* → umami:3000/stats/:path* (keep
#     the /stats prefix — prefix in ⇒ prefix out).
#   - compose.yaml umami: no BASE_PATH env needed (it does nothing); this shim
#     is the real mechanism.
set -e

SERVER_JS="/app/server.js"

if [ -f "$SERVER_JS" ]; then
  if grep -q '"basePath":"/stats"' "$SERVER_JS" 2>/dev/null; then
    echo "[umami-basepath] server.js already patched for /stats — skipping."
  else
    # The embedded JSON has exactly these substrings in the baked nextConfig.
    # We rewrite the two top-level Next keys (routing + asset prefix) and
    # Umami's own env.basePath (used to build internal hrefs).
    #
    # IMPORTANT: `sed -i` cannot be used — it creates a temp inode in /app,
    # which is owned by root and NOT writable by the `nextjs` runtime user
    # (only the server.js FILE is writable). So we sed to a scratch file in
    # /tmp and write it back by TRUNCATING the existing file in place
    # (`cat > file`), which needs write permission on the file, not its dir.
    TMP="$(mktemp)"
    sed \
      -e 's#"pagesBufferLength":5},"basePath":""#"pagesBufferLength":5},"basePath":"/stats"#' \
      -e 's#"cleanDistDir":true,"assetPrefix":""#"cleanDistDir":true,"assetPrefix":"/stats"#' \
      -e 's#"env":{"apiUrl":"","basePath":""#"env":{"apiUrl":"","basePath":"/stats"#' \
      "$SERVER_JS" > "$TMP"
    if grep -q '"basePath":"/stats"' "$TMP" 2>/dev/null; then
      cat "$TMP" > "$SERVER_JS"
      rm -f "$TMP"
      echo "[umami-basepath] patched server.js: basePath/assetPrefix → /stats."
    else
      rm -f "$TMP"
      echo "[umami-basepath] WARNING: patch produced no /stats basePath — the image layout may have changed; serving unpatched." >&2
    fi
  fi
else
  echo "[umami-basepath] WARNING: $SERVER_JS not found — serving unpatched." >&2
fi

# Hand off to the image's real entrypoint + CMD (npm run start-docker).
exec docker-entrypoint.sh "$@"
