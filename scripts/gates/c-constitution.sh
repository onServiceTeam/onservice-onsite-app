#!/usr/bin/env bash
# Gate C — Constitution compliance.
#
# Tiered per-article enforcement (introduced in Dispatch 03). Each article's
# mode is looked up in scripts/gates/MODES.json (gate_c_articles):
#   - BLOCKING: violation fails the gate.
#   - REPORT:   violation is logged but does not fail the gate.
#               Used for articles whose cleanup is owned by a not-yet-landed
#               dispatch (e.g., console.* and money-in-transaction).
#
# Articles enforced:
#   - article-4.2-no-console:        no console.* in production code.
#   - article-7.1-no-axios:          no axios on the client (apps/ only;
#                                    server-to-server outbound HTTP excluded
#                                    by design — see a-cross-source-no-axios.sh).
#   - article-12-bigint-money-tests: bigint-money-precision.test.ts exists
#                                    with >= 5 tests.
#   - article-16-closeout-exists:    when running on a phase/14-dNN-* branch,
#                                    .ai-coder/dispatches/D<NN>-closeout.md
#                                    must exist.
#   - money-in-transaction:          money mutations (wallets, wallet_transactions,
#                                    admin_actions writes) must be inside
#                                    db.transaction().
#
# Article 4.6 (no emoji as iconography) is enforced by Gate A's
# a-cross-source-no-emoji-icons.sh fragment (redundant by design); not
# duplicated here.
#
# Per Phase 14 Part 4 §"Gate C — Constitution compliance" and Dispatch 03
# tiered-enforcement design.

set -euo pipefail

GATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE_LOOKUP="bash ${GATES_DIR}/mode-lookup.sh gate_c_articles"

blocking_failed=0
report_failed=0
articles_run=0

# Helper: report an article's result
report_article() {
  local article="$1" passed="$2" detail="${3:-}"
  local mode
  mode=$($MODE_LOOKUP "$article" 2>/dev/null || echo "BLOCKING")
  articles_run=$((articles_run + 1))

  if [ "$passed" = "1" ]; then
    echo "Gate C — $article [$mode]: OK"
    return 0
  fi

  if [ "$mode" = "BLOCKING" ]; then
    echo "Gate C VIOLATION ($article) [BLOCKING]:"
    [ -n "$detail" ] && echo "$detail" | head -10
    blocking_failed=$((blocking_failed + 1))
  else
    echo "Gate C — $article [REPORT]: violations logged, not blocking. Owning dispatch will promote to BLOCKING."
    [ -n "$detail" ] && echo "$detail" | head -10
    report_failed=$((report_failed + 1))
  fi
}

# ---------------------------------------------------------------------------
# Article 4.2 — no console.* in production code (REPORT until D12)
# ---------------------------------------------------------------------------
console_violations=$(grep -rE "console\.(log|error|warn|info|debug)" \
  apps/mobile/src apps/mobile/app apps/admin/src packages/api/src \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." \
  | grep -v "/__tests__/" \
  | grep -v "/scripts/" \
  | grep -v "//.*console\." \
  | grep -v "// gate-c-allowed:" \
  || true)
if [ -z "$console_violations" ]; then
  report_article "article-4.2-no-console" 1
else
  count=$(echo "$console_violations" | wc -l | tr -d ' ')
  report_article "article-4.2-no-console" 0 "$count occurrence(s); first 10:
$console_violations"
fi

# ---------------------------------------------------------------------------
# Article 7.1 — no axios on the client (BLOCKING, apps/ only)
#
# Scope correction in D03: was apps/ + packages/, which incorrectly flagged
# server-to-server outbound (payment.service.ts, sms.service.ts). Server
# outbound axios is permitted; the constitutional concern was client bundle
# bloat + cookie/CSRF behavior.
# ---------------------------------------------------------------------------
axios_violations=$(grep -rE "import.*from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)" \
  apps/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  || true)
if [ -z "$axios_violations" ]; then
  report_article "article-7.1-no-axios" 1
else
  report_article "article-7.1-no-axios" 0 "$axios_violations"
fi

