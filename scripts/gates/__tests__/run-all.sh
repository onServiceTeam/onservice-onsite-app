#!/usr/bin/env bash
# Run every gate smoke test. Exit 0 if all pass, non-zero if any fails.
#
# CI invokes this as part of the gate-c job (or a dedicated gate-smoke-tests
# job). Local invocation is `bash scripts/gates/__tests__/run-all.sh`.

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pass=0
fail=0
failed_tests=()

echo "=== Gate smoke tests ==="
for test_script in "$TESTS_DIR"/*.test.sh; do
  [ -f "$test_script" ] || continue
  name=$(basename "$test_script")
  echo ""
  echo "--- $name ---"
  if bash "$test_script"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    failed_tests+=("$name")
  fi
done

echo ""
echo "=== Smoke test summary ==="
echo "Passed: $pass"
echo "Failed: $fail"

if [ "$fail" -gt 0 ]; then
  echo ""
  echo "Failed tests:"
  for t in "${failed_tests[@]}"; do
    echo "  - $t"
  done
  exit 1
fi
echo "All gate smoke tests passed."
