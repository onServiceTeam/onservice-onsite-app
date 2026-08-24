#!/usr/bin/env bash
# scripts/server/02-deploy.sh
# Configure env + bring up the data plane (Postgres, pgBouncer, Redis, API),
# run migrations, and seed the catalog. Does NOT start nginx/TLS — that
# happens after DNS resolves (see 03-tls.sh). Idempotent. Run on the server
# from /opt/onservice as root.
set -euo pipefail
cd /opt/onservice
COMPOSE="docker compose -f docker-compose.prod.yml"
FIRST_INSTALL=0

echo "==> [1/7] Generate .env (secrets created here, never elsewhere)"
if [ ! -f .env ]; then
  FIRST_INSTALL=1
  cp .env.production.example .env
  DB_PW=$(openssl rand -hex 24)
  REDIS_PW=$(openssl rand -hex 24)
  GRAFANA_PW=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 64)
  DATA_EXPORT_SECRET=$(openssl rand -hex 64)
  FEEDBACK_EXPORT_SECRET=$(openssl rand -hex 64)
  TOTP=$(openssl rand -hex 32)
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PW}|" .env
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PW}|" .env
  sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=${GRAFANA_PW}|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" .env
  sed -i "s|^DATA_EXPORT_DOWNLOAD_SECRET=.*|DATA_EXPORT_DOWNLOAD_SECRET=${DATA_EXPORT_SECRET}|" .env
  sed -i "s|^FEEDBACK_EXPORT_KEY=.*|FEEDBACK_EXPORT_KEY=${FEEDBACK_EXPORT_SECRET}|" .env
  sed -i "s|^TOTP_ENCRYPTION_KEY=.*|TOTP_ENCRYPTION_KEY=${TOTP}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://onservice_user:${DB_PW}@pgbouncer:6432/onservice|" .env
  sed -i "s|^DATABASE_DIRECT_URL=.*|DATABASE_DIRECT_URL=postgresql://onservice_user:${DB_PW}@postgres:5432/onservice|" .env
  sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:${REDIS_PW}@redis:6379|" .env
  chmod 600 .env
  echo "    .env created with generated secrets. Third-party keys still placeholders."
else
  echo "    .env already exists — leaving it untouched."
fi

echo "==> [2/7] Create certbot directories"
mkdir -p certbot/conf certbot/www

echo "==> [3/7] Ensure external persistent uploads volume"
ALLOW_CREATE_UPLOADS_VOLUME="$FIRST_INSTALL" bash scripts/server/ensure-uploads-volume.sh

echo "==> [4/7] Build the API image (this is the slow step)"
$COMPOSE build api

echo "==> [5/7] Start data plane: postgres, pgbouncer, redis"
$COMPOSE up -d postgres pgbouncer redis

echo "==> [6/7] Wait for postgres, migrate, then start API"
for i in $(seq 1 40); do
  if $COMPOSE exec -T postgres pg_isready -U onservice_user -d onservice >/dev/null 2>&1; then echo "    postgres ready"; break; fi
  sleep 3
done
echo "    running migrations (direct connection, not the pooler)..."
bash scripts/server/run-production-migrations.sh
$COMPOSE up -d --no-deps api
for i in $(seq 1 40); do
  if $COMPOSE exec -T api curl -sf http://localhost:7381/health/ready >/dev/null 2>&1; then echo "    api ready"; break; fi
  if [ "$i" -eq 40 ]; then
    echo "ERROR: API failed to become healthy after migrations." >&2
    $COMPOSE logs --tail=100 api >&2
    exit 1
  fi
  sleep 3
done

echo "==> [7/7] Apply explicitly enabled development fixtures"
mapfile -t SEED_FILES < <(bash scripts/server/list-enabled-seeds.sh .env)
if [ "${#SEED_FILES[@]}" -eq 0 ]; then
  echo "    skipped (ENABLE_TEST_FIXTURES is not 1)"
else
  echo "    WARNING: development fixture mode is enabled"
  for f in "${SEED_FILES[@]}"; do
    echo "    applying $(basename "$f")..."
    $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U onservice_user -d onservice < "$f" >/dev/null
  done
fi

echo "==> Data plane up. API health:"
for i in $(seq 1 20); do
  if $COMPOSE exec -T api curl -sf http://localhost:7381/health/ready >/dev/null 2>&1; then
    $COMPOSE exec -T api curl -s http://localhost:7381/health/ready; echo; break
  fi
  sleep 3
done
echo "DEPLOY_DATAPLANE_DONE"
