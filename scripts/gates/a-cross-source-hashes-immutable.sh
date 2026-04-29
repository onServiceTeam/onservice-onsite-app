#!/usr/bin/env bash
# Phase 13 reconciliation artifact preservation.
# HASHES-CORRECTED.sha256 files are historical records and never modified going forward.

set -euo pipefail

# Defaults to comparing against origin/master if BASE_REF unset
BASE_REF=${BASE_REF:-origin/master}

modified=$(git diff --name-only "$BASE_REF"..HEAD -- '.ai-coder/phase-*/HASHES-CORRECTED.sha256' 2>/dev/null || true)
if [ -n "$modified" ]; then
  echo "GATE A VIOLATION: HASHES-CORRECTED files are immutable historical records"
  echo "$modified"
  exit 1
fi
echo "Gate A — historical hashes immutable: OK"
