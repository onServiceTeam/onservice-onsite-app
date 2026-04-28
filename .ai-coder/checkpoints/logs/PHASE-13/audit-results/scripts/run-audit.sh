#!/bin/bash
# Phase 13 Dispatch A — fresh-run all 4 verify-no-* scripts against each phase tip
set +e
OUT=".ai-coder/checkpoints/logs/PHASE-13/audit-results"
mkdir -p "$OUT"

declare -A SHAS=(
  [00]=e6e09da [01]=05c1f74 [02]=9695431 [03]=02aeed3
  [04]=931eabe [05]=81c4406 [06]=a8a2b2d [07]=ff288c4
  [08]=7d1fcf2 [09]=165dd1d [10]=a1c4859 [11]=c499644
  [12]=bfdd2d5
)

for NN in 00 01 02 03 04 05 06 07 08 09 10 11 12; do
  SHA="${SHAS[$NN]}"
  echo "=== PHASE-$NN @ $SHA ==="
  git checkout "$SHA" --quiet 2>&1 | tail -3
  for KIND in forbidden emoji phantom-tests n-plus-1; do
    SHORT="$KIND"
    [ "$KIND" = "phantom-tests" ] && SHORT="phantom"
    [ "$KIND" = "n-plus-1" ] && SHORT="nplus1"
    if [ -x ".ai-coder/checkpoints/verify-no-$KIND.sh" ] || [ -f ".ai-coder/checkpoints/verify-no-$KIND.sh" ]; then
      bash --noprofile --norc ".ai-coder/checkpoints/verify-no-$KIND.sh" --phase "PHASE-$NN" > "$OUT/PHASE-$NN-$SHORT.log" 2>&1
      echo "  $SHORT: exit=$? bytes=$(wc -c < "$OUT/PHASE-$NN-$SHORT.log")"
    else
      echo "  $SHORT: SCRIPT MISSING at this commit"
      echo "(script not present at commit $SHA)" > "$OUT/PHASE-$NN-$SHORT.log"
    fi
  done
  # Discard any modifications to committed phase logs the scripts wrote
  git checkout HEAD -- .ai-coder/ 2>/dev/null
done

git checkout phase/13-reconciliation --quiet
echo "=== DONE ==="
git status --short | head -20
