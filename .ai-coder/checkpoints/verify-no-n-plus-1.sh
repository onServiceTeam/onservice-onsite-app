#!/bin/bash
# verify-no-n-plus-1.sh
#
# Heuristically detects loops that contain database/service calls (the N+1
# laziness pattern).
#
# MODES:
#   Legacy (no --phase):  fails on any unjustified SAFE-N+1 marker.
#                         Suspicious patterns produce a warning + artifact log
#                         (no auto-fail; requires human review).
#   Baseline-delta (--phase PHASE-NN):
#                         fails on unjustified SAFE-N+1 markers introduced this
#                         phase, AND on any new suspicious-pattern locations
#                         introduced this phase. See TD-001.

set -e

PHASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SUSPICIOUS_FILE=$(mktemp)
UNJUSTIFIED_FILE=$(mktemp)
trap "rm -f $SUSPICIOUS_FILE $UNJUSTIFIED_FILE ${SUSPICIOUS_FILE}.delta ${UNJUSTIFIED_FILE}.delta" EXIT

echo "--- Checking for N+1 query patterns ---"

# Suspicious: loops within services followed within 10 lines by a db query.
# Lines that carry a justified `// SAFE-N+1: <reason>` annotation are excluded.
# Reason text must be SUBSTANTIVE: at least 40 chars after the colon-space.
# This prevents drive-by `// SAFE-N+1: x` placeholder annotations.
grep -rEn "(for\s*\(.*of|\.forEach|\.map\s*\()" packages/api/src/services 2>/dev/null \
  | grep -v node_modules \
  | grep -v __tests__ \
  | grep -vE "SAFE-N\+1:\s+\S.{40,}" \
  | while IFS=: read -r file line content; do
      end=$((line + 10))
      if sed -n "${line},${end}p" "$file" 2>/dev/null \
         | grep -qE "(db\.query|pool\.query|\.findOne|\.findMany|service\.\w+\(|Service\.\w+\()"; then
        printf '%s:%s:%s\n' "$file" "$line" "$content" >> "$SUSPICIOUS_FILE"
      fi
  done || true

sort -u -o "$SUSPICIOUS_FILE" "$SUSPICIOUS_FILE"
SUSPICIOUS_ABS=$(wc -l < "$SUSPICIOUS_FILE" | tr -d ' ')

# Unjustified SAFE-N+1 markers — reason text must be SUBSTANTIVE: at least 40
# characters after the colon-space. A bare `// SAFE-N+1: x` is now unjustified.
grep -rn "SAFE-N+1" packages/api/src 2>/dev/null \
  | grep -vE "SAFE-N\+1:\s+\S.{40,}" >> "$UNJUSTIFIED_FILE" || true

sort -u -o "$UNJUSTIFIED_FILE" "$UNJUSTIFIED_FILE"
UNJUSTIFIED_ABS=$(wc -l < "$UNJUSTIFIED_FILE" | tr -d ' ')

if [ -n "$PHASE" ]; then
  source "$(dirname "$0")/lib/baseline-diff.sh"
  filter_to_phase_diff "$PHASE" < "$SUSPICIOUS_FILE" > "${SUSPICIOUS_FILE}.delta" || true
  filter_to_phase_diff "$PHASE" < "$UNJUSTIFIED_FILE" > "${UNJUSTIFIED_FILE}.delta" || true
  SUSPICIOUS_DELTA=$(wc -l < "${SUSPICIOUS_FILE}.delta" | tr -d ' ')
  UNJUSTIFIED_DELTA=$(wc -l < "${UNJUSTIFIED_FILE}.delta" | tr -d ' ')

  report_baseline_delta "gate-5-n-plus-1 (suspicious patterns)" "$SUSPICIOUS_ABS" "$SUSPICIOUS_DELTA" "$SUSPICIOUS_FILE"
  echo ""
  report_baseline_delta "gate-5-n-plus-1 (unjustified SAFE-N+1 markers)" "$UNJUSTIFIED_ABS" "$UNJUSTIFIED_DELTA" "$UNJUSTIFIED_FILE"

  EXIT_CODE=0
  if [ "$UNJUSTIFIED_DELTA" -gt 0 ]; then
    echo ""
    echo "FAIL: ${PHASE} introduced ${UNJUSTIFIED_DELTA} unjustified SAFE-N+1 marker(s):"
    cat "${UNJUSTIFIED_FILE}.delta"
    EXIT_CODE=1
  fi
  if [ "$SUSPICIOUS_DELTA" -gt 0 ]; then
    echo ""
    echo "WARN/FAIL: ${PHASE} introduced ${SUSPICIOUS_DELTA} suspicious N+1 pattern location(s):"
    cat "${SUSPICIOUS_FILE}.delta"
    echo ""
    echo "Each must be reviewed. If genuinely O(N) DB calls, refactor (WHERE id IN, JOIN, batch loader)."
    echo "If intentional and bounded, add comment '// SAFE-N+1: <reason>' on the loop line."
    EXIT_CODE=1
  fi

  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "GATE: PASS (no new N+1 patterns introduced by ${PHASE})"
  fi
  exit $EXIT_CODE
fi

# === LEGACY MODE ===
if [ "$SUSPICIOUS_ABS" -gt 0 ]; then
  echo "WARNING: Possible N+1 patterns detected (${SUSPICIOUS_ABS}):"
  cat "$SUSPICIOUS_FILE"
  echo ""
  echo "Each location MUST be reviewed. Refactor or annotate '// SAFE-N+1: <reason>'."
  ARTIFACT=".ai-coder/checkpoints/logs/n-plus-1-suspicious-$(date +%Y%m%d-%H%M%S).log"
  cp "$SUSPICIOUS_FILE" "$ARTIFACT"
  echo "Logged to $ARTIFACT for review."
fi

if [ "$UNJUSTIFIED_ABS" -gt 0 ]; then
  echo ""
  echo "FAIL: SAFE-N+1 markers without justification:"
  cat "$UNJUSTIFIED_FILE"
  exit 1
fi

echo ""
echo "PASS: No unjustified N+1 patterns."
exit 0
