#!/usr/bin/env bash
# Gate B — Bug-deferral / completeness.
#
# Every dispatch closeout claims a list of bugs fixed. Gate B verifies each claim:
#   1. The cited file:line is in the dispatch's diff.
#   2. A test in the dispatch's diff references the bug number explicitly.
#
# Per Phase 14 Part 4 §"Gate B — Bug-deferral / completeness".

set -euo pipefail

DISPATCH=${1:?"Usage: b-bug-deferral.sh <dispatch_number, e.g. 04>"}
BASE_REF=${BASE_REF:-origin/master}
CLOSEOUT=".ai-coder/dispatches/D${DISPATCH}-closeout.md"

if [ ! -f "$CLOSEOUT" ]; then
  echo "Gate B: closeout file missing: $CLOSEOUT"
  exit 1
fi

# Parse: lines matching "Bug NNNN" in closeout
BUGS=$(grep -oE "Bug [0-9]+" "$CLOSEOUT" | sort -u)

if [ -z "$BUGS" ]; then
  echo "Gate B: no bugs claimed fixed in closeout"
  exit 1
fi

CHANGED_FILES=$(git diff --name-only "$BASE_REF"..HEAD)
CHANGED_TEST_DIFF=$(git diff "$BASE_REF"..HEAD -- '**/*.test.ts' '**/*.test.tsx')

fail=0
while IFS= read -r bug; do
  bug_num=$(echo "$bug" | grep -oE "[0-9]+")

  # Check 1: cited files in diff
  cited_files=$(grep -A 5 "$bug —\|$bug -" "$CLOSEOUT" \
    | grep -oE "[a-zA-Z_/]+\.(ts|tsx|sql|sh|yml|json)" \
    | sort -u)

  files_missing=0
  for f in $cited_files; do
    if ! echo "$CHANGED_FILES" | grep -q "^$f$"; then
      files_missing=1
    fi
  done
  if [ "$files_missing" -eq 1 ] && [ -n "$cited_files" ]; then
    echo "Gate B FAIL: $bug claims fix in files not in dispatch diff: $cited_files"
    fail=1
  fi

  # Check 2: test in diff references bug number
  if ! echo "$CHANGED_TEST_DIFF" | grep -qE "Bug $bug_num"; then
    echo "Gate B FAIL: $bug has no test referencing 'Bug $bug_num' in changed test files"
    fail=1
  fi
done <<< "$BUGS"

if [ "$fail" -eq 1 ]; then
  echo "Gate B FAILED"
  exit 1
fi

bug_count=$(echo "$BUGS" | wc -l | tr -d ' ')
echo "Gate B PASSED — all $bug_count bugs have file diffs and tests"
