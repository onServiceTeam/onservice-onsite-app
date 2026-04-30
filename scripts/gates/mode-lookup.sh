#!/usr/bin/env bash
# scripts/gates/mode-lookup.sh
#
# Cross-platform wrapper around get-mode.py. Tries python3, python, py
# in that order. Designed for Linux CI (python3) AND Windows local dev
# (where python3 is a Microsoft Store launcher stub that errors).
#
# Usage:
#   bash scripts/gates/mode-lookup.sh gate_a_fragments a-cross-source-routes
#   # → prints "BLOCKING" or "REPORT"
#
# Exits 0 always. If no interpreter works, prints "BLOCKING" (fail-closed).

set -euo pipefail

GATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GET_MODE_PY="${GATES_DIR}/get-mode.py"

# Try interpreters in order. Verify each actually runs (Windows has a python3
# stub that exits with the Microsoft Store error message instead of running).
for interpreter in python3 python py; do
  if command -v "$interpreter" >/dev/null 2>&1; then
    if "$interpreter" --version >/dev/null 2>&1; then
      exec "$interpreter" "$GET_MODE_PY" "$@"
    fi
  fi
done

# No working Python found. Fail-closed.
echo "BLOCKING"
