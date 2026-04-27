#!/bin/bash
# verify-no-phantom-tests.sh
#
# Detects test patterns that indicate "phantom" tests — tests that pass
# without exercising real behavior. These are worse than no tests because
# they create false confidence.
#
# Patterns detected:
#  - Tests with no expect() / assert calls
#  - Tests with only expect(true).toBe(true) or similar trivialities
#  - Tests with .skip or xit (silently disabled)
#  - Tests with .only (silently skipping all OTHER tests)
#  - Tests that catch any error and pass (try/catch swallowing)
#  - Tests with hardcoded sleeps > 1 second (flaky)
#  - Tests that mock the function under test (testing the mock, not the code)

set -e

EXIT_CODE=0
TEST_DIRS="packages/api/__tests__ packages/api/src apps/admin/src apps/mobile"

check() {
  local pattern="$1"
  local description="$2"
  local result
  result=$(grep -rnE "$pattern" $TEST_DIRS 2>/dev/null | grep -E "\.(test|spec)\.(ts|tsx|js|jsx)" || true)
  if [ -n "$result" ]; then
    echo ""
    echo "PHANTOM PATTERN DETECTED: $description"
    echo "$result"
    EXIT_CODE=1
  fi
}

# Disabled tests (silent skip)
check "(it|test|describe)\.skip\(" "test.skip — silently disabled"
check "^\s*(xit|xdescribe)\(" "xit/xdescribe — silently disabled"

# Focused tests (silently skips all others)
check "(it|test|describe)\.only\(" "test.only — would silently skip all other tests in suite"
check "^\s*(fit|fdescribe)\(" "fit/fdescribe — focused test would skip others"

# Trivial assertions
check "expect\(true\)\.toBe\(true\)" "trivially-passing assertion"
check "expect\(1\)\.toBe\(1\)" "trivially-passing assertion"
check "expect\(\)\.toBeDefined\(\)" "empty expect"

# Hardcoded sleeps
check "setTimeout.*[0-9]{4,}" "long setTimeout in test (use deterministic waits)"
check "sleep\([0-9]{4,}\)" "long sleep in test"

# Catch-all swallowing
check "catch.*\{\s*\}" "empty catch block in test (swallowing failures)"
check "catch.*\{\s*//.*\s*\}" "comment-only catch block"

# Tests that mock the system under test
# (heuristic — if a test file mocks the same module it's named after, suspicious)
for testfile in $(find $TEST_DIRS -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null); do
  service_name=$(basename "$testfile" | sed 's/\.\(test\|spec\)\.ts$//')
  if grep -qE "jest\.mock\(['\"].*${service_name}['\"]" "$testfile" 2>/dev/null; then
    echo ""
    echo "PHANTOM PATTERN: $testfile mocks the module under test (${service_name})"
    EXIT_CODE=1
  fi
done

# Tests with no expect/assert at all
for testfile in $(find $TEST_DIRS -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null); do
  if ! grep -qE "(expect\(|assert\(|assert\.|should\.)" "$testfile" 2>/dev/null; then
    echo ""
    echo "PHANTOM PATTERN: $testfile has no expect/assert calls"
    EXIT_CODE=1
  fi
done

if [ $EXIT_CODE -eq 0 ]; then
  echo "PASS: No phantom test patterns detected."
else
  echo ""
  echo "FAIL: Phantom test patterns found. These tests do not catch real bugs."
  echo "Either fix them to test real behavior, or delete them."
fi

exit $EXIT_CODE
