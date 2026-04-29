#!/usr/bin/env bash
# Bug 1324 fix. Brand primary #1B3A4B everywhere; old hex values forbidden.

set -euo pipefail

old_colors=("#0066FF" "#0F62FE" "0066ff" "0f62fe")
fail=0
for color in "${old_colors[@]}"; do
  hits=$(grep -rE "$color" apps/ packages/ \
    --include="*.ts" --include="*.tsx" --include="*.css" \
    2>/dev/null | grep -v "design-tokens/" || true)
  if [ -n "$hits" ]; then
    echo "GATE A VIOLATION (Bug 1324): old brand color $color found"
    echo "$hits"
    fail=1
  fi
done
test $fail -eq 0 && echo "Gate A — brand color single source: OK" || exit 1