# ---------------------------------------------------------------------------
# Article 12 — BIGINT money tests exist
# ---------------------------------------------------------------------------
bigint_test=$(find packages/api/__tests__ packages/api -name "bigint-money-precision.test.ts" 2>/dev/null | head -1)
if [ -z "$bigint_test" ]; then
  report_article "article-12-bigint-money-tests" 0 "bigint-money-precision.test.ts not found"
else
  test_count=$(grep -cE "^\s*(test|it)\(" "$bigint_test" 2>/dev/null || echo 0)
  if [ "$test_count" -lt 5 ]; then
    report_article "article-12-bigint-money-tests" 0 "$bigint_test has only $test_count tests (need >= 5)"
  else
    report_article "article-12-bigint-money-tests" 1
  fi
fi

# ---------------------------------------------------------------------------
# Article 16 — closeout file exists for current dispatch
#
# Activates only on a phase/14-dNN-* branch. On master/main this check is
# vacuously OK.
# ---------------------------------------------------------------------------
DISPATCH=${DISPATCH:-$(git branch --show-current 2>/dev/null | grep -oE "d[0-9]+" | grep -oE "[0-9]+" | head -1 || echo "")}
if [ -n "$DISPATCH" ]; then
  closeout=".ai-coder/dispatches/D${DISPATCH}-closeout.md"
  if [ ! -f "$closeout" ]; then
    report_article "article-16-closeout-exists" 0 "closeout missing: $closeout"
  else
    report_article "article-16-closeout-exists" 1
  fi
else
  # Not on a dispatch branch — vacuously OK
  report_article "article-16-closeout-exists" 1
fi

# ---------------------------------------------------------------------------
# Money-in-transaction (REPORT until D06)
#
# Money mutations (writes to wallets, wallet_transactions, admin_actions)
# must be inside db.transaction() blocks. Bug list 69, 70, 71, 78, 79, 80,
# 82, 83, 84, 85, 105, 106, 127, 237.
# ---------------------------------------------------------------------------
money_violations=""
if [ -d "packages/api/src/services" ]; then
  while IFS= read -r svc; do
    [ -z "$svc" ] && continue
    if ! grep -qE "wallets|admin_actions|wallet_transactions" "$svc" 2>/dev/null; then
      continue
    fi
    mutating_lines=$( { grep -nE "updateTable\('wallets|insertInto\('wallet_transactions|insertInto\('admin_actions" "$svc" 2>/dev/null || true; } \
      | cut -d: -f1)
    for line in $mutating_lines; do
      start=$(( line > 50 ? line - 50 : 1 ))
      context=$(sed -n "${start},${line}p" "$svc")
      # Detect transaction context: db.transaction() or trx-like callback args.
      # Use fixed-string greps to avoid metachar issues with parentheses.
      if echo "$context" | grep -qE "db\.transaction\(" ; then continue; fi
      if echo "$context" | grep -qF "(trx)" ; then continue; fi
      if echo "$context" | grep -qF "(trx," ; then continue; fi
      if echo "$context" | grep -qE "trx\." ; then continue; fi
      surr_start=$(( line > 3 ? line - 3 : 1 ))
      surr_end=$(( line + 3 ))
      surrounding=$(sed -n "${surr_start},${surr_end}p" "$svc")
      if echo "$surrounding" | grep -qF "// gate-c-allowed: post-commit"; then continue; fi
      money_violations+="$svc:$line — money mutation outside transaction"$'\n'
    done
  done < <(find packages/api/src/services -name "*.service.ts" 2>/dev/null)
fi

if [ -z "$money_violations" ]; then
  report_article "money-in-transaction" 1
else
  report_article "money-in-transaction" 0 "$money_violations"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Gate C summary ==="
echo "Articles checked: $articles_run"
echo "BLOCKING failed: $blocking_failed"
echo "REPORT failed:   $report_failed"

if [ "$blocking_failed" -gt 0 ]; then
  echo ""
  echo "Gate C FAILED — $blocking_failed BLOCKING article(s) failed."
  exit 1
fi

echo ""
echo "Gate C PASSED — all BLOCKING articles green ($report_failed REPORT article(s) still failing, expected)."
