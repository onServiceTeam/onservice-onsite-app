#!/bin/bash
# verify-money-conservation.sh
#
# Runs the sacred money tests. These verify money in == money out for every flow.
# Test file paths verified against the actual repo at commit 322330a.

set -e

LOG_DIR=".ai-coder/checkpoints/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/money-conservation-$(date +%Y%m%d-%H%M%S).log"

# Real existing tests (verified to exist):
SACRED_TESTS=(
  "packages/api/__tests__/escrow-money-conservation.test.ts"
  "packages/api/__tests__/commission.test.ts"
  "packages/api/__tests__/dispute-refund-processing.test.ts"
  "packages/api/__tests__/wallet-type-isolation.test.ts"
  "packages/api/__tests__/booking-state-machine.test.ts"
  "packages/api/__tests__/booking-price-lookup.test.ts"
)

EXIT_CODE=0

{
  echo "=== Money Conservation Tests ==="
  echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  for test in "${SACRED_TESTS[@]}"; do
    if [ ! -f "$test" ]; then
      echo "WARN: Sacred test missing: $test"
      echo "      If you've moved or renamed it, update SACRED_TESTS in this script."
      EXIT_CODE=1
      continue
    fi
    echo "--- Running: $test ---"
    if npx jest --config packages/api/jest.config.cjs "$test" --passWithNoTests 2>&1; then
      echo "PASS: $test"
    else
      echo "FAIL: $test"
      EXIT_CODE=1
    fi
    echo ""
  done

  # Discover any *.money.test.ts files added by later phases
  MONEY_TESTS=$(find packages/api -name "*.money.test.ts" 2>/dev/null || true)
  if [ -n "$MONEY_TESTS" ]; then
    for test in $MONEY_TESTS; do
      echo "--- Running discovered money test: $test ---"
      npx jest --config packages/api/jest.config.cjs "$test" --passWithNoTests 2>&1 || EXIT_CODE=1
    done
  fi

  if [ $EXIT_CODE -eq 0 ]; then
    echo "PASS: All money tests passed."
  else
    echo "FAIL: Money tests failed. SHIP BLOCKER."
  fi
} | tee "$LOG"

exit $EXIT_CODE
