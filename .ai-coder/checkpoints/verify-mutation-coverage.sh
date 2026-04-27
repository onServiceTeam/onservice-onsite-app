#!/bin/bash
# verify-mutation-coverage.sh
#
# Runs Stryker mutation testing on the money-handling code paths.
# Mutation testing introduces small bugs into the code and checks that
# tests catch them. A test suite that catches >=80% of mutations is rigorous.
# A test suite that catches <60% has phantom tests.
#
# Usage: bash .ai-coder/checkpoints/verify-mutation-coverage.sh
#
# This is SLOW (5-15 minutes). Run it at Gate 3, not on every save.

set -e

LOG_DIR="${LOG_DIR:-.ai-coder/checkpoints/logs/mutation}"
mkdir -p "$LOG_DIR"

# Files where mutation coverage is sacred — these handle money
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

# Check if Stryker is installed
if ! npx stryker --version &> /dev/null; then
  echo "INFO: Stryker not installed. Installing now..."
  npm install --save-dev --save-exact @stryker-mutator/core@8.6.0 @stryker-mutator/typescript-checker@8.6.0 @stryker-mutator/jest-runner@8.6.0
fi

# Generate stryker config if missing
if [ ! -f "stryker.config.json" ]; then
  cat > stryker.config.json <<'EOF'
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "reporters": ["html", "clear-text", "progress"],
  "testRunner": "jest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": [
    "packages/api/src/services/escrow.service.ts",
    "packages/api/src/services/commission.service.ts",
    "packages/api/src/services/dispute.service.ts",
    "packages/api/src/services/booking.service.ts",
    "packages/api/src/services/payout.service.ts",
    "packages/api/src/services/wallet.service.ts",
    "packages/api/src/services/settings.service.ts"
  ],
  "thresholds": { "high": 80, "low": 60, "break": 60 },
  "concurrency": 4,
  "timeoutMS": 60000
}
EOF
fi

echo "Running mutation testing on sacred files..."
echo "This may take 10-15 minutes. Output streamed below."
echo ""

npx stryker run 2>&1 | tee "$LOG_DIR/mutation-$(date +%Y%m%d-%H%M%S).log"
EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "PASS: Mutation score >= 60% threshold."
  echo "Detailed report at reports/mutation/mutation.html"
else
  echo ""
  echo "FAIL: Mutation score below threshold."
  echo "This means tests have phantom assertions or weak coverage."
  echo "DO NOT proceed. Strengthen tests until mutation score >= 60%."
  exit 1
fi
