#!/usr/bin/env bash
# Gate E — Mutation testing.
#
# Modifies production code (changes > to >=, removes negations, returns null,
# etc.) and runs the test suite. If tests still pass after the mutation, tests
# are insufficient.
#
# Per Phase 14 Part 4 §"Gate E — Mutation testing". Threshold: 99%.

set -euo pipefail

BASE_REF=${BASE_REF:-origin/master}

# Run on changed files only to keep CI fast
CHANGED_FILES=$(git diff --name-only "$BASE_REF"..HEAD -- '**/*.ts' '**/*.tsx' \
  | grep -v ".test." \
  | grep -v "/__tests__/" \
  | grep -v "scripts/" \
  | grep -v "design-tokens/build/" \
  || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "Gate E: no production files changed, skipping"
  exit 0
fi

echo "Running mutation testing on changed files:"
echo "$CHANGED_FILES" | head -20

if [ ! -d "packages/api/node_modules/@stryker-mutator" ]; then
  echo "Gate E: stryker not installed in packages/api/node_modules; run 'pnpm install' (per Dispatch 0 step 0.7.1)"
  exit 1
fi

pushd packages/api > /dev/null
pnpm exec stryker run --mutate "$CHANGED_FILES" --reporters json,clear-text
popd > /dev/null

# Parse stryker output
score=$(jq '.systemUnderTestMetrics.metrics.mutationScore' packages/api/reports/mutation/mutation.json 2>/dev/null || echo "0")
threshold=99.0

if (( $(echo "$score < $threshold" | bc -l) )); then
  echo "Gate E FAILED — mutation score $score below threshold $threshold"
  echo "View mutation report at: packages/api/reports/mutation/mutation.html"
  exit 1
fi
echo "Gate E PASSED — mutation score $score"
