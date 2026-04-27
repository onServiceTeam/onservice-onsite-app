#!/bin/bash
# verify-mutation-coverage-full.sh
#
# Runs Stryker against the FULL sacred-files roster regardless of git diff.
# This is the absolute mutation-coverage gate at launch (Phase 12,
# Constitution Article 13). Per-phase runs use verify-mutation-coverage.sh
# with --phase flag (TD-003 baseline-delta scoping).
#
# Usage:
#   bash .ai-coder/checkpoints/verify-mutation-coverage-full.sh
#   npm run mutation:full
#
# Threshold: every sacred file must achieve >=60% mutation score.
#
# This is VERY SLOW (10-30 minutes for the whole roster). Run it:
#   - Phase 12 (launch readiness)
#   - Ad-hoc when wanting a full sweep
#   - Quarterly during maintenance to catch regression in untouched files
#
# This script intentionally does NOT accept --phase. It always mutates the
# full sacred set.

set -e

LOG_DIR="${LOG_DIR:-.ai-coder/checkpoints/logs/mutation}"
mkdir -p "$LOG_DIR"

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

if ! npx stryker --version &> /dev/null; then
  echo "INFO: Stryker not installed. Installing now..."
  npm install --save-dev --save-exact --legacy-peer-deps --no-workspaces \
    @stryker-mutator/core@8.6.0 \
    @stryker-mutator/typescript-checker@8.6.0 \
    @stryker-mutator/jest-runner@8.6.0
fi

CONFIG_FILE="${LOG_DIR}/stryker.config.full.generated.json"
REPORT_DIR="${LOG_DIR}"

MUTATE_JSON=""
EXISTING_FILES=()
for f in "${SACRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "INFO: sacred file does not exist yet (deferred to its phase): $f"
    continue
  fi
  EXISTING_FILES+=("$f")
  if [ -z "$MUTATE_JSON" ]; then
    MUTATE_JSON="\"$f\""
  else
    MUTATE_JSON="${MUTATE_JSON}, \"$f\""
  fi
done

if [ "${#EXISTING_FILES[@]}" -eq 0 ]; then
  echo "FAIL: No sacred files exist. Cannot run full mutation sweep."
  exit 1
fi

echo "--- gate-3-mutations-full (launch-readiness sweep) ---"
echo "Mutating ${#EXISTING_FILES[@]} sacred file(s):"
for f in "${EXISTING_FILES[@]}"; do
  echo "  - $f"
done
echo ""

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
  "htmlReporter": { "fileName": "${REPORT_DIR}/stryker-report-full.html" },
  "mutate": [${MUTATE_JSON}],
  "thresholds": { "high": 80, "low": 60, "break": 60 },
  "concurrency": 4,
  "timeoutMS": 60000
}
EOF

echo "Stryker config: $CONFIG_FILE"
echo "This may take 10-30 minutes. Output streamed below."
echo ""

LOG_TS=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/mutation-full-${LOG_TS}.log"
npx stryker run "$CONFIG_FILE" 2>&1 | tee "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "PASS: All ${#EXISTING_FILES[@]} sacred files >= 60% mutation score."
  echo "Detailed report: ${REPORT_DIR}/stryker-report-full.html"
  exit 0
else
  echo ""
  echo "FAIL: Full mutation sweep below threshold."
  echo "Per Constitution Article 13, this MUST pass before launch."
  echo "Strengthen tests on the failing sacred files until score >= 60%."
  exit 1
fi
