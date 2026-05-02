#!/usr/bin/env bash
# D-J27 / F#3 fix — repopulate a named scope with happy-path fixtures
# so the next read renders the success state. Used by Maestro flows to
# capture each screen's success state.
#
# Usage:
#   scripts/maestro/seed-success.sh bookings
#   scripts/maestro/seed-success.sh notifications
#
# Requires: local Docker stack up with the API running on $API_URL
# (default http://localhost:7381) AND the API booted with
# ENABLE_TEST_FIXTURES=1 + NODE_ENV != production.

set -euo pipefail

API_URL="${API_URL:-http://localhost:7381}"
SCOPE="${1:-}"

if [[ -z "${SCOPE}" ]]; then
  echo "Usage: $0 <scope>" >&2
  echo "Allowed scopes: bookings, notifications" >&2
  exit 2
fi

response=$(curl -s -o /tmp/seed-success-response.json -w "%{http_code}" \
  -X POST "${API_URL}/__test/seed/success" \
  -H "Content-Type: application/json" \
  -d "{\"scope\":\"${SCOPE}\"}")

if [[ "${response}" != "200" ]]; then
  echo "FAILED: /__test/seed/success (scope=${SCOPE}) returned HTTP ${response}" >&2
  cat /tmp/seed-success-response.json >&2
  echo "" >&2
  echo "Make sure the API is up at ${API_URL} with ENABLE_TEST_FIXTURES=1." >&2
  exit 1
fi

echo "Seeded success state for scope: ${SCOPE}"
