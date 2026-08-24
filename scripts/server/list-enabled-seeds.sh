#!/usr/bin/env bash
# Prints development seed paths only when ENABLE_TEST_FIXTURES=1 in the given
# environment file. Production/staging deploys default to no SQL fixtures.
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 2
fi

FIXTURE_FLAG="$({ grep -E '^ENABLE_TEST_FIXTURES=' "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2- | tr -d '[:space:]\r')"
if [ "$FIXTURE_FLAG" != "1" ]; then
  exit 0
fi

find packages/api/seeds -maxdepth 1 -type f -name '*.sql' -print | sort
