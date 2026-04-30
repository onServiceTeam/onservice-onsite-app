#!/usr/bin/env bash
# Gate B — Bug-deferral / completeness.
#
# Every dispatch closeout claims a list of bugs fixed. Gate B verifies each claim:
#   1. The cited file:line is in the dispatch's diff.
#   2. A test in the dispatch's diff references the bug number explicitly.
#
# No-bugs dispatches (introduced in Dispatch 03):
# Some dispatches are meta-only (gate hardening, infra) and fix zero source-code
# bugs. To pass Gate B, such a closeout MUST contain the literal HTML-comment
# marker on its own line:
#
#   <!-- gate-b: no-bugs-this-dispatch -->
#
# Without that marker, an empty bug list fails Gate B (preventing fake-green
# where someone "forgot" to claim bugs). The marker is intentional and
# machine-checkable; it cannot be added accidentally.
#
# Per Phase 14 Part 4 §"Gate B — Bug-deferral / completeness" and Dispatch 03
# meta-only-dispatch design.

set -euo pipefail

DISPATCH=${1:?"Usage: b-bug-deferral.sh <dispatch_number, e.g. 04>"}
BASE_REF=${BASE_REF:-origin/master}
CLOSEOUT=".ai-coder/dispatches/D${DISPATCH}-closeout.md"

if [ ! -f "$CLOSEOUT" ]; then
  echo "Gate B: closeout file missing: $CLOSEOUT"
  exit 1
fi

# Parse: lines matching "Bug NNNN" in closeout
BUGS=$(grep -oE "Bug [0-9]+" "$CLOSEOUT" | sort -u || true)

# No-bugs dispatch detection: explicit marker required
NO_BUGS_MARKER='<!-- gate-b: no-bugs-this-dispatch -->'
if [ -z "$BUGS" ]; then
  if grep -qF "$NO_BUGS_MARKER" "$CLOSEOUT"; then
    echo "Gate B: closeout declares no-bugs dispatch (marker present); accepting."
    echo "Gate B PASSED — meta-only dispatch."
    exit 0
  fi
  echo "Gate B: no bugs claimed fixed in closeout AND no '$NO_BUGS_MARKER' marker."
  echo "If this is a meta-only dispatch, add the marker as an HTML comment in the closeout."
  exit 1
fi

# Reject the marker if bugs are also claimed (logical inconsistency)
if grep -qF "$NO_BUGS_MARKER" "$CLOSEOUT"; then
  echo "Gate B: closeout has BOTH the no-bugs marker AND Bug NNNN references; ambiguous."
  echo "Either remove the marker or remove the bug claims."
  exit 1
fi

CHANGED_FILES=$(git diff --name-only "$BASE_REF"..HEAD)
CHANGED_TEST_DIFF=$(git diff "$BASE_REF"..HEAD -- '**/*.test.ts' '**/*.test.tsx' || true)

fail=0
while IFS= read -r bug; do
  bug_num=$(echo "$bug" | grep -oE "[0-9]+")

  # Check 1: cited files in diff
  # Filename char class includes letters, digits, underscores, slashes, dots,
  # parens, brackets, and hyphens. Brackets and parens are common in expo-
  # router paths (apps/mobile/app/(tabs)/profile.tsx, provider/[id].tsx).
  # Hyphens are common in real filenames (payment-methods.tsx,
  # safety-and-support.tsx). Without these the regex truncates filenames
  # at the first hyphen/bracket, causing Gate B to compare partial paths
  # to the diff and false-fail. D04 amendment per
  # .ai-coder/governance/GATE-AMENDMENTS.md (false positive class).
  cited_files=$(grep -A 5 "$bug —\|$bug -" "$CLOSEOUT" \
    | grep -oE '[a-zA-Z0-9_./()\[\]-]+\.(ts|tsx|sql|sh|yml|json)' \
    | sort -u || true)

  files_missing=0
  for f in $cited_files; do
    # Use here-string instead of `echo "$CHANGED_FILES" | grep ...` to avoid
    # SIGPIPE false positives under `set -euo pipefail` when CHANGED_FILES is
    # large and grep -q exits early (Phase 14 D05 gate amendment, see
    # .ai-coder/exceptions/2026-04-30-gate-b-pipefail-sigpipe.md).
    if ! grep -q "^$f$" <<< "$CHANGED_FILES"; then
      files_missing=1
    fi
  done
  if [ "$files_missing" -eq 1 ] && [ -n "$cited_files" ]; then
    echo "Gate B FAIL: $bug claims fix in files not in dispatch diff: $cited_files"
    fail=1
  fi

  # Check 2: test in diff references bug number
  # Here-string instead of pipe — same SIGPIPE rationale as above. CI logs
  # showed `echo: write error: Broken pipe` immediately before each
  # false-positive FAIL line on D05 (CHANGED_TEST_DIFF was 67KB, larger than
  # the kernel pipe buffer).
  if ! grep -qE "Bug $bug_num" <<< "$CHANGED_TEST_DIFF"; then
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
