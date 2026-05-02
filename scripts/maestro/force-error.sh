#!/usr/bin/env bash
# D-J27 / F#3 fix — arm the API to return 500 on the next request.
# Used by Maestro flows to capture each screen's error state.
#
# Requires: local Docker stack up with the API running on $API_URL
# (default http://localhost:7381) AND the API booted with
# ENABLE_TEST_FIXTURES=1 + NODE_ENV != production.

set -euo pipefail

API_URL="${API_URL:-http://localhost:7381}"

response=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${API_URL}/__test/force-next-error" \
  -H "Content-Type: application/json")

if [[ "${response}" != "200" ]]; then
  echo "FAILED: /__test/force-next-error returned HTTP ${response}" >&2
  echo "Make sure the API is up at ${API_URL} with ENABLE_TEST_FIXTURES=1." >&2
  exit 1
fi

echo "Armed: next API request will return 500."
