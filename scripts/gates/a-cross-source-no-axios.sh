#!/usr/bin/env bash
# Bug 1271 fix. Constitution Article 7.1: native fetch wrapper only, no axios.

set -euo pipefail

violations=$(grep -rE "import.*from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)" \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1271): axios import detected"
  echo "$violations"
  exit 1
fi
echo "Gate A — no axios: OK"
