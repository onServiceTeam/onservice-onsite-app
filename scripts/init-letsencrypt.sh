#!/bin/bash
set -euo pipefail

# SSL Certificate Bootstrap Script for onService API
# Run this ONCE on first deployment before `docker compose -f docker-compose.prod.yml up`
#
# Prerequisites:
#   - Domain DNS must already point to this server's IP
#   - Docker and docker compose must be installed
#   - .env file must exist with DOMAIN and CERTBOT_EMAIL set

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "ERROR: .env file not found at $PROJECT_DIR/.env"
  echo "Copy .env.example to .env and fill in the values first."
  exit 1
fi

source "$PROJECT_DIR/.env"

DOMAIN="${DOMAIN:-api.onservice.ph}"
EMAIL="${CERTBOT_EMAIL:-admin@onservice.ph}"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "=== onService SSL Bootstrap ==="
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

DATA_PATH="$PROJECT_DIR/certbot"
mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
mkdir -p "$DATA_PATH/www"

echo "Step 1: Generating temporary self-signed certificate..."
docker run --rm \
  -v "$DATA_PATH/conf:/etc/letsencrypt" \
  alpine/openssl req -x509 -nodes -newkey rsa:4096 \
  -days 1 \
  -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
  -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
  -subj "/CN=$DOMAIN" 2>/dev/null

echo "Step 2: Ensuring external persistent uploads volume..."
ALLOW_CREATE_UPLOADS_VOLUME=1 bash "$PROJECT_DIR/scripts/server/ensure-uploads-volume.sh"

echo "Step 3: Starting nginx with temporary certificate..."
docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" up -d nginx

echo "Step 4: Waiting for nginx to start..."
sleep 5

echo "Step 5: Requesting Let's Encrypt certificate..."
docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  --force-renewal

echo "Step 6: Reloading nginx with real certificate..."
docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" exec nginx nginx -s reload

echo ""
echo "=== SSL bootstrap complete ==="
echo "Certificate installed for: $DOMAIN"
echo "Auto-renewal is handled by the certbot container."
echo ""
echo "You can now run: docker compose -f docker-compose.prod.yml up -d"
