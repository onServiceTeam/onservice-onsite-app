#!/bin/bash
# verify-no-phantom-tests.sh
#
# Detects test patterns that pass without exercising real behavior.
#
# MODES:
#   Legacy (no --phase):  fails on any phantom pattern.
#   Baseline-delta (--phase PHASE-NN):
#                         fails only on phantom patterns introduced this phase.
#                         See TD-001.

set -e

PHASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

TEST_DIRS="packages/api/__tests__ packages/api/src apps/admin/src apps/mobile/app apps/mobile/src apps/mobile/components apps/mobile/__tests__"
# Filter dirs to those that exist (apps/mobile/__tests__ may not exist on all checkouts).
filtered=""
for d in $TEST_DIRS; do [ -d "$d" ] && filtered="$filtered $d"; done
TEST_DIRS="$filtered"

# Excludes: node_modules and build outputs. Phase 01 added many large npm packages
# under apps/mobile/node_modules; without these excludes, grep -r walks them all
# and the gate hangs on minified bundles. (TD-004, fixed in Phase 01.)
EXCLUDE='--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude-dir=.expo'

VIOLATIONS_FILE=$(mktemp)
trap "rm -f $VIOLATIONS_FILE ${VIOLATIONS_FILE}.delta" EXIT

# Pattern collector: appends `file:line:content  [DESC: <description>]`.
collect() {
  local pattern="$1"
  local description="$2"
  grep -rnE $EXCLUDE "$pattern" $TEST_DIRS 2>/dev/null \
    | grep -E "\.(test|spec)\.(ts|tsx|js|jsx)" \
    | while IFS= read -r hit; do
        printf '%s\n' "${hit}  [DESC: ${description}]"
      done >> "$VIOLATIONS_FILE" || true
}

# Disabled tests
collect "(it|test|describe)\.skip\(" "test.skip — silently disabled"
collect "^\s*(xit|xdescribe)\(" "xit/xdescribe — silently disabled"

# Focused tests
collect "(it|test|describe)\.only\(" "test.only — would skip all other tests in suite"
collect "^\s*(fit|fdescribe)\(" "fit/fdescribe — focused test would skip others"

# Trivial assertions
collect "expect\(true\)\.toBe\(true\)" "trivially-passing assertion"
collect "expect\(1\)\.toBe\(1\)" "trivially-passing assertion"
collect "expect\(\)\.toBeDefined\(\)" "empty expect"

# Hardcoded sleeps
collect "setTimeout.*[0-9]{4,}" "long setTimeout in test"
collect "sleep\([0-9]{4,}\)" "long sleep in test"

# Catch-all swallowing
collect "catch.*\{\s*\}" "empty catch block in test"
collect "catch.*\{\s*//.*\s*\}" "comment-only catch block"

# Tests that mock the module under test (file-level violation reported as line 0)
# Find excludes node_modules and other build artifacts (TD-004).
TEST_FILES=$(find $TEST_DIRS \( -path '*/node_modules' -o -path '*/dist' -o -path '*/build' -o -path '*/.expo' -o -path '*/coverage' \) -prune -o \( -name "*.test.ts" -o -name "*.spec.ts" \) -print 2>/dev/null)
for testfile in $TEST_FILES; do
  service_name=$(basename "$testfile" | sed 's/\.\(test\|spec\)\.ts$//')
  if grep -qE "jest\.mock\(['\"].*${service_name}['\"]" "$testfile" 2>/dev/null; then
    printf '%s\n' "${testfile}:0:  [DESC: mocks the module under test (${service_name})]" >> "$VIOLATIONS_FILE"
  fi
done

# Tests with no expect/assert at all
for testfile in $TEST_FILES; do
  if ! grep -qE "(expect\(|assert\(|assert\.|should\.)" "$testfile" 2>/dev/null; then
    printf '%s\n' "${testfile}:0:  [DESC: no expect/assert calls]" >> "$VIOLATIONS_FILE"
  fi
done

sort -u -o "$VIOLATIONS_FILE" "$VIOLATIONS_FILE"
ABSOLUTE_COUNT=$(wc -l < "$VIOLATIONS_FILE" | tr -d ' ')

if [ -n "$PHASE" ]; then
  source "$(dirname "$0")/lib/baseline-diff.sh"
  filter_to_phase_diff "$PHASE" < "$VIOLATIONS_FILE" > "${VIOLATIONS_FILE}.delta" || true
  DELTA_COUNT=$(wc -l < "${VIOLATIONS_FILE}.delta" | tr -d ' ')

  report_baseline_delta "gate-1-phantom-tests" "$ABSOLUTE_COUNT" "$DELTA_COUNT" "$VIOLATIONS_FILE"

  if [ "$DELTA_COUNT" -gt 0 ]; then
    echo ""
    echo "FAIL: ${PHASE} introduced ${DELTA_COUNT} new phantom-test pattern(s):"
    cat "${VIOLATIONS_FILE}.delta"
    exit 1
  fi

  echo "GATE: PASS (no new violations introduced by ${PHASE})"
  exit 0
fi

if [ "$ABSOLUTE_COUNT" -gt 0 ]; then
  echo "PHANTOM TEST PATTERNS DETECTED (${ABSOLUTE_COUNT}):"
  head -n 50 "$VIOLATIONS_FILE"
  if [ "$ABSOLUTE_COUNT" -gt 50 ]; then
    echo "... and $((ABSOLUTE_COUNT - 50)) more"
  fi
  echo ""
  echo "FAIL: Phantom test patterns found. Either fix them to test real behavior, or delete them."
  exit 1
fi

echo "PASS: No phantom test patterns detected."
exit 0
