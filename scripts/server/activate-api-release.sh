#!/usr/bin/env bash
# API-only activation, after backup and any explicitly reviewed migrations.
# This is NOT a full app release: frontend publication and acceptance are separate.
set -euo pipefail
cd "${ONSERVICE_PROJECT_DIR:-/opt/onservice}"
source scripts/server/release-api-common.sh

# Never build, pull, or restart PostgreSQL, Redis, nginx or another project.
release_compose up -d --no-deps --no-build --pull never api
api_id="$(release_compose ps -q api)"
if [[ ! "$api_id" =~ ^[0-9a-f]{12,64}$ ]]; then
  echo "ERROR: expected exactly one API container after activation." >&2
  exit 1
fi

for attempt in $(seq 1 30); do
  if [[ "$("$DOCKER_BIN" inspect --format '{{.Image}}' "$api_id")" != "$RELEASE_IMAGE_ID" ]]; then
    echo "ERROR: the running API is not the verified release image." >&2
    exit 1
  fi
  if "$DOCKER_BIN" exec "$api_id" curl -fsS http://localhost:7381/health/ready >/dev/null 2>&1; then
    # Fail if another deployment replaced this service while it was checked.
    if [[ "$(release_compose ps -q api)" != "$api_id" ]]; then
      echo "ERROR: API container changed during readiness verification." >&2
      exit 1
    fi
    echo "API activation verified: revision=$ONSERVICE_RELEASE_SHA image=$RELEASE_IMAGE_ID"
    echo "API only; frontend alignment and business acceptance have not been verified."
    exit 0
  fi
  if [[ "$attempt" -lt 30 ]]; then sleep 2; fi
done

echo "ERROR: exact API image failed readiness; deployment is not successful." >&2
echo "Use the reviewed application rollback plan; do not restore or downgrade the live database automatically." >&2
exit 1
