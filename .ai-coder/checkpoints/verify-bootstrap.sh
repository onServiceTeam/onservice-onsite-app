#!/bin/bash
# verify-bootstrap.sh
#
# Phase 00 (bootstrap) gate. Confirms:
#   1. Preflight harness clean (typecheck, lint, api:test all exit 0)
#   2. All required checkpoint scripts are installed and executable
#   3. All required templates are installed
#   4. Design tokens are installed
#   5. Baseline commit and file-hash manifest captured
#   6. Sanity-checks log exists with at least one entry
#   7. Evidence manifest, honesty check, and check index exist
#
# Does NOT run verify-master.sh's broader gates (forbidden patterns, emoji,
# mutation testing). Those gates measure absolute repo state and apply from
# Phase 01 onward. Phase 00's job is to install the verification machinery,
# not to exercise it against pre-existing baseline debt.
#
# Usage: bash .ai-coder/checkpoints/verify-bootstrap.sh PHASE-00

set -e
set -o pipefail

PHASE="${1:-PHASE-00}"
LOG_DIR=".ai-coder/checkpoints/logs/${PHASE}"
GATE_DIR="${LOG_DIR}/gates"
CHECK_DIR="${LOG_DIR}/checks"

mkdir -p "$LOG_DIR" "$GATE_DIR" "$CHECK_DIR"

OVERALL_STATUS=PASS
FAIL_REASONS=()

note_failure() {
  OVERALL_STATUS=FAIL
  FAIL_REASONS+=("$1")
  echo ""
  echo "FAIL: $1"
  echo ""
}

note_pass() {
  echo "PASS: $1"
}

run_gate() {
  local name="$1"
  local cmd="$2"
  local logfile="${GATE_DIR}/${name}.log"
  echo ""
  echo "================================================================"
  echo "  $name"
  echo "================================================================"
  if eval "$cmd" 2>&1 | tee "$logfile"; then
    note_pass "$name"
    return 0
  else
    note_failure "$name failed (see $logfile)"
    return 1
  fi
}

# ===== Preflight harness =====
run_gate "gate-1-typecheck" "npm run typecheck" || true
run_gate "gate-1-lint" "npm run lint" || true
run_gate "gate-2-alltests" "npm run api:test" || true

# ===== Required checkpoint scripts =====
echo ""
echo "================================================================"
echo "  bootstrap-1-scripts-installed"
echo "================================================================"
REQUIRED_SCRIPTS=(
  verify-master.sh verify-phase.sh verify-bootstrap.sh
  verify-no-forbidden.sh verify-no-emoji.sh verify-no-phantom-tests.sh
  verify-deps.sh verify-money-conservation.sh verify-migrations.sh
  verify-no-n-plus-1.sh verify-mutation-coverage.sh verify-screens.sh
  verify-database.sh verify-clean-state.sh verify-evidence-manifest.sh
)
SCRIPT_LOG="${GATE_DIR}/bootstrap-1-scripts-installed.log"
{
  for s in "${REQUIRED_SCRIPTS[@]}"; do
    if [ -f ".ai-coder/checkpoints/$s" ]; then
      echo "OK: $s"
    else
      echo "MISSING: $s"
      OVERALL_STATUS=FAIL
      FAIL_REASONS+=("Required script missing: $s")
    fi
  done
} | tee "$SCRIPT_LOG"

# ===== Required templates =====
echo ""
echo "================================================================"
echo "  bootstrap-2-templates-installed"
echo "================================================================"
REQUIRED_TEMPLATES=(
  PHASE-LOG-TEMPLATE.md BUG-REPORT-TEMPLATE.md SCREEN-AUDIT-TEMPLATE.md
  EVIDENCE-MANIFEST-TEMPLATE.md HONESTY-CHECK-TEMPLATE.md
)
TPL_LOG="${GATE_DIR}/bootstrap-2-templates-installed.log"
{
  for t in "${REQUIRED_TEMPLATES[@]}"; do
    if [ -f ".ai-coder/templates/$t" ]; then
      echo "OK: $t"
    else
      echo "MISSING: $t"
      OVERALL_STATUS=FAIL
      FAIL_REASONS+=("Required template missing: $t")
    fi
  done
} | tee "$TPL_LOG"

