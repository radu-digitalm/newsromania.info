#!/usr/bin/env bash
# Rootless Docker setup for user `newsagent` — run WITHOUT root, after
# deploy/sudo-block-1-container-runtime.sh has been applied by the owner.
# Idempotent: safe to re-run.
set -euo pipefail

export PATH="$HOME/bin:$PATH"

if ! command -v newuidmap >/dev/null 2>&1; then
  echo "ERROR: newuidmap missing — the owner must first run:" >&2
  echo "  sudo bash deploy/sudo-block-1-container-runtime.sh" >&2
  exit 1
fi

# Installs ~/.config/systemd/user/docker.service and enables it (linger is on,
# so the daemon survives logout). The daemon socket is per-user — it does NOT
# touch any system Docker and never needs the root-equivalent `docker` group.
dockerd-rootless-setuptool.sh install

# Make the docker CLI target the rootless daemon in future shells.
LINE='export DOCKER_HOST=unix:///run/user/1004/docker.sock'
grep -qxF "$LINE" "$HOME/.bashrc" || echo "$LINE" >> "$HOME/.bashrc"

systemctl --user status docker.service --no-pager | head -5
DOCKER_HOST=unix:///run/user/1004/docker.sock "$HOME/bin/docker" info --format 'rootless={{.SecurityOptions}}'
echo "OK — rootless Docker is running."
