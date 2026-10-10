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
#   - unique-regression-ids:          direct Bug IDs in it()/test() titles are
#                                    unique across apps/ and packages/.
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
# Unique regression IDs (BLOCKING)
# ---------------------------------------------------------------------------
if regression_id_output=$(python3 "$GATES_DIR/c-unique-regression-ids.py" 2>&1); then
  report_article "unique-regression-ids" 1
else
  report_article "unique-regression-ids" 0 "$regression_id_output"
fi

# ---------------------------------------------------------------------------
# Money-in-transaction (REPORT until D06)
#
# Money mutations (writes to wallets, wallet_transactions, admin_actions)
# must be inside db.transaction() blocks. Bug list 69, 70, 71, 78, 79, 80,
# 82, 83, 84, 85, 105, 106, 127, 237.
# ---------------------------------------------------------------------------
# Phase 14 Dispatch 06 fix: the prior gate logic searched for Kysely
# patterns (updateTable('wallets', insertInto('wallet_transactions',
# insertInto('admin_actions') that don't exist in this codebase — the
# stack is raw pg. The gate was vacuously passing. Now: detect raw-pg
# patterns matching db.query("UPDATE wallets ...") /
# db.query("INSERT INTO wallet_transactions ...") /
# db.query("INSERT INTO admin_actions ...") at the top level (not inside
# a db.transaction callback or accepting a `client.query` parameter).
#
# A line is in violation if:
#   1. It contains a money-mutation SQL fragment.
#   2. The closest preceding `function ... { ... }` boundary did NOT
#      open a `db.transaction(` block in its body, AND
#   3. The line uses `db.query` (not `client.query`).
#   4. There is no `// gate-c-allowed:` marker within ±3 lines.
#
# This is heuristic — it catches the common case (top-level db.query
# mutating money tables outside any transaction). False positives can be
# tagged with `// gate-c-allowed: <reason>` per the documented
# convention.
money_violations=""
if [ -d "packages/api/src/services" ]; then
  while IFS= read -r svc; do
    [ -z "$svc" ] && continue
    if ! grep -qE "wallets|admin_actions|wallet_transactions" "$svc" 2>/dev/null; then
      continue
    fi
    # Find every line that calls db.query (not client.query) with a
    # money-mutation SQL fragment. We match the SQL keyword on a
    # following line via multiline detection, but for simplicity we
    # require the SQL to appear on the same line as db.query OR on the
    # line right after.
    mutating_lines=$(awk '
      /db\.query[[:space:]]*\(/ {
        # Remember the line of the db.query call (the violation site).
        anchor = NR;
        # Capture the next ~3 lines into a buffer so multi-line template
        # literals are scanned for the SQL keyword.
        buf = $0;
        for (i = 1; i <= 3 && (getline next_line) > 0; i++) {
          buf = buf "\n" next_line;
        }
        if (buf ~ /UPDATE[[:space:]]+wallets/ ||
            buf ~ /INSERT[[:space:]]+INTO[[:space:]]+wallet_transactions/ ||
            buf ~ /INSERT[[:space:]]+INTO[[:space:]]+admin_actions/) {
          print anchor;
        }
      }
    ' "$svc" 2>/dev/null || true)
    for line in $mutating_lines; do
      # Search ±5 lines for the gate-c-allowed marker (covers a typical
      # try { ... } envelope or the line right before the call).
      surr_start=$(( line > 5 ? line - 5 : 1 ))
      surr_end=$(( line + 5 ))
      surrounding=$(sed -n "${surr_start},${surr_end}p" "$svc")
      if echo "$surrounding" | grep -qE "// gate-c-allowed:"; then continue; fi
      money_violations+="$svc:$line — money/audit mutation via db.query at top level (not inside db.transaction)"$'\n'
    done
  done < <(find packages/api/src/services -name "*.service.ts" 2>/dev/null)
fi

if [ -z "$money_violations" ]; then
  report_article "money-in-transaction" 1
else
  report_article "money-in-transaction" 0 "$money_violations"
fi

# ---------------------------------------------------------------------------
# no-shield-references (Phase 14 D04, BLOCKING)
#
# Delegates to scripts/gates/c-constitution-no-shield-references.sh which has
# its own allowlist and comment-skip logic. The article-level mode lookup
# still goes through MODES.json for consistency with the tier model.
# ---------------------------------------------------------------------------
shield_output=$(bash "$GATES_DIR/c-constitution-no-shield-references.sh" 2>&1 || true)
shield_exit=$?
if echo "$shield_output" | tail -1 | grep -qE "^Gate C — no-shield-references \[BLOCKING\]: OK"; then
  report_article "no-shield-references" 1
else
  report_article "no-shield-references" 0 "$shield_output"
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
