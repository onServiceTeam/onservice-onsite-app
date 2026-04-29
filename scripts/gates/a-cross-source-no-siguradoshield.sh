#!/usr/bin/env bash
# Bug 538 + chain. After Dispatch 04 Option A (pull), SiguradoShield references
# must not appear in code.

set -euo pipefail

violations=$(grep -rEi "siguradoshield|premiumProtection|propertyDamage|siguradoShieldDeductible" \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" 2>/dev/null \
  | grep -v "LAUNCH-LIMITATIONS.md" \
  | grep -v "/decisions/D04-siguradoshield.md" \
  | grep -v "PART-3-BUG-REMEDIATION" \
  | grep -v "STRATEGIC-DECISIONS-LOG" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 538/Option A): SiguradoShield references found in code"
  echo "$violations"
  exit 1
fi
echo "Gate A — no SiguradoShield: OK"
