#!/bin/bash
# verify-no-n-plus-1.sh
#
# Defends against The N+1 laziness pattern.
# Heuristically detects loops that contain database calls.

set -e

EXIT_CODE=0

echo "--- Checking for N+1 query patterns ---"

# Look for loops (for, forEach, map, Promise.all on map) followed by db calls
# This is a heuristic — false positives possible — but flags suspicious patterns
SUSPICIOUS=$(grep -rEn "(for\s*\(.*of|\.forEach|\.map\s*\()" packages/api/src/services 2>/dev/null \
  | grep -v node_modules \
  | grep -v __tests__ \
  | while IFS=: read -r file line content; do
      # Check next 10 lines for db query
      end=$((line + 10))
      if sed -n "${line},${end}p" "$file" 2>/dev/null \
         | grep -qE "(db\.query|pool\.query|\.findOne|\.findMany|service\.\w+\(|Service\.\w+\()"; then
        echo "$file:$line"
      fi
  done)

if [ -n "$SUSPICIOUS" ]; then
  echo "WARNING: Possible N+1 patterns detected:"
  echo "$SUSPICIOUS"
  echo ""
  echo "Each location MUST be reviewed. If genuinely O(N) DB calls, refactor with:"
  echo "  - Single query with WHERE id IN (...)"
  echo "  - Single query with JOIN"
  echo "  - Batch loader pattern"
  echo ""
  echo "If the pattern is intentional (e.g., parallel external API calls with bounded"
  echo "concurrency), add a comment '// SAFE-N+1: <reason>' on the loop line."
  echo ""

  # Don't auto-fail; require human review. But log to artifact.
  ARTIFACT=".ai-coder/checkpoints/logs/n-plus-1-suspicious-$(date +%Y%m%d-%H%M%S).log"
  echo "$SUSPICIOUS" > "$ARTIFACT"
  echo "Logged to $ARTIFACT for review."
fi

# Confirm no SAFE-N+1 markers without justification
UNJUSTIFIED=$(grep -rn "SAFE-N+1" packages/api/src 2>/dev/null \
  | grep -vE "SAFE-N\+1:\s+\S+" || true)

if [ -n "$UNJUSTIFIED" ]; then
  echo ""
  echo "FAIL: SAFE-N+1 markers without justification:"
  echo "$UNJUSTIFIED"
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "PASS: No unjustified N+1 patterns."
fi

exit $EXIT_CODE
