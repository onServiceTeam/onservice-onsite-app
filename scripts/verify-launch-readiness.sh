#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Umbrella launch-readiness check.
#
# Runs every Item verifier in turn. Exit 0 only if every required Item
# (1, 2, 5, 6, 7, 8, 9, 10, 12) returns 0. Item 11 (Admin SSO) is
# optional and reported as INFO.
#
# Usage:
#   set -a; source .env.production; set +a
#   bash scripts/verify-launch-readiness.sh

set -uo pipefail   # NOT -e — we want to run every check even if some fail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

declare -A REQUIRED=(
  [1]="verify-dpo-registered.sh"
  [2]="verify-bir-or-series.sh"
  [5]="verify-turnstile.sh"
  [6]="verify-sentry.sh"
  [7]="verify-paymongo.sh"
  [8]="verify-s3-bir.sh"
  [9]="verify-postgres-pitr.sh"
  [10]="verify-tls.sh"
  [12]="verify-bir-pipeline.sh"
)

PASSED=0
FAILED=0
FAILED_ITEMS=()

for ITEM in 1 2 5 6 7 8 9 10 12; do
  SCRIPT="scripts/${REQUIRED[$ITEM]}"
  echo "═══ Item $ITEM — ${REQUIRED[$ITEM]} ═══"
  if [ ! -x "$SCRIPT" ] && [ ! -f "$SCRIPT" ]; then
    echo "FAIL: $SCRIPT missing or not executable"
    FAILED=$((FAILED + 1))
    FAILED_ITEMS+=("$ITEM")
    continue
  fi
  if bash "$SCRIPT"; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
    FAILED_ITEMS+=("$ITEM")
  fi
  echo
done

echo "═══ Summary ═══"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
if [ "$FAILED" -gt 0 ]; then
  echo "  Failed items: ${FAILED_ITEMS[*]}"
  echo
  echo "Launch is BLOCKED until all required items pass."
  echo "Items 3, 4 (DTI + Mayor's permit) are manual; check sign-offs in"
  echo "docs/runbooks/launch-cutover.md."
  exit 1
fi

echo
echo "OK: every required automated verification passed."
echo "Manual sign-offs still required for Items 3 (DTI), 4 (Mayor's permit),"
echo "and the visual/E2E smoke sweep. Confirm in launch-cutover.md."
echo
echo "When all sign-offs land, apply the launch tag:"
echo "  git tag -a v1.0.0-launch-ready -m \"Phase 14 complete\""
echo "  git push origin v1.0.0-launch-ready"
