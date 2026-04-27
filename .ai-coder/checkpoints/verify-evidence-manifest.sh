#!/bin/bash
# verify-evidence-manifest.sh
#
# Final gate. Confirms the AI coder produced an evidence manifest, that every
# claim in the manifest references a real artifact in this phase's log directory,
# and that the artifacts are non-empty and recent.
#
# Usage: bash .ai-coder/checkpoints/verify-evidence-manifest.sh PHASE-NN

set -e

PHASE="${1:-}"
if [ -z "$PHASE" ]; then
  echo "FAIL: Phase argument required. Usage: $0 PHASE-NN"
  exit 1
fi

LOG_DIR=".ai-coder/checkpoints/logs/${PHASE}"
MANIFEST="${LOG_DIR}/EVIDENCE-MANIFEST.md"
HONESTY="${LOG_DIR}/HONESTY-CHECK.md"

EXIT_CODE=0

# 1. Manifest exists
if [ ! -f "$MANIFEST" ]; then
  echo "FAIL: Evidence manifest not found at $MANIFEST"
  echo "AI coder did not produce the required evidence manifest. Phase NOT done."
  exit 1
fi

# 2. Honesty check exists
if [ ! -f "$HONESTY" ]; then
  echo "FAIL: Honesty check not found at $HONESTY"
  echo "AI coder did not complete the final honesty check. Phase NOT done."
  exit 1
fi

# 3. Manifest contains the required sections
required_sections=("Claims and Artifacts" "Self-attestation")
for section in "${required_sections[@]}"; do
  if ! grep -q "$section" "$MANIFEST"; then
    echo "FAIL: Manifest missing required section: $section"
    EXIT_CODE=1
  fi
done

# 4. Every artifact referenced in the manifest exists
echo "Validating referenced artifacts..."
referenced=$(grep -oE "logs/[^ \)]+\.(log|md|png|json|txt)" "$MANIFEST" 2>/dev/null || true)
if [ -z "$referenced" ]; then
  echo "WARN: No artifact references found in manifest. This is suspicious."
  EXIT_CODE=1
fi

while IFS= read -r artifact; do
  full_path=".ai-coder/checkpoints/${artifact}"
  if [ ! -e "$full_path" ]; then
    echo "FAIL: Referenced artifact does not exist: $artifact"
    EXIT_CODE=1
    continue
  fi
  # Check size — empty files are suspicious
  if [ ! -s "$full_path" ]; then
    echo "FAIL: Referenced artifact is EMPTY: $artifact"
    EXIT_CODE=1
    continue
  fi
  # Check recency — older than 24h is suspicious for a "current session" claim
  if [ "$(find "$full_path" -mmin +1440 2>/dev/null)" ]; then
    echo "WARN: Referenced artifact is older than 24 hours: $artifact"
    echo "      AI coder claims to have generated this in current session."
  fi
done <<< "$referenced"

# 5. Required sub-logs from each gate are present
required_logs=(
  "gate-1-typecheck.log"
  "gate-1-lint.log"
  "gate-1-forbidden.log"
  "gate-2-alltests.log"
)

for required in "${required_logs[@]}"; do
  if [ ! -f "${LOG_DIR}/${required}" ]; then
    echo "FAIL: Required gate log missing: ${required}"
    EXIT_CODE=1
  fi
done

# 6. Gate 1 typecheck log must contain "0 errors" (or equivalent)
if [ -f "${LOG_DIR}/gate-1-typecheck.log" ]; then
  if grep -qE "(error TS|errors found|[1-9][0-9]* errors)" "${LOG_DIR}/gate-1-typecheck.log"; then
    if ! grep -qE "(0 errors|Found 0 errors)" "${LOG_DIR}/gate-1-typecheck.log"; then
      echo "FAIL: gate-1-typecheck.log shows TypeScript errors. Phase NOT done."
      EXIT_CODE=1
    fi
  fi
fi

# 7. Gate 2 alltests log must contain a passing line and no failing line
if [ -f "${LOG_DIR}/gate-2-alltests.log" ]; then
  if grep -qE "(failed|FAIL)" "${LOG_DIR}/gate-2-alltests.log"; then
    # Allow the word "fail" only in benign contexts (e.g., test descriptions)
    if grep -qE "Tests:.*[1-9][0-9]* failed" "${LOG_DIR}/gate-2-alltests.log"; then
      echo "FAIL: gate-2-alltests.log shows test failures. Phase NOT done."
      EXIT_CODE=1
    fi
  fi
  if ! grep -qE "Tests:.*passed" "${LOG_DIR}/gate-2-alltests.log"; then
    echo "WARN: gate-2-alltests.log does not show a 'Tests: N passed' line."
    echo "      Verify the test suite actually ran."
  fi
fi

# 8. Self-attestation must contain the required honesty sentence
if [ -f "$MANIFEST" ]; then
  if ! grep -q "I attest" "$MANIFEST"; then
    echo "FAIL: Manifest missing self-attestation sentence."
    EXIT_CODE=1
  fi
fi

# 9. Honesty check answers must not be empty
if [ -f "$HONESTY" ]; then
  size=$(wc -c < "$HONESTY")
  if [ "$size" -lt 200 ]; then
    echo "FAIL: Honesty check is suspiciously short ($size bytes). Real answers required."
    EXIT_CODE=1
  fi
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "PASS: Evidence manifest validated. All artifacts present and sized."
  echo "      Manifest: $MANIFEST"
  echo "      Honesty:  $HONESTY"
else
  echo ""
  echo "FAIL: Evidence audit failed. Phase $PHASE is NOT done."
  echo "      The AI coder must regenerate missing artifacts and re-attest."
fi

exit $EXIT_CODE
