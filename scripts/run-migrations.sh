#!/bin/bash
set -euo pipefail

# Run database migrations for onService API
# Usage: ./scripts/run-migrations.sh [up|down|redo]
#
# For Docker production:
#   docker compose -f docker-compose.prod.yml run --rm api npx node-pg-migrate up --migrations-dir migrations
#
# For local development:
#   npm run migrate:up --workspace=packages/api

ACTION="${1:-up}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Set it in .env or pass it as an environment variable."
  exit 1
fi

echo "=== onService Database Migrations ==="
echo "Action:   $ACTION"
echo "Database: ${DATABASE_URL%%@*}@****"
echo ""

cd "$PROJECT_DIR/packages/api"

case "$ACTION" in
  up)
    echo "Applying pending migrations..."
    npx node-pg-migrate up --migrations-dir migrations
    ;;
  down)
    echo "Rolling back last migration..."
    npx node-pg-migrate down --migrations-dir migrations
    ;;
  redo)
    echo "Re-applying last migration..."
    npx node-pg-migrate down --migrations-dir migrations
    npx node-pg-migrate up --migrations-dir migrations
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Usage: $0 [up|down|redo]"
    exit 1
    ;;
esac

echo ""
echo "=== Migration $ACTION complete ==="
