#!/bin/bash
# Phase 13 Dispatch A — CLEAN re-run with -f (force) to prevent working-tree carryover
set +e
OUT=".ai-coder/checkpoints/logs/PHASE-13/audit-results-v2"
mkdir -p "$OUT"

declare -A SHAS=(
  [00]=e6e09da [01]=05c1f74 [02]=9695431 [03]=02aeed3
  [04]=931eabe [05]=81c4406 [06]=a8a2b2d [07]=ff288c4
  [08]=7d1fcf2 [09]=165dd1d [10]=a1c4859 [11]=c499644
  [12]=bfdd2d5
)

# Stash any pending state including untracked PHASE-13 work
git stash push --include-untracked -m "phase-13-audit-v2" >/dev/null 2>&1

for NN in 00 01 02 03 04 05 06 07 08 09 10 11 12; do
  SHA="${SHAS[$NN]}"
  echo "=== PHASE-$NN @ $SHA ===" >&2
  # Force checkout — discard any working-tree mods
  git checkout -f "$SHA" >/dev/null 2>&1
  # Recreate the audit-results dir (it's outside the tracked tree only when at phase/13)
  mkdir -p "$OUT"
  for KIND in forbidden emoji phantom-tests n-plus-1; do
    SHORT="$KIND"
    [ "$KIND" = "phantom-tests" ] && SHORT="phantom"
    [ "$KIND" = "n-plus-1" ] && SHORT="nplus1"
    if [ -f ".ai-coder/checkpoints/verify-no-$KIND.sh" ]; then
      bash --noprofile --norc ".ai-coder/checkpoints/verify-no-$KIND.sh" --phase "PHASE-$NN" > "$OUT/PHASE-$NN-$SHORT.log" 2>&1
      INTRO=$(grep "introduced by this phase" "$OUT/PHASE-$NN-$SHORT.log" | head -1 | grep -oE '[0-9]+' | head -1)
      echo "  $SHORT: introduced=${INTRO:-?}" >&2
    else
      echo "(script not present at $SHA)" > "$OUT/PHASE-$NN-$SHORT.log"
    fi
  done
done

# Return to phase/13-reconciliation and restore stash
git checkout -f phase/13-reconciliation >/dev/null 2>&1
git stash pop >/dev/null 2>&1
echo "=== DONE ===" >&2
