#!/usr/bin/env bash
# ============================================================================
# SUDO BLOCK 1 of ~2 — rootless-container prerequisites (newsromania.info)
# ----------------------------------------------------------------------------
# Run as root (or with sudo):   sudo bash deploy/sudo-block-1-container-runtime.sh
#
# What it does and why:
#   - uidmap        : provides the setuid helpers newuidmap/newgidmap, required
#                     for rootless Docker to map multiple UIDs inside user
#                     namespaces (the postgres/redis images switch users).
#                     /etc/subuid + /etc/subgid entries for `newsagent` already
#                     exist — nothing else to configure.
#   - slirp4netns   : userspace networking for rootless containers.
#
# Everything else is already done user-locally by the agent (no root needed):
#   - Docker 29.6.1 static binaries + rootless extras are in ~newsagent/bin
#   - kernel unprivileged user namespaces: enabled
#   - dbus-user-session: installed;  systemd user session + linger: active
#
# After this block succeeds, the agent (as newsagent, NO root) finishes with:
#   bash scripts/setup-rootless-docker.sh
#
# Expected remaining sudo block for the whole project: 1 (nginx + certbot at deploy).
# ============================================================================
set -euo pipefail

apt-get update
apt-get install -y uidmap slirp4netns

echo "OK — rootless prerequisites installed. Hand back to the agent."
