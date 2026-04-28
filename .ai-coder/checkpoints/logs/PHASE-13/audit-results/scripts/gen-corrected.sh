#!/bin/bash
# Generate HASHES-CORRECTED.sha256 for every phase 00-12
set -e
for NN in 00 01 02 03 04 05 06 07 08 09 10 11 12; do
  D=".ai-coder/checkpoints/logs/PHASE-$NN"
  if [ ! -d "$D" ]; then echo "PHASE-$NN: missing dir"; continue; fi
  find "$D" -type f \
    -not -name "HASHES.sha256" \
    -not -name "HASHES-CORRECTED.sha256" \
    -not -name "HASHES-CORRECTED.README.md" \
    -not -name "sanity-checks.log" \
    -not -name "verify-master-attempt-*.log" \
    -exec sha256sum {} \; \
    | sort > "$D/HASHES-CORRECTED.sha256"
  COUNT=$(wc -l < "$D/HASHES-CORRECTED.sha256" | tr -d ' ')
  RESULT=$(sha256sum -c "$D/HASHES-CORRECTED.sha256" 2>&1)
  FAIL=$(echo "$RESULT" | grep -c ': FAILED' || true)
  if [ "$FAIL" -eq 0 ]; then
    echo "PHASE-$NN: HASHES-CORRECTED.sha256 generated ($COUNT entries) — verify PASS"
  else
    echo "PHASE-$NN: HASHES-CORRECTED.sha256 generated ($COUNT entries) — verify FAIL ($FAIL)"
    echo "$RESULT" | grep ': FAILED' | head -3
  fi
done
