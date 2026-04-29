#!/usr/bin/env bash
# Bug 974 + 1247 fix. Tier criteria from server /suki/provider-tiers, never hardcoded in client.

set -euo pipefail

violations=$(grep -rE "(VERIFIED_TIER_JOBS|PRO_TIER_JOBS|ELITE_TIER_RATING|FOUNDING_TIER_).*=.*[0-9]" \
  apps/mobile/ apps/admin/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." \
  | grep -v "// gate-a-allowed:" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 974): hardcoded tier criteria in client code"
  echo "$violations"
  exit 1
fi
echo "Gate A — tier criteria from server: OK"
