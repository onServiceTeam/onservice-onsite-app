#!/usr/bin/env bash
# Run reviewed production migrations through the API image and the direct
# Postgres connection. The dry run is always executed first and printed in the
# deployment log before any schema change is attempted.
set -euo pipefail

PROJECT_DIR="${ONSERVICE_PROJECT_DIR:-/opt/onservice}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
MIGRATION_TARGET="${MIGRATION_TARGET:-}"

cd "$PROJECT_DIR"

if [ -n "$MIGRATION_TARGET" ] && [[ ! "$MIGRATION_TARGET" =~ ^[0-9]{3}_[a-z0-9_]+$ ]]; then
  echo "ERROR: MIGRATION_TARGET must be an exact migration basename such as 148_provider_portfolio_consent." >&2
  exit 2
fi

# This repository predates node-pg-migrate's timestamp filename convention.
# Production migrations 135-145 were recorded in a nonnumeric order during one
# historical deployment, so the runner's check-order mode rejects every later
# migration even though the migration set is complete. We therefore disable
# that check, use an exact target for ordinary releases, and prove the pending
# SQL with a dry run before applying it.
target_arg=""
if [ -n "$MIGRATION_TARGET" ]; then
  target_arg=" $MIGRATION_TARGET"
fi

migration_command='DATABASE_URL="$DATABASE_DIRECT_URL" npm run migrate:up --'"$target_arg"' --migrations-dir migrations --no-check-order'

compose() {
  "$DOCKER_BIN" compose -f docker-compose.prod.yml "$@"
}

# A release must dry-run and migrate with the SAME verified image that will
# serve traffic. Initial-install callers without a release SHA keep their
# explicitly built local image path; ordinary releases may not use that path.
if [[ -n "${ONSERVICE_RELEASE_SHA:-}" ]]; then
  if [[ -z "$MIGRATION_TARGET" ]]; then
    echo "ERROR: an exact MIGRATION_TARGET is required for a release." >&2
    exit 2
  fi
  source scripts/server/release-api-common.sh
  compose() { release_compose "$@"; }
fi

echo "==> Production migration dry run${MIGRATION_TARGET:+: $MIGRATION_TARGET}"
compose run --rm --no-deps api sh -lc "$migration_command --dry-run"

if [ "${MIGRATIONS_DRY_RUN_ONLY:-0}" = "1" ]; then
  echo "==> Dry run complete; no migration was applied."
  exit 0
fi

echo "==> Applying reviewed production migration${MIGRATION_TARGET:+: $MIGRATION_TARGET}"
compose run --rm --no-deps api sh -lc "$migration_command"
echo "==> Production migrations complete."
