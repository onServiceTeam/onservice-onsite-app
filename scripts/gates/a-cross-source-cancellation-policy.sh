#!/usr/bin/env bash
# Bug 1170 + 1198 client-display drift gate, corrected under E09.
#
# Current truth: cancellation_policies is the shared customer-display source
# consumed by:
#   - mobile: apps/mobile/src/utils/cancellation-policy.ts (fetch + render)
#   - admin:  apps/admin/src/pages/settings/CancellationPolicyPage.tsx
#             (read-only comparison) + cancellation-policy-validation.ts
#
# It is NOT the live refund source. Escrow cancellation still consumes the
# separate cancel_refund_* Platform Settings rows. E09 freezes both mutation
# surfaces until one source and final brackets are approved. This fragment
# therefore guards customer-display literals and the explicit E09 hold; it
# must never report that the live money path has one source while E09 is open.
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

policy_route="packages/api/src/routes/cancellation-policy-admin.routes.ts"
settings_service="packages/api/src/services/settings.service.ts"
if ! grep -q 'E09_MUTATION_HOLD_MESSAGE' "$policy_route"; then
  echo "GATE A VIOLATION (E09): versioned cancellation-policy mutations are no longer explicitly held"
  exit 1
fi

E09_HELD_KEYS=(
  cancel_refund_over_24h
  cancel_refund_2_to_24h
  cancel_refund_1_to_2h
  cancel_refund_30min_to_1h
  cancel_refund_under_30min
  cancel_refund_provider_arrived
  cancel_refund_customer_noshow
)
for key in "${E09_HELD_KEYS[@]}"; do
  if ! grep -Eq "^[[:space:]]+${key}: '.*E09" "$settings_service"; then
    echo "GATE A VIOLATION (E09): ${key} is not visibly held in the settings runtime registry"
    exit 1
  fi
done

echo "Gate A — customer cancellation display drift guard + E09 containment: OK"
