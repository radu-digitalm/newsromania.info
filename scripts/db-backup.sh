#!/usr/bin/env bash
# db-backup.sh — backup PostgreSQL (arch §7/§9): pg_dump -Fc prin docker exec
# în containerul newsromania-postgres, în backups/ (gitignorat), păstrează
# cele mai noi 14 fișiere, le șterge pe cele mai vechi.
#
# Rulat zilnic de newsromania-backup.timer (04:15) și MANUAL înaintea
# oricărei migrări (regulă, arch §8).
#
# Restaurare (vezi și deploy/DEPLOY.md):
#   docker exec -i newsromania-postgres pg_restore -U "$POSTGRES_USER" \
#     -d "$POSTGRES_DB" --clean --if-exists < backups/<fișier>.dump

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/$(id -u)/docker.sock}"

# Citește .env fără a afișa vreo valoare (secrete!).
if [[ ! -f .env ]]; then
  echo "EROARE: .env lipsește în ${PROJECT_ROOT}" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${POSTGRES_USER:?POSTGRES_USER lipsește din .env}"
: "${POSTGRES_DB:?POSTGRES_DB lipsește din .env}"

mkdir -p backups

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/newsromania-${STAMP}.dump"
TMP="${OUT}.part"

echo "Backup: ${OUT} (pg_dump -Fc, container newsromania-postgres)"
if ! docker exec newsromania-postgres \
  pg_dump -U "${POSTGRES_USER}" -Fc "${POSTGRES_DB}" > "${TMP}"; then
  rm -f -- "${TMP}"
  echo "EROARE: pg_dump a eșuat — rulează containerul newsromania-postgres?" >&2
  exit 1
fi
mv -- "${TMP}" "${OUT}"

# Sanity: un dump valid -Fc nu are cum să fie gol.
if [[ ! -s "${OUT}" ]]; then
  rm -f -- "${OUT}"
  echo "EROARE: dump gol — backup ANULAT." >&2
  exit 1
fi

# Retenție: păstrează cele mai noi 14, șterge restul. Ștergere STRICT limitată
# la backups/newsromania-*.dump (fără glob-uri largi — regula CLAUDE.md #8).
mapfile -t old < <(find backups -maxdepth 1 -name 'newsromania-*.dump' -type f \
  -printf '%T@ %p\n' | sort -rn | awk 'NR>14 {sub(/^[^ ]+ /,""); print}')
for f in "${old[@]:-}"; do
  [[ -n "${f}" ]] || continue
  rm -f -- "${f}"
  echo "șters (retenție >14): ${f}"
done

echo
echo "Backupuri existente:"
find backups -maxdepth 1 -name 'newsromania-*.dump' -type f -printf '%s\t%p\n' |
  sort -t$'\t' -k2 | awk -F'\t' '{ printf "  %8.1f MB  %s\n", $1/1048576, $2 }'
