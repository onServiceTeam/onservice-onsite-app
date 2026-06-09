#!/usr/bin/env bash
# scripts/dev/up.sh
#
# Spin up the local Docker stack, run migrations, seed test data.
# Per Phase 14 Dispatch 0.5.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.dev.yml"
ENV_FILE="$REPO_ROOT/infra/docker/.env.docker"

cd "$REPO_ROOT"

# E07 — .env.docker is gitignored (so a real secret can't be committed). On a
# fresh checkout it won't exist yet; provision it from the tracked template.
if [ ! -f "$ENV_FILE" ]; then
  echo "==> .env.docker not found; creating it from .env.docker.example (local dev defaults)"
  cp "$REPO_ROOT/infra/docker/.env.docker.example" "$ENV_FILE"
fi

echo "==> Building and starting the stack..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo ""
echo "==> Waiting for postgres + redis + minio to be healthy..."
for svc in postgres redis minio; do
  for i in $(seq 1 30); do
    health=$(docker inspect --format '{{.State.Health.Status}}' "onservice-$svc" 2>/dev/null || echo "missing")
    if [ "$health" = "healthy" ]; then
      echo "  $svc: healthy"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "  $svc: TIMED OUT (status: $health)"
      echo "Logs:"
      docker logs --tail 30 "onservice-$svc"
      exit 1
    fi
    sleep 2
  done
done

echo ""
echo "==> Waiting for minio-init to complete bucket creation..."
for i in $(seq 1 15); do
  state=$(docker inspect --format '{{.State.Status}}' onservice-minio-init 2>/dev/null || echo "missing")
  exit_code=$(docker inspect --format '{{.State.ExitCode}}' onservice-minio-init 2>/dev/null || echo "")
  if [ "$state" = "exited" ] && [ "$exit_code" = "0" ]; then
    echo "  minio-init: success"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "  minio-init: TIMED OUT (state: $state, exit: $exit_code)"
    docker logs --tail 30 onservice-minio-init
    exit 1
  fi
  sleep 2
done

echo ""
echo "==> Running database migrations..."
if [ -f "$REPO_ROOT/scripts/run-migrations.sh" ]; then
  DATABASE_URL="postgresql://onservice:onservice_dev@localhost:7383/onservice_dev" \
    bash "$REPO_ROOT/scripts/run-migrations.sh" || {
      echo "  migrations failed; check output above"
      exit 1
    }
else
  echo "  scripts/run-migrations.sh not present; skipping (you may need to run migrations manually)"
fi

echo ""
echo "==> Seeding test data..."
if [ -d "$REPO_ROOT/packages/api/seeds" ]; then
  for seed in "$REPO_ROOT/packages/api/seeds"/*.sql; do
    [ -f "$seed" ] || continue
    name=$(basename "$seed")
    echo "  applying $name..."
    docker exec -i onservice-postgres psql -U onservice -d onservice_dev < "$seed" >/dev/null 2>&1 || \
      echo "    (warning: $name may have failed; non-fatal)"
  done
else
  echo "  packages/api/seeds not present; skipping"
fi

echo ""
echo "==> Stack is up. Endpoints:"
echo "    API           http://localhost:7381 (health: /health/ready)"
echo "    Postgres      localhost:7383 (user: onservice, db: onservice_dev)"
echo "    Redis         localhost:7385"
echo "    MinIO API     http://localhost:9000 (key: minioadmin / minioadmin)"
echo "    MinIO Console http://localhost:9001"
echo "    MailHog SMTP  localhost:1025"
echo "    MailHog UI    http://localhost:8025"
echo "    Prometheus    http://localhost:9090"
echo "    Grafana       http://localhost:3001 (admin / admin)"
echo ""
echo "==> Tear down with: scripts/dev/down.sh"
