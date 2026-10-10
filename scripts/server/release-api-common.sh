#!/usr/bin/env bash
# Sourced by the migration/activation helpers after selecting the checkout.
# OPS-476: loading an image is not evidence that Compose will run that image.
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
ONSERVICE_RELEASE_SHA="${ONSERVICE_RELEASE_SHA:-}"
if [[ ! "$ONSERVICE_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: ONSERVICE_RELEASE_SHA must be a full lowercase Git commit SHA." >&2
  exit 2
fi
export ONSERVICE_RELEASE_SHA

if [[ "$(git rev-parse HEAD)" != "$ONSERVICE_RELEASE_SHA" ]]; then
  echo "ERROR: checkout HEAD does not match the requested API release." >&2
  exit 1
fi
if ! git diff --quiet HEAD --; then
  echo "ERROR: tracked checkout changes must be resolved before release." >&2
  exit 1
fi
if [[ ! -f docker-compose.prod.yml || ! -f docker-compose.release.yml ]]; then
  echo "ERROR: both production and exact-image release Compose files are required." >&2
  exit 1
fi

RELEASE_IMAGE="onservice-api:$ONSERVICE_RELEASE_SHA"
RELEASE_IMAGE_ID="$("$DOCKER_BIN" image inspect --format '{{.Id}}' "$RELEASE_IMAGE")"
if [[ ! "$RELEASE_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "ERROR: the exact API release image is not loaded locally." >&2
  exit 1
fi
image_revision="$("$DOCKER_BIN" image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$RELEASE_IMAGE")"
if [[ "$image_revision" != "$ONSERVICE_RELEASE_SHA" ]]; then
  echo "ERROR: loaded API image revision does not match the requested release." >&2
  exit 1
fi

release_compose() {
  "$DOCKER_BIN" compose -f docker-compose.prod.yml -f docker-compose.release.yml "$@"
}
