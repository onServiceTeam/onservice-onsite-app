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
# Gates marked baseline-delta-aware (TD-001) receive --phase and fail only on
# violations introduced this phase. Pre-existing violations are reported
# informationally and accumulated into BASELINE-DEBT.md at the end of this run.
run_gate "gate-1-typecheck" "npm run typecheck" || true
run_gate "gate-1-lint" "npm run lint" || true
run_gate "gate-1-forbidden" "bash .ai-coder/checkpoints/verify-no-forbidden.sh --phase ${PHASE}" || true
run_gate "gate-1-emoji" "bash .ai-coder/checkpoints/verify-no-emoji.sh --phase ${PHASE}" || true
run_gate "gate-1-phantom-tests" "bash .ai-coder/checkpoints/verify-no-phantom-tests.sh --phase ${PHASE}" || true
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
    UI_CHANGES=$( { git diff --name-only "$BASELINE" HEAD 2>/dev/null || true; } | { grep -E "(apps/admin/src|apps/mobile/app|apps/mobile/src|apps/mobile/components).*\.(tsx|jsx)$" || true; } | wc -l)
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
run_gate "gate-5-n-plus-1" "bash .ai-coder/checkpoints/verify-no-n-plus-1.sh --phase ${PHASE}" || true

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

  # Count significant changes in the diff: files added or modified with
  # >= 20 line-changes (added+deleted) OR binary, EXCLUDING governance imports.
  # Excluded prefixes (imported as cohesive units, not authored change-by-change):
  #   .ai-coder/   docs/design-system/   top-level *.md governance docs
  # Sanity entries are required only for meaningful CODE changes.
  if [ -f "${LOG_DIR}/preflight/baseline-commit.txt" ]; then
    BASELINE=$(cat "${LOG_DIR}/preflight/baseline-commit.txt")
    SIGNIFICANT_CHANGES=$( { git diff --numstat "$BASELINE" HEAD 2>/dev/null || true; } \
      | awk '
          $3 ~ /^\.ai-coder\// { next }
          $3 ~ /^docs\/design-system\// { next }
          $3 ~ /^[A-Z0-9_-]+\.md$/ { next }
          ($1 == "-" || $2 == "-") { c++; next }   # binary file
          ($1 + $2) >= 20 { c++ }
          END { print c+0 }
        ')

    if [ "$SANITY_ENTRIES" -lt "$SIGNIFICANT_CHANGES" ]; then
      note_failure "Gate 6: sanity-checks.log has $SANITY_ENTRIES entries but $SIGNIFICANT_CHANGES significant code changes. AI coder skipped the after-every-change ritual."
    fi
  fi
fi

# Run evidence manifest validator
run_gate "gate-6-evidence-audit" "bash .ai-coder/checkpoints/verify-evidence-manifest.sh ${PHASE}" || true

# ===== BASELINE-DEBT.md =====
# TD-001: aggregate the absolute-violation counts from each delta-aware gate
# into a single document. This makes the trend visible across phases and
# satisfies Constitution Article 13's "explicit deferral, not silent skip" rule.
DEBT_FILE="${LOG_DIR}/BASELINE-DEBT.md"
{
  echo "# BASELINE-DEBT — ${PHASE}"
  echo ""
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "Pre-existing repository-wide violations as observed at the END of ${PHASE}."
  echo "Each delta-aware gate reports both absolute and phase-introduced counts;"
  echo "the gate passes when phase-introduced count is zero. Absolute counts"
  echo "must trend toward zero across phases (Phase 02 is the primary cleanup"
  echo "phase for forbidden patterns and emoji-as-icon)."
  echo ""
  echo "## Per-gate absolute counts"
  echo ""
  for gate in gate-1-forbidden gate-1-emoji gate-1-phantom-tests gate-5-n-plus-1; do
    log="${GATE_DIR}/${gate}.log"
    if [ -f "$log" ]; then
      abs=$(grep -oE "Absolute violations in repo: [0-9]+" "$log" | head -1 | awk '{print $NF}')
      delta=$(grep -oE "Violations introduced by this phase: [0-9]+" "$log" | head -1 | awk '{print $NF}')
      [ -z "$abs" ] && abs="?"
      [ -z "$delta" ] && delta="?"
      echo "- **${gate}**: absolute=${abs}, introduced-this-phase=${delta}"
    else
      echo "- **${gate}**: (log missing)"
    fi
  done
  echo ""
  echo "## Trend"
  echo ""
  echo "Compare with prior phases' BASELINE-DEBT.md files in"
  echo "\`.ai-coder/checkpoints/logs/PHASE-*/BASELINE-DEBT.md\` to verify counts"
  echo "are non-increasing (and decreasing on cleanup phases)."
  echo ""
  echo "## Deferred items"
  echo ""
  echo "Each gate's full violation list is in \`gates/<gate>.log\`. The phase's"
  echo "EVIDENCE-MANIFEST.md \"Deferred to later phases\" section names the"
  echo "specific items by file/line and the phase scheduled to fix them."
} > "$DEBT_FILE"
echo "Baseline-debt summary: $DEBT_FILE"

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
