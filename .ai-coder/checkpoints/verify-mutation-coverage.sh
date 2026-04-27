#!/bin/bash
# verify-mutation-coverage.sh
#
# Runs Stryker mutation testing on the money-handling code paths.
# Mutation testing introduces small bugs into the code and checks that
# tests catch them. A test suite that catches >=80% of mutations is rigorous.
# A test suite that catches <60% has phantom tests.
#
# Usage:
#   bash verify-mutation-coverage.sh                   # legacy: full sacred set
#   bash verify-mutation-coverage.sh --phase PHASE-NN  # TD-003: delta-scoped
#
# TD-005 (baseline-delta scoping for mutation gate, mirrors TD-001):
#   When --phase is given, we intersect the sacred-files roster with the files
#   changed since the phase baseline (git diff --name-only $BASELINE HEAD).
#   - Empty intersection  -> mutation gate is skipped for this phase.
#   - Non-empty           -> Stryker mutates ONLY the touched sacred files.
#                            The 60% break threshold is preserved.
#
#   Limitation (deliberate, do not over-engineer): if a phase modifies a
#   shared helper (e.g. db.ts) imported by a sacred file, we do NOT re-run
#   that sacred file's mutations. The strict git-diff filter is intentional
#   per TD-001's pattern. Transitive-impact analysis is a future TD if a
#   real bug ever ships through this gap.
#
#   The full sweep (verify-mutation-coverage-full.sh) is the absolute gate at
#   launch (Phase 12, Constitution Article 13).
#
# This is SLOW (5-15 minutes per file). Run it at Gate 3, not on every save.

set -e

PHASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

LOG_DIR="${LOG_DIR:-.ai-coder/checkpoints/logs/mutation}"
mkdir -p "$LOG_DIR"

# Files where mutation coverage is sacred — these handle money.
# This is the canonical roster used by both the per-phase gate (delta-scoped)
# and the launch-readiness full sweep (verify-mutation-coverage-full.sh).
SACRED_FILES=(
  "packages/api/src/services/escrow.service.ts"
  "packages/api/src/services/commission.service.ts"
  "packages/api/src/services/dispute.service.ts"
  "packages/api/src/services/booking.service.ts"
  "packages/api/src/services/payout.service.ts"
  "packages/api/src/services/wallet.service.ts"
  "packages/api/src/services/refund.service.ts"
  "packages/api/src/services/settings.service.ts"
)

if ! command -v npx &> /dev/null; then
  echo "FAIL: npx not found"
  exit 1
fi

# Stryker install (TD-002 workaround for eslint peer-dep conflict)
if ! npx stryker --version &> /dev/null; then
  echo "INFO: Stryker not installed. Installing now..."
  npm install --save-dev --save-exact --legacy-peer-deps --no-workspaces \
    @stryker-mutator/core@8.6.0 \
    @stryker-mutator/typescript-checker@8.6.0 \
    @stryker-mutator/jest-runner@8.6.0
fi

# Determine the mutate list
MUTATE_LIST=()
if [ -n "$PHASE" ]; then
  source "$(dirname "$0")/lib/baseline-diff.sh"
  CHANGED=$(files_changed_since_baseline "$PHASE")
  for f in "${SACRED_FILES[@]}"; do
    if echo "$CHANGED" | grep -Fxq "$f"; then
      MUTATE_LIST+=("$f")
    fi
  done

  echo "--- gate-3-mutations (TD-005 baseline-delta scope) ---"
  echo "Phase:            ${PHASE}"
  echo "Sacred roster:    ${#SACRED_FILES[@]} files"
  echo "Touched by phase: ${#MUTATE_LIST[@]} file(s)"
  if [ "${#MUTATE_LIST[@]}" -gt 0 ]; then
    for f in "${MUTATE_LIST[@]}"; do
      echo "  - $f"
    done
  fi
  echo "Untouched (deferred to their implementation phases / Phase 12 sweep):"
  for f in "${SACRED_FILES[@]}"; do
    if ! printf '%s\n' "${MUTATE_LIST[@]}" | grep -Fxq "$f"; then
      echo "  - $f"
    fi
  done
  echo ""

  if [ "${#MUTATE_LIST[@]}" -eq 0 ]; then
    echo "INFO: Phase did not touch any sacred files; mutation gate skipped (TD-005)."
    exit 0
  fi
else
  # Legacy mode (no --phase): mutate the full sacred roster.
  MUTATE_LIST=("${SACRED_FILES[@]}")
  echo "--- gate-3-mutations (legacy: full sacred sweep) ---"
fi

# Generate dynamic Stryker config for reproducibility
if [ -n "$PHASE" ]; then
  PHASE_LOG_DIR=".ai-coder/checkpoints/logs/${PHASE}"
  mkdir -p "$PHASE_LOG_DIR"
  CONFIG_FILE="${PHASE_LOG_DIR}/stryker.config.generated.json"
  REPORT_DIR="${PHASE_LOG_DIR}"
else
  CONFIG_FILE="stryker.config.generated.json"
  REPORT_DIR="reports/mutation"
fi

# Build JSON mutate array
MUTATE_JSON=""
for f in "${MUTATE_LIST[@]}"; do
  if [ -z "$MUTATE_JSON" ]; then
    MUTATE_JSON="\"$f\""
  else
    MUTATE_JSON="${MUTATE_JSON}, \"$f\""
  fi
done

cat > "$CONFIG_FILE" <<EOF
{
  "\$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "reporters": ["clear-text", "html", "progress"],
  "testRunner": "jest",
  "checkers": ["typescript"],
  "tsconfigFile": "packages/api/tsconfig.json",
  "jest": {
    "projectType": "custom",
    "configFile": "packages/api/jest.config.cjs"
  },
  "htmlReporter": { "fileName": "${REPORT_DIR}/stryker-report.html" },
  "mutate": [${MUTATE_JSON}],
  "thresholds": { "high": 80, "low": 60, "break": 60 },
  "concurrency": 4,
  "timeoutMS": 60000
}
EOF

echo "Stryker config: $CONFIG_FILE"
echo "Running mutation testing on ${#MUTATE_LIST[@]} file(s)..."
echo ""

LOG_TS=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/mutation-${LOG_TS}.log"
npx stryker run "$CONFIG_FILE" 2>&1 | tee "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "PASS: Mutation score >= 60% threshold for the ${#MUTATE_LIST[@]} mutated file(s)."
  echo "Detailed report: ${REPORT_DIR}/stryker-report.html"
  exit 0
else
  echo ""
  echo "FAIL: Mutation score below threshold."
  echo "This means tests have phantom assertions or weak coverage."
  echo "DO NOT proceed. Strengthen tests until mutation score >= 60%."
  exit 1
fi