# ===== Design tokens =====
echo ""
echo "================================================================"
echo "  bootstrap-3-design-tokens"
echo "================================================================"
TOK_LOG="${GATE_DIR}/bootstrap-3-design-tokens.log"
{
  if [ -f "docs/design-system/tokens.json" ]; then
    echo "OK: docs/design-system/tokens.json"
    if grep -q '"₱"' docs/design-system/tokens.json 2>/dev/null; then
      echo "OK: tokens.json contains PHP currency symbol"
    else
      echo "WARN: tokens.json missing PHP currency symbol"
    fi
  else
    echo "MISSING: docs/design-system/tokens.json"
    OVERALL_STATUS=FAIL
    FAIL_REASONS+=("Design tokens file missing")
  fi
} | tee "$TOK_LOG"

# ===== Baseline captured =====
echo ""
echo "================================================================"
echo "  bootstrap-4-baseline-captured"
echo "================================================================"
BASE_LOG="${GATE_DIR}/bootstrap-4-baseline-captured.log"
{
  if [ -f "${LOG_DIR}/preflight/baseline-commit.txt" ]; then
    echo "OK: baseline-commit.txt = $(cat ${LOG_DIR}/preflight/baseline-commit.txt)"
  else
    echo "MISSING: baseline-commit.txt"
    OVERALL_STATUS=FAIL
    FAIL_REASONS+=("Baseline commit not captured")
  fi
  if [ -f "${LOG_DIR}/preflight/baseline-files.sha256" ]; then
    LINES=$(wc -l < "${LOG_DIR}/preflight/baseline-files.sha256")
    echo "OK: baseline-files.sha256 ($LINES files hashed)"
  else
    echo "MISSING: baseline-files.sha256"
    OVERALL_STATUS=FAIL
    FAIL_REASONS+=("Baseline file manifest not captured")
  fi
} | tee "$BASE_LOG"

# ===== Sanity-checks log =====
echo ""
echo "================================================================"
echo "  bootstrap-5-sanity-log"
echo "================================================================"
SANITY_LOG="${LOG_DIR}/sanity-checks.log"
if [ ! -f "$SANITY_LOG" ]; then
  note_failure "sanity-checks.log missing (Constitution Article 14)"
else
  ENTRIES=$(grep -c "^\[20" "$SANITY_LOG" 2>/dev/null || echo "0")
  echo "OK: sanity-checks.log has $ENTRIES timestamped entries"
  if [ "$ENTRIES" -lt 1 ]; then
    note_failure "sanity-checks.log has no timestamped entries"
  fi
fi

# ===== Evidence manifest, honesty, index =====
echo ""
echo "================================================================"
echo "  bootstrap-6-evidence-artifacts"
echo "================================================================"
for f in "EVIDENCE-MANIFEST.md" "HONESTY-CHECK.md" "checks/INDEX.md"; do
  if [ -f "${LOG_DIR}/$f" ]; then
    SIZE=$(wc -c < "${LOG_DIR}/$f")
    echo "OK: $f ($SIZE bytes)"
  else
    echo "MISSING: $f"
    OVERALL_STATUS=FAIL
    FAIL_REASONS+=("Required artifact missing: $f")
  fi
done
if [ -f "${LOG_DIR}/HONESTY-CHECK.md" ]; then
  HC_SIZE=$(wc -c < "${LOG_DIR}/HONESTY-CHECK.md")
  if [ "$HC_SIZE" -lt 200 ]; then
    note_failure "HONESTY-CHECK.md too short ($HC_SIZE bytes; need >= 200)"
  fi
fi

# ===== Hash artifacts =====
echo ""
echo "================================================================"
echo "  Hashing all artifacts (cryptographic chain of evidence)"
echo "================================================================"
find "$LOG_DIR" -type f -not -name "HASHES.sha256" -exec sha256sum {} \; > "${LOG_DIR}/HASHES.sha256"
HASH_LINES=$(wc -l < "${LOG_DIR}/HASHES.sha256")
echo "Hashes written to ${LOG_DIR}/HASHES.sha256 ($HASH_LINES files)"

# ===== Final =====
echo ""
echo "================================================================"
echo "  FINAL STATUS: $OVERALL_STATUS"
echo "================================================================"
if [ "$OVERALL_STATUS" = "PASS" ]; then
  echo ""
  echo "Phase $PHASE bootstrap verification PASSED."
  echo "Evidence: $LOG_DIR"
  echo "Hash chain: ${LOG_DIR}/HASHES.sha256"
  exit 0
else
  echo ""
  echo "Phase $PHASE bootstrap verification FAILED."
  for r in "${FAIL_REASONS[@]}"; do echo "  - $r"; done
  exit 1
fi
