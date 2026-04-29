#!/usr/bin/env bash
# scripts/gates/run-gate-a.sh
#
# Aggregator for Gate A — Cross-source-of-truth.
# Runs every a-cross-source-*.sh fragment. Any fragment failure fails the gate.
#
# Per Phase 14 Part 4 §"Gate A — Cross-source-of-truth".

set -euo pipefail
echo "=== Gate A: Cross-source-of-truth ==="
fail=0
for script in scripts/gates/a-cross-source-*.sh; do
  [ -f "$script" ] || continue
  if ! bash "$script"; then fail=1; fi
done
if [ "$fail" -eq 1 ]; then
  echo "Gate A FAILED — cross-source drift detected"
  exit 1
fi
echo "Gate A PASSED"
