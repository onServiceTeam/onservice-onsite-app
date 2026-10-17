#!/usr/bin/env bash
# Gate E — Mutation testing.
#
# Modifies production code (changes > to >=, removes negations, returns null,
# etc.) and runs the test suite. If tests still pass after the mutation, tests
# are insufficient.
#
# Per Phase 14 Part 4 §"Gate E — Mutation testing". Threshold: 99%.

set -euo pipefail

GATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Honor the gate's tier from MODES.json (gate_e_state). In REPORT mode this
# script runs no mutation testing and exits 0, so the CI job shows success
# without checking anything. Since 2026-10-14 (D40) it says so plainly: a
# "NOT RUN" line, a GitHub warning annotation and a job-summary line. The
# mode itself is unchanged. BLOCKING mode means the script enforces strictly.
# Self-test: scripts/gates/__tests__/gate-d-e-report-not-run.test.sh.
mode=$(bash "$GATES_DIR/mode-lookup.sh" gate_e_state state 2>/dev/null || echo "BLOCKING")
if [ "$mode" = "REPORT" ]; then
  echo "Gate E NOT RUN: report mode (MODES.json)"
  echo "        gate_e_state.mode is REPORT, so Stryker did not run and no mutation"
  echo "        score was measured. A green Gate E job is not evidence of mutation testing."
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::warning title=Gate E NOT RUN::report mode (MODES.json gate_e_state). No mutation testing ran."
  fi
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "**Gate E NOT RUN:** report mode (MODES.json gate_e_state). No mutation testing ran." >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

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
  echo "Gate E: stryker not installed in packages/api/node_modules; run 'npm ci --legacy-peer-deps'"
  exit 1
fi

pushd packages/api > /dev/null
npx --no-install stryker run --mutate "$CHANGED_FILES" --reporters json,clear-text
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
