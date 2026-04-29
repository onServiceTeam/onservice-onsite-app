#!/usr/bin/env bash
# scripts/dev/down.sh
#
# Tear down the local Docker stack and remove volumes.
# Per Phase 14 Dispatch 0.5.
#
# By default removes named volumes (postgres-data, redis-data, etc.)
# so the next `up.sh` starts from a clean slate.
# Pass --keep-volumes to preserve database state across restarts.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.dev.yml"
ENV_FILE="$REPO_ROOT/infra/docker/.env.docker"

cd "$REPO_ROOT"

KEEP_VOLUMES=0
for arg in "$@"; do
  case "$arg" in
    --keep-volumes) KEEP_VOLUMES=1 ;;
    -h|--help)
      echo "Usage: $0 [--keep-volumes]"
      echo "  --keep-volumes  preserve postgres / redis / minio / prometheus / grafana data"
      exit 0
      ;;
  esac
done

if [ "$KEEP_VOLUMES" -eq 1 ]; then
  echo "==> Stopping containers (volumes preserved)..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --remove-orphans
else
  echo "==> Stopping containers and removing volumes..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v --remove-orphans
fi

echo "==> Done."
