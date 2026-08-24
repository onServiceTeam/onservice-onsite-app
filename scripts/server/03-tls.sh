#!/usr/bin/env bash
# scripts/server/03-tls.sh — issue the Let's Encrypt cert (multi-SAN) and start
# nginx with HTTPS. Run on the server from /opt/onservice as root, AFTER DNS
# for api/admin/app/www.onservice.ph points at this host.
set -euo pipefail
cd /opt/onservice
EMAIL="$(grep -E '^CERTBOT_EMAIL=' .env | cut -d= -f2- || true)"
EMAIL="${EMAIL:-admin@onservice.ph}"
mkdir -p certbot/conf certbot/www
bash scripts/server/ensure-uploads-volume.sh

echo "==> Stopping nginx (free port 80 for standalone issuance)"
docker compose -f docker-compose.prod.yml stop nginx 2>/dev/null || true

echo "==> Requesting certificate (api + admin + app + www)"
docker run --rm -p 80:80 \
  -v /opt/onservice/certbot/conf:/etc/letsencrypt \
  -v /opt/onservice/certbot/www:/var/www/certbot \
  certbot/certbot:v3.3.0 certonly --standalone \
  --preferred-challenges http \
  -d api.onservice.ph -d admin.onservice.ph -d app.onservice.ph -d www.onservice.ph \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive

echo "==> Cert files:"
ls -1 certbot/conf/live/api.onservice.ph/ 2>/dev/null || echo "  (no cert dir — check output above)"

echo "==> Starting nginx + certbot renew loop"
docker compose -f docker-compose.prod.yml up -d nginx certbot 2>&1 | tail -4
echo "TLS_DONE"
