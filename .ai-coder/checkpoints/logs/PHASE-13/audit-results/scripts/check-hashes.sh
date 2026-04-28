#!/bin/bash
# Hash-chain check across all phases
for NN in 00 01 02 03 04 05 06 07 08 09 10 11 12; do
  D=".ai-coder/checkpoints/logs/PHASE-$NN"
  if [ ! -f "$D/HASHES.sha256" ]; then
    echo "PHASE-$NN  MISSING HASHES.sha256"
    continue
  fi
  cd "$D"
  RESULT=$(sha256sum -c HASHES.sha256 2>&1)
  TOTAL=$(echo "$RESULT" | grep -cE ': (OK|FAILED)')
  FAIL=$(echo "$RESULT" | grep -c ': FAILED')
  OK=$(echo "$RESULT" | grep -c ': OK')
  if [ "$FAIL" -eq 0 ]; then
    printf "PHASE-%s  HASH-CHAIN: PASS  (%s/%s OK)\n" "$NN" "$OK" "$TOTAL"
  else
    printf "PHASE-%s  HASH-CHAIN: FAIL  (%s OK, %s FAILED of %s)\n" "$NN" "$OK" "$FAIL" "$TOTAL"
    echo "$RESULT" | grep ': FAILED' | sed 's/^/    /'
  fi
  cd - >/dev/null
done
