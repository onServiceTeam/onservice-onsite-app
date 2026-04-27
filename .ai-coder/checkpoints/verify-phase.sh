#!/bin/bash
# verify-phase.sh
#
# Thin wrapper around verify-master.sh.
#
# Prior to TD-001, this script special-cased PHASE-00 to run a lighter
# bootstrap-only gate because verify-master.sh's surface scans were not
# baseline-delta-aware and would fail on pre-existing repository debt.
#
# After TD-001, every gate that surface-scans the repo (forbidden patterns,
# emoji-as-icon, phantom tests, N+1) accepts a --phase flag and fails only on
# violations introduced by that phase. So the special case is gone — Phase 00
# and every later phase use the same orchestrator.
#
# verify-bootstrap.sh remains in the tree as a focused PHASE-00 preflight
# (scripts/templates/tokens/baseline-capture present) and may be invoked
# explicitly by the Phase 00 plan, but verify-phase.sh PHASE-00 now runs the
# full verify-master.sh chain like any other phase.
#
# Usage: bash .ai-coder/checkpoints/verify-phase.sh PHASE-NN

set -e

PHASE="${1:-}"
if [ -z "$PHASE" ]; then
  echo "Usage: $0 PHASE-NN"
  echo ""
  echo "Available phases:"
  ls .ai-coder/phases/ 2>/dev/null | sed 's/\.md$//' | sed 's/^/  /'
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/verify-master.sh" "$PHASE"
