#!/usr/bin/env bash
# Bug 175/176/208/261 etc. fix from Dispatch 05.
# No money values accepted from clients in any Zod schema.

set -euo pipefail

# Reject any Zod schema accepting money from clients
violations=$(grep -rEn "(servicePrice|totalAmount|totalAmountCents|addonPrice|discountValue|discountAmount|priceCents)\s*:\s*z\.(number|coerce\.number)" \
  packages/api/src/validators/ packages/api/src/routes/ 2>/dev/null \
  | grep -v "// gate-a-allowed:" \
  | grep -v "adminWalletAdjustmentSchema" \
  | grep -v "createAddonSchema\|updateAddonSchema" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 175/176/208): schema accepts money from client"
  echo "$violations"
  exit 1
fi
echo "Gate A — no client money in schemas: OK"
