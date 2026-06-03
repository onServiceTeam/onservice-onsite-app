#!/usr/bin/env bash
# scripts/server/02-deploy.sh
# Configure env + bring up the data plane (Postgres, pgBouncer, Redis, API),
# run migrations, and seed the catalog. Does NOT start nginx/TLS — that
# happens after DNS resolves (see 03-tls.sh). Idempotent. Run on the server
# from /opt/onservice as root.
set -euo pipefail
cd /opt/onservice
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> [1/6] Generate .env (secrets created here, never elsewhere)"
if [ ! -f .env ]; then
  cp .env.production.example .env
  DB_PW=$(openssl rand -hex 24)
  REDIS_PW=$(openssl rand -hex 24)
  GRAFANA_PW=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 64)
  TOTP=$(openssl rand -hex 32)
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PW}|" .env
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PW}|" .env
  sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=${GRAFANA_PW}|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" .env
  sed -i "s|^TOTP_ENCRYPTION_KEY=.*|TOTP_ENCRYPTION_KEY=${TOTP}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://onservice_user:${DB_PW}@pgbouncer:6432/onservice|" .env
  sed -i "s|^DATABASE_DIRECT_URL=.*|DATABASE_DIRECT_URL=postgresql://onservice_user:${DB_PW}@postgres:5432/onservice|" .env
  sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:${REDIS_PW}@redis:6379|" .env
  chmod 600 .env
  echo "    .env created with generated secrets. Third-party keys still placeholders."
else
  echo "    .env already exists — leaving it untouched."
fi

echo "==> [2/6] Create certbot directories"
mkdir -p certbot/conf certbot/www

echo "==> [3/6] Build the API image (this is the slow step)"
$COMPOSE build api

echo "==> [4/6] Start data plane: postgres, pgbouncer, redis, api"
$COMPOSE up -d postgres pgbouncer redis api

echo "==> [5/6] Wait for postgres + api health"
for i in $(seq 1 40); do
  if $COMPOSE exec -T postgres pg_isready -U onservice_user -d onservice >/dev/null 2>&1; then echo "    postgres ready"; break; fi
  sleep 3
done
echo "    running migrations (direct connection, not the pooler)..."
$COMPOSE exec -T api sh -lc 'DATABASE_URL="$DATABASE_DIRECT_URL" npm run migrate:up'

echo "==> [6/6] Seed catalog + Cebu service areas + demo data"
for f in packages/api/seeds/*.sql; do
  echo "    applying $(basename "$f")..."
  $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=0 -U onservice_user -d onservice < "$f" >/dev/null 2>&1 || echo "      (warning: $(basename "$f") had issues; non-fatal)"
done

echo "==> Data plane up. API health:"
for i in $(seq 1 20); do
  if $COMPOSE exec -T api curl -sf http://localhost:7381/health/ready >/dev/null 2>&1; then
    $COMPOSE exec -T api curl -s http://localhost:7381/health/ready; echo; break
  fi
  sleep 3
done
echo "DEPLOY_DATAPLANE_DONE"
