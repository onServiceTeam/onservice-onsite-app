#!/usr/bin/env bash
# D-J27 / F#3 fix — empty a named scope so the next read renders the
# empty state. Used by Maestro flows to capture each screen's empty
# state.
#
# Usage:
#   scripts/maestro/seed-empty.sh bookings
#   scripts/maestro/seed-empty.sh notifications
#   scripts/maestro/seed-empty.sh wallet
#   scripts/maestro/seed-empty.sh messages
#
# Requires: local Docker stack up with the API running on $API_URL
# (default http://localhost:7381) AND the API booted with
# ENABLE_TEST_FIXTURES=1 + NODE_ENV != production.

set -euo pipefail

API_URL="${API_URL:-http://localhost:7381}"
SCOPE="${1:-}"

if [[ -z "${SCOPE}" ]]; then
  echo "Usage: $0 <scope>" >&2
  echo "Allowed scopes: bookings, notifications, wallet, messages" >&2
  exit 2
fi

response=$(curl -s -o /tmp/seed-empty-response.json -w "%{http_code}" \
  -X POST "${API_URL}/__test/seed/empty" \
  -H "Content-Type: application/json" \
  -d "{\"scope\":\"${SCOPE}\"}")

if [[ "${response}" != "200" ]]; then
  echo "FAILED: /__test/seed/empty (scope=${SCOPE}) returned HTTP ${response}" >&2
  cat /tmp/seed-empty-response.json >&2
  echo "" >&2
  echo "Make sure the API is up at ${API_URL} with ENABLE_TEST_FIXTURES=1." >&2
  exit 1
fi

echo "Emptied scope: ${SCOPE}"
