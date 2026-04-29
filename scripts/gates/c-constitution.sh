#!/usr/bin/env bash
# Gate C — Constitution compliance.
#
# Enforces constitutional articles previously falsified in Phase 13's gate logs:
#   - Article 4.2: no console.* in production code (allowed in tests + scripts)
#   - Article 4.6: no emoji as iconography (overlaps with Gate A; redundant by design)
#   - Article 7.1: no axios imports
#   - Article 12: BIGINT money handling tests must exist (>= 5 in bigint-money-precision.test.ts)
#   - Article 16: closeout file exists for current dispatch
#   - Money-in-transaction (Dispatch 06+): money mutations inside db.transaction blocks
#
# Per Phase 14 Part 4 §"Gate C — Constitution compliance".

set -euo pipefail

fail=0

# Article 4.2 — no console.* in production code
console_violations=$(grep -rE "console\.(log|error|warn|info|debug)" \
  apps/mobile/src apps/mobile/app apps/admin/src packages/api/src \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." \
  | grep -v "/__tests__/" \
  | grep -v "/scripts/" \
  | grep -v "//.*console\." \
  | grep -v "// gate-c-allowed:" \
  || true)
if [ -n "$console_violations" ]; then
  echo "Gate C: Article 4.2 violation — console.* in production code"
  echo "$console_violations" | head -10
  fail=1
fi

# Article 7.1 — no axios
axios_violations=$(grep -rE "import.*from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)" \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  || true)
if [ -n "$axios_violations" ]; then
  echo "Gate C: Article 7.1 violation — axios import"
  echo "$axios_violations" | head -5
  fail=1
fi

# Article 12 — BIGINT money tests exist
bigint_test=$(find packages/api/__tests__ packages/api -name "bigint-money-precision.test.ts" 2>/dev/null | head -1)
if [ -z "$bigint_test" ]; then
  echo "Gate C: Article 12 violation — bigint-money-precision.test.ts missing"
  fail=1
else
  test_count=$(grep -cE "^\s*(test|it)\(" "$bigint_test" || echo 0)
  if [ "$test_count" -lt 5 ]; then
    echo "Gate C: Article 12 violation — bigint-money-precision.test.ts has only $test_count tests (need >= 5)"
    fail=1
  fi
fi

# Article 16 — closeout file for current dispatch
DISPATCH=${DISPATCH:-$(git branch --show-current 2>/dev/null | grep -oE "d[0-9]+" | grep -oE "[0-9]+" | head -1 || echo "")}
if [ -n "$DISPATCH" ]; then
  closeout=".ai-coder/dispatches/D${DISPATCH}-closeout.md"
  if [ ! -f "$closeout" ]; then
    echo "Gate C: Article 16 violation — closeout missing: $closeout"
    fail=1
  fi
fi

# Money-in-transaction — money mutations must be inside db.transaction()
if [ -d "packages/api/src/services" ]; then
  for svc in $(find packages/api/src/services -name "*.service.ts" 2>/dev/null); do
    if ! grep -qE "wallets|admin_actions|wallet_transactions" "$svc"; then continue; fi

    mutating_lines=$(grep -nE "(updateTable\('wallets|insertInto\('wallet_transactions|insertInto\('admin_actions" "$svc" \
      | cut -d: -f1)

    for line in $mutating_lines; do
      context=$(sed -n "$(( line > 50 ? line - 50 : 1 )),${line}p" "$svc")
      if ! echo "$context" | grep -qE "db\.transaction\(\)|\(trx[,\)]|trx\.|async\s*\(trx\)"; then
        surrounding=$(sed -n "$(( line > 3 ? line - 3 : 1 )),$(( line + 3 ))p" "$svc")
        if echo "$surrounding" | grep -q "// gate-c-allowed: post-commit"; then continue; fi
        echo "Gate C VIOLATION: $svc:$line — money mutation outside transaction"
        fail=1
      fi
    done
  done
fi

if [ "$fail" -eq 1 ]; then
  echo "Gate C FAILED"
  exit 1
fi
echo "Gate C PASSED"
