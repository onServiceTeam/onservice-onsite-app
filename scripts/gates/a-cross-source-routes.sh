#!/usr/bin/env bash
# Bug 1185 fix. All navigation uses Routes registry constants, never raw path strings.

set -euo pipefail

violations=$(grep -rE "router\.(push|replace)\(['\"]\/" \
  apps/mobile/app/ apps/mobile/src/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." \
  | grep -v "// gate-a-allowed:" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1185): raw path strings in router.push/replace; use Routes registry"
  echo "$violations"
  exit 1
fi
echo "Gate A — routes registry: OK"
