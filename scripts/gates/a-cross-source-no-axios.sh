#!/usr/bin/env bash
# Bug 1271 fix. Constitution Article 7.1: client native fetch wrapper only,
# no axios on the client.
#
# Scope: apps/ only. Server-side outbound HTTP (e.g., packages/api/src/
# services/payment.service.ts hitting PayMongo, sms.service.ts hitting
# the SMS gateway) is server-to-server and out of scope for the
# constitutional concern (which was about client bundle bloat + cookie/CSRF
# behavior). Server outbound axios is tracked separately and may be
# migrated when those gateways are reworked.

set -euo pipefail

violations=$(grep -rE "import.*from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)" \
  apps/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1271): client axios import detected"
  echo "$violations"
  exit 1
fi
echo "Gate A — no client axios: OK"
