#!/usr/bin/env bash
# First-install helper for the external persistent uploads volume. Routine
# deployments must treat a missing production volume as a data-loss hard stop;
# this helper is called only by the server bootstrap/TLS setup scripts.
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
VOLUME_NAME="${ONSERVICE_UPLOADS_VOLUME_NAME:-onservice_uploads_data}"

if "$DOCKER_BIN" volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
  echo "    uploads volume exists: $VOLUME_NAME"
  exit 0
fi

if [ "${ALLOW_CREATE_UPLOADS_VOLUME:-0}" != "1" ]; then
  echo "ERROR: uploads volume is missing: $VOLUME_NAME" >&2
  echo "Treat this as possible data loss. Set ALLOW_CREATE_UPLOADS_VOLUME=1 only for a verified first install." >&2
  exit 1
fi

"$DOCKER_BIN" volume create "$VOLUME_NAME" >/dev/null
echo "    uploads volume created: $VOLUME_NAME"
