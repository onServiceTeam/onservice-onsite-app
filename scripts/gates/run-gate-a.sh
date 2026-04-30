#!/usr/bin/env bash
# scripts/gates/run-gate-a.sh
#
# Aggregator for Gate A — Cross-source-of-truth.
#
# Runs every a-cross-source-*.sh fragment. Each fragment's mode is looked up
# in scripts/gates/MODES.json (via get-mode.py):
#   - BLOCKING: fragment failure fails the gate (CI red, PR cannot merge).
#   - REPORT:   fragment failure is logged but does not fail the gate.
#               Used for fragments owned by a not-yet-landed dispatch.
#
# Mode promotion: a fragment moves from REPORT to BLOCKING when its owning
# dispatch lands. Update MODES.json + EXPECTED-FAILURES.md in the same PR.
#
# Per Phase 14 Part 4 §"Gate A — Cross-source-of-truth" and Dispatch 03
# tiered-enforcement design.

set -euo pipefail

GATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GET_MODE="bash ${GATES_DIR}/mode-lookup.sh"

echo "=== Gate A: Cross-source-of-truth ==="

blocking_failed=0
report_failed=0
fragments_run=0

for script in "$GATES_DIR"/a-cross-source-*.sh; do
  [ -f "$script" ] || continue
  fragments_run=$((fragments_run + 1))

  # Fragment key = filename without .sh extension
  fragment_key=$(basename "$script" .sh)
  mode=$($GET_MODE gate_a_fragments "$fragment_key" 2>/dev/null || echo "BLOCKING")

  echo ""
  echo "--- $fragment_key [$mode] ---"

  if bash "$script"; then
    : # passed
  else
    if [ "$mode" = "BLOCKING" ]; then
      echo "  ↑ BLOCKING fragment failed — Gate A will fail."
      blocking_failed=$((blocking_failed + 1))
    else
      echo "  ↑ REPORT fragment failed — logged, not blocking. Owning dispatch will promote to BLOCKING when it lands."
      report_failed=$((report_failed + 1))
    fi
  fi
done

echo ""
echo "=== Gate A summary ==="
echo "Fragments run:    $fragments_run"
echo "BLOCKING failed:  $blocking_failed"
echo "REPORT failed:    $report_failed"

if [ "$blocking_failed" -gt 0 ]; then
  echo ""
  echo "Gate A FAILED — $blocking_failed BLOCKING fragment(s) failed."
  exit 1
fi

echo ""
echo "Gate A PASSED — all BLOCKING fragments green ($report_failed REPORT fragment(s) still failing, expected)."
