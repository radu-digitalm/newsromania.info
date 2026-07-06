#!/usr/bin/env bash
# install-user-units.sh — instalează unitățile systemd de UTILIZATOR ale
# proiectului (newsromania-*): symlink în ~/.config/systemd/user, apoi
# daemon-reload și enable --now pentru TIMERE (serviciile oneshot sunt
# pornite de timerele lor, nu direct).
#
# Idempotent: rulările repetate re-creează symlinkurile și re-activează
# timerele fără efecte secundare. Fără sudo — doar systemctl --user.
#
# Globul newsromania-* preia AUTOMAT orice unitate nouă din acest director —
# la data scrierii: ingest (RSS, la 20 min), profiles (CDP, la 10 min),
# social (coada de postări, orar). Adaugă fișierele .service/.timer aici și
# re-rulează scriptul.

set -euo pipefail

UNIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.config/systemd/user"

mkdir -p "${TARGET_DIR}"

shopt -s nullglob
units=("${UNIT_DIR}"/newsromania-*.service "${UNIT_DIR}"/newsromania-*.timer)
if [[ ${#units[@]} -eq 0 ]]; then
  echo "Nicio unitate newsromania-* găsită în ${UNIT_DIR}" >&2
  exit 1
fi

for unit in "${units[@]}"; do
  name="$(basename "${unit}")"
  ln -sfn "${unit}" "${TARGET_DIR}/${name}"
  echo "instalat: ${TARGET_DIR}/${name} -> ${unit}"
done

systemctl --user daemon-reload

for unit in "${units[@]}"; do
  name="$(basename "${unit}")"
  if [[ "${name}" == *.timer ]]; then
    systemctl --user enable --now "${name}"
    echo "activat:  ${name}"
  fi
done

echo
systemctl --user list-timers 'newsromania-*' --no-pager || true
