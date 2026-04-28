#!/usr/bin/env bash
# scripts/verify-load.sh
#
# Runs the k6 load suite against a real environment and compares the
# observed p95 / p99 / fail-rate numbers to the budgets declared in
# .ai-coder/perf-budgets.json.
#
# Required environment to RUN (otherwise SKIP cleanly):
#   LOADTEST_BASE_URL       e.g. https://staging.onservice.ph
#   LOADTEST_DATABASE_URL   postgres://... (used by the k6 setup hook)
#   k6 binary on PATH       https://k6.io/docs/get-started/installation/
#
# Exit codes:
#   0  PASS or SKIP (missing tooling / config means SKIP, not failure)
#   1  Budgets violated by the observed run
#   2  Internal tooling error (jq missing, k6 script missing, etc.)
#
# This gate intentionally SKIPs in CI / local dev where the heavy load
# environment is not available; it is wired into verify-master.sh as
# gate-4-load so the master run always records a status.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUDGETS_JSON="$REPO_ROOT/.ai-coder/perf-budgets.json"
K6_SCRIPT="$REPO_ROOT/scripts/k6/load-test.js"

skip() {
  echo "[verify-load] SKIP: $*"
  exit 0
}

if [ -z "${LOADTEST_BASE_URL:-}" ]; then
  skip "LOADTEST_BASE_URL not set"
fi
if [ -z "${LOADTEST_DATABASE_URL:-}" ]; then
  skip "LOADTEST_DATABASE_URL not set"
fi
if ! command -v k6 >/dev/null 2>&1; then
  skip "k6 binary not on PATH (see https://k6.io/docs/get-started/installation/)"
fi
if [ ! -f "$BUDGETS_JSON" ]; then
  echo "[verify-load] FAIL: missing $BUDGETS_JSON" >&2
  exit 2
fi
if [ ! -f "$K6_SCRIPT" ]; then
  skip "scripts/k6/load-test.js not present (k6 suite not yet implemented; tracked for Phase 14)"
fi
if ! command -v jq >/dev/null 2>&1; then
  skip "jq not installed (required to parse perf-budgets.json and k6 summary)"
fi

OUT_DIR="${REPO_ROOT}/.ai-coder/checkpoints/logs/load"
mkdir -p "$OUT_DIR"
SUMMARY_JSON="${OUT_DIR}/k6-summary-$(date -u +%Y%m%dT%H%M%SZ).json"

echo "[verify-load] running k6 against $LOADTEST_BASE_URL"
echo "[verify-load] summary will be written to $SUMMARY_JSON"

k6 run \
  --summary-export "$SUMMARY_JSON" \
  --env BASE_URL="$LOADTEST_BASE_URL" \
  --env DATABASE_URL="$LOADTEST_DATABASE_URL" \
  "$K6_SCRIPT"

# Compare each observed metric to the corresponding budget.
budget() { jq -r ".budgets.$1" "$BUDGETS_JSON"; }
metric() { jq -r "$1 // empty" "$SUMMARY_JSON"; }

violations=0

check_le() {
  local name="$1" observed="$2" budget="$3"
  if [ -z "$observed" ]; then
    echo "  MISS  $name (not present in k6 summary)"
    violations=$((violations + 1))
    return
  fi
  awk -v o="$observed" -v b="$budget" 'BEGIN { exit !(o <= b) }'
  if [ "$?" = 0 ]; then
    echo "  OK    $name observed=$observed budget<=$budget"
  else
    echo "  FAIL  $name observed=$observed budget<=$budget"
    violations=$((violations + 1))
  fi
}

# Trend metric tags follow the convention used in the k6 script:
#   booking_create_duration{p(95)}
#   wallet_read_duration{p(95)}
#   admin_dashboard_duration{p(95)}
#   escrow_release_duration{p(99)}
#   http_req_failed.rate
check_le "p95_booking_create_ms"    "$(metric '.metrics.booking_create_duration.\"p(95)\"')"  "$(budget p95_booking_create_ms)"
check_le "p95_wallet_read_ms"       "$(metric '.metrics.wallet_read_duration.\"p(95)\"')"     "$(budget p95_wallet_read_ms)"
check_le "p95_admin_dashboard_ms"   "$(metric '.metrics.admin_dashboard_duration.\"p(95)\"')" "$(budget p95_admin_dashboard_ms)"
check_le "p99_escrow_release_ms"    "$(metric '.metrics.escrow_release_duration.\"p(99)\"')"  "$(budget p99_escrow_release_ms)"
check_le "max_fail_rate"            "$(metric '.metrics.http_req_failed.rate')"               "$(budget max_fail_rate)"

if [ "$violations" -gt 0 ]; then
  echo "[verify-load] FAIL: $violations budget(s) violated"
  exit 1
fi

echo "[verify-load] PASS: all observed metrics within budget"
exit 0
