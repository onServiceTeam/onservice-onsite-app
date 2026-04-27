#!/bin/bash
# verify-master.sh
#
# Runs the FULL verification gauntlet for a phase.
# This is the single command the AI coder runs at end of phase.
# It produces evidence for every applicable check and writes the manifest.
#
# Usage:
#   bash .ai-coder/checkpoints/verify-master.sh PHASE-NN
#
# Exits 0 only if EVERY gate passes.
# Exits 1 on any failure, with detailed log.

set -e
set -o pipefail

PHASE="${1:-}"
if [ -z "$PHASE" ]; then
  echo "ERROR: Phase argument required."
  echo "Usage: $0 PHASE-NN"
  exit 1
fi

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
  echo "❌ $1"
  echo ""
}

note_pass() {
  echo "✅ $1"
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

# ===== GATE 1 — MECHANICAL CORRECTNESS =====
run_gate "gate-1-typecheck" "npm run typecheck" || true
run_gate "gate-1-lint" "npm run lint" || true
run_gate "gate-1-forbidden" "bash .ai-coder/checkpoints/verify-no-forbidden.sh" || true
run_gate "gate-1-emoji" "bash .ai-coder/checkpoints/verify-no-emoji.sh" || true
run_gate "gate-1-phantom-tests" "bash .ai-coder/checkpoints/verify-no-phantom-tests.sh" || true
run_gate "gate-1-deps" "bash .ai-coder/checkpoints/verify-deps.sh" || true

# ===== GATE 2 — BEHAVIORAL CORRECTNESS =====
run_gate "gate-2-alltests" "npm run api:test" || true

# Capture test count
if [ -f "${GATE_DIR}/gate-2-alltests.log" ]; then
  TESTS_PASSED=$(grep -oE "Tests:.*[0-9]+ passed" "${GATE_DIR}/gate-2-alltests.log" | tail -1 || echo "")
  TESTS_FAILED=$(grep -oE "Tests:.*[0-9]+ failed" "${GATE_DIR}/gate-2-alltests.log" | tail -1 || echo "")
  if [ -n "$TESTS_FAILED" ]; then
    note_failure "Gate 2 has failing tests: $TESTS_FAILED"
  fi
  echo "Test count: $TESTS_PASSED" > "${GATE_DIR}/gate-2-test-count.txt"
fi

# Verify paper-trace and boundary docs exist (created by AI coder during phase)
if [ ! -d "${GATE_DIR}" ] || [ -z "$(ls ${GATE_DIR}/gate-2-paper-trace-*.md 2>/dev/null)" ]; then
  note_failure "Gate 2: No paper-trace documents found. AI coder must trace each new feature on paper."
fi

if [ -z "$(ls ${GATE_DIR}/gate-2-boundaries-*.md 2>/dev/null)" ]; then
  note_failure "Gate 2: No boundary-test documents found. AI coder must document boundary behavior for each new function."
fi

# ===== GATE 3 — ADVERSARIAL SELF-REVIEW =====
# Mutation testing: only run on phases that actually MODIFIED money services.
# (Bug fix from Phase 00: previously checked baseline-files.sha256 which lists every
# TS file in the repo, so the trigger fired every phase regardless of diff.)
if [ -f "${LOG_DIR}/preflight/baseline-commit.txt" ]; then
  BASELINE=$(cat "${LOG_DIR}/preflight/baseline-commit.txt")
  MONEY_TOUCHED=$(git diff --name-only "$BASELINE" HEAD 2>/dev/null \
    | grep -E "(escrow|commission|dispute|payout|wallet|booking)\.service\.ts" || true)
  if [ -n "$MONEY_TOUCHED" ]; then
    run_gate "gate-3-mutations" "bash .ai-coder/checkpoints/verify-mutation-coverage.sh" || true
  else
    echo "INFO: Phase did not modify money services; mutation gate skipped."
  fi
fi

# Verify pre-mortem and future-bugs docs
if [ ! -f "${GATE_DIR}/gate-3-premortem.md" ]; then
  note_failure "Gate 3: No pre-mortem document. AI coder must brainstorm 5 incident scenarios."
fi

if [ ! -f "${GATE_DIR}/gate-3-future-bugs.md" ]; then
  note_failure "Gate 3: No future-bugs analysis. AI coder must document the bug most likely to surface in 2 weeks."
fi

if [ -z "$(ls ${GATE_DIR}/gate-3-mutations-*.md 2>/dev/null)" ]; then
  echo "INFO: No mutation test documents (may be N/A if phase didn't touch money code)."
fi

# ===== GATE 4 — VISUAL & INTERACTIVE =====
# Visual UX audit report (required for any UI phase)
VISUAL_DIR="${LOG_DIR}/visual"
VISUAL_REPORT="${VISUAL_DIR}/REPORT.md"
if [ -d "${VISUAL_DIR}" ] && [ -f "${VISUAL_REPORT}" ]; then
  note_pass "Gate 4: visual report exists at ${VISUAL_REPORT}"
  # Confirm at least one per-screen folder with screenshots
  SCREEN_COUNT=$(find "${VISUAL_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  if [ "$SCREEN_COUNT" -lt 1 ]; then
    note_failure "Gate 4: visual/REPORT.md exists but no per-screen folders found"
  fi
  # Confirm screenshots actually exist
  SCREENSHOT_COUNT=$(find "${VISUAL_DIR}" -name "*.png" 2>/dev/null | wc -l)
  if [ "$SCREENSHOT_COUNT" -lt 4 ]; then
    note_failure "Gate 4: only $SCREENSHOT_COUNT screenshots found (need at least 4 per audited screen)"
  fi
else
  # Heuristic: if the diff touched UI files, visual report is required
  if [ -f "${LOG_DIR}/preflight/baseline-commit.txt" ]; then
    BASELINE=$(cat "${LOG_DIR}/preflight/baseline-commit.txt")
    UI_CHANGES=$(git diff --name-only "$BASELINE" HEAD 2>/dev/null | grep -E "(apps/admin/src|apps/mobile/app|apps/mobile/src|apps/mobile/components).*\.(tsx|jsx)$" | wc -l)
    if [ "$UI_CHANGES" -gt 0 ]; then
      note_failure "Gate 4: $UI_CHANGES UI files changed but no visual/REPORT.md. Run VISUAL-UX-AUDIT-PROTOCOL.md."
    else
      echo "INFO: No UI changes detected, visual audit skipped."
    fi
  else
    echo "INFO: No baseline commit; cannot verify whether visual audit was required."
  fi
fi

# ===== GATE 5 — INTEGRATION & REGRESSION =====
run_gate "gate-5-money" "bash .ai-coder/checkpoints/verify-money-conservation.sh" || true
run_gate "gate-5-migrations" "bash .ai-coder/checkpoints/verify-migrations.sh" || true
run_gate "gate-5-n-plus-1" "bash .ai-coder/checkpoints/verify-no-n-plus-1.sh" || true

# Clean state (slow; only if phase explicitly requires)
if [ "$RUN_CLEAN_STATE" = "1" ]; then
  run_gate "gate-5-cleanstate" "bash .ai-coder/checkpoints/verify-clean-state.sh" || true
fi

# ===== GATE 6 — EVIDENCE AUDIT =====
# Check INDEX.md exists
if [ ! -f "${CHECK_DIR}/INDEX.md" ]; then
  note_failure "Gate 6: checks/INDEX.md missing. AI coder must list every applicable check ID with PASS/N-A/FAIL status."
fi

# Check EVIDENCE-MANIFEST.md exists
if [ ! -f "${LOG_DIR}/EVIDENCE-MANIFEST.md" ]; then
  note_failure "Gate 6: EVIDENCE-MANIFEST.md missing. AI coder must produce evidence manifest."
fi

# Check HONESTY-CHECK.md exists and is substantive
if [ ! -f "${LOG_DIR}/HONESTY-CHECK.md" ]; then
  note_failure "Gate 6: HONESTY-CHECK.md missing."
elif [ "$(wc -c < ${LOG_DIR}/HONESTY-CHECK.md)" -lt 200 ]; then
  note_failure "Gate 6: HONESTY-CHECK.md too short. Substantive answers required."
fi

# Check sanity-checks.log exists and has entries
SANITY_LOG="${LOG_DIR}/sanity-checks.log"
if [ ! -f "$SANITY_LOG" ]; then
  note_failure "Gate 6: sanity-checks.log missing. AI coder must run the continuous sanity check after every meaningful change (Constitution Article 14, DOD Condition 16)."
else
  # Count entries (each begins with "[YYYY-MM-DD")
  SANITY_ENTRIES=$(grep -c "^\[20" "$SANITY_LOG" 2>/dev/null || echo "0")

  # Count significant changes in the diff (heuristic: files added or modified > 20 lines)
  if [ -f "${LOG_DIR}/preflight/baseline-commit.txt" ]; then
    BASELINE=$(cat "${LOG_DIR}/preflight/baseline-commit.txt")
    SIGNIFICANT_CHANGES=$(git diff --stat "$BASELINE" HEAD 2>/dev/null \
      | awk '/\|/ {n=$3+0; if (n >= 20 || $3 ~ /Bin/) c++} END {print c+0}')

    if [ "$SANITY_ENTRIES" -lt "$SIGNIFICANT_CHANGES" ]; then
      note_failure "Gate 6: sanity-checks.log has $SANITY_ENTRIES entries but $SIGNIFICANT_CHANGES significant changes. AI coder skipped the after-every-change ritual."
    fi
  fi
fi

# Run evidence manifest validator
run_gate "gate-6-evidence-audit" "bash .ai-coder/checkpoints/verify-evidence-manifest.sh ${PHASE}" || true

# ===== HASH ALL ARTIFACTS =====
echo ""
echo "================================================================"
echo "  Hashing all artifacts (cryptographic chain of evidence)"
echo "================================================================"
find "$LOG_DIR" -type f -not -name "HASHES.sha256" -exec sha256sum {} \; > "${LOG_DIR}/HASHES.sha256"
echo "Hashes written to ${LOG_DIR}/HASHES.sha256"
echo "Ken can verify with: cd ${LOG_DIR} && sha256sum -c HASHES.sha256"

# ===== FINAL STATUS =====
echo ""
echo "================================================================"
echo "  FINAL STATUS: $OVERALL_STATUS"
echo "================================================================"

if [ "$OVERALL_STATUS" = "PASS" ]; then
  echo ""
  echo "✅ Phase $PHASE has passed all verification gates."
  echo ""
  echo "Evidence directory: $LOG_DIR"
  echo "Evidence manifest:  ${LOG_DIR}/EVIDENCE-MANIFEST.md"
  echo "Honesty check:      ${LOG_DIR}/HONESTY-CHECK.md"
  echo "Check index:        ${CHECK_DIR}/INDEX.md"
  echo "Hash chain:         ${LOG_DIR}/HASHES.sha256"
  echo ""
  echo "AI coder: Send the phase report to Ken."
  echo "Ken: Review the evidence manifest and check index."
  exit 0
else
  echo ""
  echo "❌ Phase $PHASE has FAILED verification."
  echo ""
  echo "Failures:"
  for reason in "${FAIL_REASONS[@]}"; do
    echo "  - $reason"
  done
  echo ""
  echo "AI coder: DO NOT send phase report. Fix the issues and re-run."
  echo "AI coder: DO NOT mark this phase complete."
  echo "AI coder: Per the constitution, lying about phase status is a violation."
  exit 1
fi
