#!/usr/bin/env bash
# Bug UX-018 supersedes Bug 1324. Brand primary #003D9B and action blue
# #0052CC are canonical; the older teal/cyan and legacy blue values are
# forbidden in active application source.
#
# Exclusions:
#   - design-tokens/ build output (regenerated from source).
#   - dependency, coverage, and generated application build directories. The
#     gate checks authored source; stale local bundles are rebuilt separately.
#   - immutable historical migrations. Migration 146 supersedes their branding
#     rows, and the migration chain must remain reproducible rather than edited.
#   - Test files (*.test.ts*, __tests__/) — gates that verify absence of a
#     pattern legitimately reference that pattern in their assertions
#     (e.g., expect(file).not.toMatch(/#0066FF/i)).

set -euo pipefail
brand_gate_repo=${BRAND_GATE_REPO:-.}

# Search tracked authored source only. `git grep` is both fast and part of the
# runner prerequisite, unlike a PATH-resolved binary that may be inaccessible
# in a Windows Git Bash session. Tests and generated token output are excluded
# because they intentionally quote forbidden values to verify the gate.
set +e
hits=$(git -C "$brand_gate_repo" grep --line-number --ignore-case --extended-regexp \
  '#?(0066ff|0f62fe|1b3a4b|00b4d8)' -- \
  'apps' 'packages' \
  ':(exclude)**/__tests__/**' \
  ':(exclude)**/*.test.ts' \
  ':(exclude)**/*.test.tsx' \
  ':(exclude)**/dist/**' \
  ':(exclude)**/coverage/**' \
  ':(exclude)**/.expo/**' \
  ':(exclude)**/web-build/**' \
  ':(exclude)packages/api/migrations/**' \
  ':(exclude)**/design-tokens/**')
search_status=$?
set -e

if [ "$search_status" -gt 1 ]; then
  echo "GATE A ERROR: brand color source scan did not complete"
  exit 1
fi

if [ -n "$hits" ]; then
  echo "GATE A VIOLATION (Bug UX-018): a superseded brand color was found"
  echo "$hits"
  exit 1
fi

echo "Gate A — brand color single source: OK"
