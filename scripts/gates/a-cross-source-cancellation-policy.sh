#!/usr/bin/env bash
# Bug 1170 + 1198 fix gate.
# After Dispatch 02, server is canonical (cancellation_policies table,
# admin-editable via /admin/settings/cancellation-policy) and clients
# consume the policy via:
#   - mobile: apps/mobile/src/utils/cancellation-policy.ts (fetch + render)
#   - admin:  apps/admin/src/pages/settings/CancellationPolicyPage.tsx
#             (admin editor) + apps/admin/src/lib/cancellation-policy-validation.ts
#             (validation lib that operates on policy data, no literal tier values)
#
# This gate refuses any tier-shape literal outside those allowlisted files,
# i.e., catches things like:
#   { refund_percent: 75, fee_percent: 25 }
#   "24h: 100% refund"
#   refund: 1.0
# Allowed callers stay green because they reference the property names
# without binding them to literal numbers.

set -euo pipefail

# Allow-list of files that legitimately work with policy shape but contain
# no hardcoded tier values themselves.
ALLOWLIST=(
  apps/admin/src/lib/cancellation-policy-validation.ts
  apps/admin/src/pages/settings/CancellationPolicyPage.tsx
  apps/mobile/src/utils/cancellation-policy.ts
  apps/admin/src/pages/settings/__tests__
)

# Build a grep -v exclusion chain.
exclusions=""
for f in "${ALLOWLIST[@]}"; do
  exclusions+=" | grep -v \"$f\""
done

# Pattern looks for OBJECT-LITERAL forms or text strings — not function code.
# Catches:
#   refund_percent: 75
#   "fee_percent": 100
#   '24h: 100% refund'
#   "After provider arrival: No refund"
violations=$(eval "grep -rEn '(refund_percent|fee_percent)\s*[:=]\s*[0-9]+|24\+? hours before.*refund|hours? before.*[0-9]+%? refund|after provider arrival.*[Nn]o refund|after provider arrival.*refund' \
  apps/mobile/app/ apps/mobile/src/ apps/admin/src/ 2>/dev/null \
  | grep -v '\\.test\\.'$exclusions \
  | grep -v '// gate-a-allowed:' \
  || true")

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1170): hardcoded cancellation tier values outside the allowlisted source-of-truth files"
  echo "$violations"
  exit 1
fi
echo "Gate A — cancellation policy single source: OK"
