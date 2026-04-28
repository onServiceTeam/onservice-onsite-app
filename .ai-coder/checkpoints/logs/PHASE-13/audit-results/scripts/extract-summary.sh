#!/bin/bash
# Extract introduced counts from committed and fresh logs
LOGS_ROOT=".ai-coder/checkpoints/logs"
OUT=".ai-coder/checkpoints/logs/PHASE-13/audit-results/SUMMARY.tsv"

extract_introduced() {
  local f="$1"
  if [ ! -f "$f" ]; then echo "MISSING"; return; fi
  local v=$(grep -E "Violations introduced by this phase|Tests introduced by this phase|Phantom tests introduced by this phase|N\\+1 patterns introduced by this phase|Emoji introduced by this phase|introduced by this phase" "$f" 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1)
  if [ -z "$v" ]; then
    # Try gate result line
    local gate=$(grep -E "^GATE:" "$f" | head -1)
    if echo "$gate" | grep -q PASS; then echo "0(PASS)"; else echo "?($gate)"; fi
  else
    echo "$v"
  fi
}

extract_absolute() {
  local f="$1"
  if [ ! -f "$f" ]; then echo "MISSING"; return; fi
  local v=$(grep -E "Absolute|in repo|total" "$f" 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1)
  echo "${v:-?}"
}

printf "PHASE\tcheck\tcommitted_introduced\tfresh_introduced\tcommitted_absolute\tfresh_absolute\tcommitted_gate\tfresh_gate\n" > "$OUT"

for NN in 00 01 02 03 04 05 06 07 08 09 10 11 12; do
  for KIND in forbidden emoji phantom nplus1; do
    case "$KIND" in
      forbidden) COMMITTED="$LOGS_ROOT/PHASE-$NN/gates/gate-1-forbidden.log" ;;
      emoji)     COMMITTED="$LOGS_ROOT/PHASE-$NN/gates/gate-1-emoji.log" ;;
      phantom)   COMMITTED="$LOGS_ROOT/PHASE-$NN/gates/gate-1-phantom-tests.log" ;;
      nplus1)    COMMITTED="$LOGS_ROOT/PHASE-$NN/gates/gate-5-n-plus-1.log" ;;
    esac
    FRESH="$LOGS_ROOT/PHASE-13/audit-results/PHASE-$NN-$KIND.log"
    CI=$(extract_introduced "$COMMITTED")
    FI=$(extract_introduced "$FRESH")
    CA=$(extract_absolute "$COMMITTED")
    FA=$(extract_absolute "$FRESH")
    CG=$(grep -E "^GATE:" "$COMMITTED" 2>/dev/null | head -1 | sed 's/^GATE: //')
    FG=$(grep -E "^GATE:" "$FRESH" 2>/dev/null | head -1 | sed 's/^GATE: //')
    printf "PHASE-%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$NN" "$KIND" "${CI:-?}" "${FI:-?}" "${CA:-?}" "${FA:-?}" "${CG:-?}" "${FG:-?}" >> "$OUT"
  done
done

cat "$OUT"
