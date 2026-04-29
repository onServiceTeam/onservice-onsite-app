#!/usr/bin/env bash
# Gate C extension — no admin password updates in seed files.
#
# Bug 1235 (Phase 14 Dispatch 01) fix.
# Blocks any future seed that sets password_hash on a user/admin row, which
# would re-introduce the failure mode the deleted seed created.

set -euo pipefail

if [ ! -d "packages/api/seeds" ]; then
  echo "Gate C — no admin password seeds: skipped (no seeds directory)"
  exit 0
fi

violations=$(grep -rEi "UPDATE\s+(users|admin_users)[^;]*password_hash|admin_users[^;]*password_hash\s*=|users\s+SET\s+password_hash" \
  packages/api/seeds/ 2>/dev/null \
  | grep -v "// gate-c-allowed:" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE C VIOLATION (Bug 1235): admin password updates in seeds are forbidden."
  echo "Use scripts/bootstrap-admin.ts with ADMIN_BOOTSTRAP_PASSWORD env var instead."
  echo "$violations"
  exit 1
fi

echo "Gate C — no admin password seeds: OK"
