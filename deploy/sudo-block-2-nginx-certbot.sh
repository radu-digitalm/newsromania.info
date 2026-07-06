#!/usr/bin/env bash
# ============================================================================
# SUDO BLOCK 2 of 2 (FINAL) — nginx vhost + web root + certbot (newsromania.info)
# ----------------------------------------------------------------------------
# Run as root (or with sudo):   sudo bash deploy/sudo-block-2-nginx-certbot.sh
#
# This is the LAST root intervention this project needs. It is structured so
# the nginx part (steps 1–4) succeeds on its own even BEFORE the domain's DNS
# points at this VPS — the site simply answers on :80 for the server_name.
# Step 5 (certbot) is LAST and requires DNS: newsromania.info +
# www.newsromania.info must resolve to this server (A/AAAA), otherwise the
# HTTP-01 challenge fails. Re-running only step 5 later is safe:
#   sudo certbot --nginx -d newsromania.info -d www.newsromania.info --redirect
#
# What it does and why:
#   1. installs deploy/nginx/newsromania.conf → /etc/nginx/sites-available/
#      and symlinks it into sites-enabled (proxy → 127.0.0.1:3100).
#   2. creates the web root /var/www/newsromania (ACME webroot), owned
#      newsagent:www-data, mode 2775 (setgid: new files stay group www-data,
#      group-readable for nginx — CLAUDE.md web-root rule).
#   3. nginx -t (validate) && systemctl reload nginx.
#   4. installs certbot + the nginx plugin if missing.
#   5. certbot --nginx --redirect: issues the certificate, rewrites the vhost
#      with the 443 block + HTTP→HTTPS redirect, installs auto-renewal
#      (systemd timer certbot.timer, ships with the package).
#
# Idempotent: every step is safe to re-run.
# ============================================================================
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

PROJECT_ROOT="/home/newsagent/workspace/newsromania"
CONF_SRC="${PROJECT_ROOT}/deploy/nginx/newsromania.conf"
CONF_DST="/etc/nginx/sites-available/newsromania"
WEB_ROOT="/var/www/newsromania"

# --- 1. nginx vhost ---------------------------------------------------------
echo "[1/5] installing nginx vhost: ${CONF_DST}"
install -m 644 "${CONF_SRC}" "${CONF_DST}"
ln -sfn "${CONF_DST}" /etc/nginx/sites-enabled/newsromania

# --- 2. web root (ACME webroot; newsagent-writable, nginx-readable) ---------
echo "[2/5] web root ${WEB_ROOT} (newsagent:www-data, 2775 setgid)"
mkdir -p "${WEB_ROOT}"
chown newsagent:www-data "${WEB_ROOT}"
chmod 2775 "${WEB_ROOT}"

# --- 3. validate + reload nginx ---------------------------------------------
echo "[3/5] nginx -t && reload"
nginx -t
systemctl reload nginx
echo "      nginx now proxies newsromania.info → 127.0.0.1:3100 (HTTP)."

# --- 4. certbot (install only if missing) -----------------------------------
echo "[4/5] certbot + python3-certbot-nginx"
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update
  apt-get install -y certbot python3-certbot-nginx
else
  # the nginx plugin may still be missing even when certbot exists
  dpkg -s python3-certbot-nginx >/dev/null 2>&1 || {
    apt-get update
    apt-get install -y python3-certbot-nginx
  }
  echo "      certbot already installed — skipping."
fi

# --- 5. certificate (REQUIRES DNS pointing at this VPS) ---------------------
echo "[5/5] certbot --nginx (HTTPS + redirect)"
echo "      NOTE: this step FAILS harmlessly if newsromania.info /"
echo "      www.newsromania.info do not resolve to this server yet."
echo "      After the DNS cutover, re-run just this command:"
echo "        sudo certbot --nginx -d newsromania.info -d www.newsromania.info --redirect"
certbot --nginx -d newsromania.info -d www.newsromania.info --redirect

echo
echo "DONE — HTTPS live. No further root access is expected for this project."
