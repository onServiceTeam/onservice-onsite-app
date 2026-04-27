#!/bin/bash
# verify-phase.sh
#
# Phase-aware verification entry point.
#
# - PHASE-00 (bootstrap): runs the lighter bootstrap gate (preflight + scripts/
#   templates/tokens present + baseline captured). Does NOT run verify-master.sh
#   because Phase 00's job is to install the verification machinery, not to
#   exercise it against pre-existing baseline debt. Per
#   .ai-coder/phases/PHASE-00-bootstrap.md Step 7 and
#   AUTONOMOUS-EXECUTION-PROTOCOL.md "auto-proceed gate criteria".
# - PHASE-01..PHASE-12: delegates to verify-master.sh (full 6-gate gauntlet).
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

if [ "$PHASE" = "PHASE-00" ]; then
  exec bash "$SCRIPT_DIR/verify-bootstrap.sh" "$PHASE"
fi

exec bash "$SCRIPT_DIR/verify-master.sh" "$PHASE"
