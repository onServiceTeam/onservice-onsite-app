#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 2 verification: BIR OR series allocation.
#
# Verifies the BIR_OR_SERIES_* env vars are set in the active shell. To run
# against production, source the production env file first:
#   set -a; source .env.production; set +a; bash scripts/verify-bir-or-series.sh

set -euo pipefail

fail=0

for var in BIR_OR_SERIES_PREFIX BIR_OR_SERIES_START BIR_OR_SERIES_END; do
  if [ -z "${!var:-}" ]; then
    echo "FAIL: $var missing"
    fail=1
  fi
done

if [ "$fail" -eq 1 ]; then
  echo
  echo "Set these in .env.production after BIR ATP is allocated. See"
  echo "docs/runbooks/launch-cutover.md Item 2."
  exit 1
fi

echo "OK: BIR OR series configured"
echo "  Prefix: $BIR_OR_SERIES_PREFIX"
echo "  Range:  $BIR_OR_SERIES_START .. $BIR_OR_SERIES_END"

# Optional: hit the next-or-number endpoint when API is up
if [ -n "${API_BASE_URL:-}" ]; then
  if NEXT=$(curl -fsS "$API_BASE_URL/internal/bir/next-or-number" 2>/dev/null); then
    echo "  Next OR to issue: $NEXT"
  fi
fi
