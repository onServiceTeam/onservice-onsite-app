#!/usr/bin/env bash
# Bug 1170 + 1198 fix gate.
# After Dispatch 02, server is canonical and clients consume via
# <CancellationPolicyTable> component. No hardcoded percentages outside it.

set -euo pipefail

violations=$(grep -rE '(beforeMatch|afterMatch|afterPayment|afterEnRoute|24h|48h).*[0-9]+%|refund_percent.*=.*[0-9]+' \
  apps/mobile/app/ apps/mobile/src/ apps/admin/src/ 2>/dev/null \
  | grep -v ".test." \
  | grep -v "CancellationPolicyTable" \
  | grep -v "//.*comment" \
  | grep -v "// gate-a-allowed:" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1170): hardcoded cancellation percentages outside CancellationPolicyTable"
  echo "$violations"
  exit 1
fi
echo "Gate A — cancellation policy single source: OK"
