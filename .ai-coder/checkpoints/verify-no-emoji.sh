#!/bin/bash
# verify-no-emoji.sh
#
# Detects emoji used as iconography in React/RN code.
# After Phase 02, the only allowed icons are lucide-react / lucide-react-native.
#
# MODES:
#   Legacy (no --phase):  fails on any emoji-as-icon found.
#   Baseline-delta (--phase PHASE-NN):
#                         fails only on emoji-as-icon introduced this phase.
#                         See TD-001.

set -e

PHASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SEARCH_DIRS="packages/api/src apps/admin/src apps/mobile/app apps/mobile/src apps/mobile/components"
EXCLUDE='--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude=*.test.ts --exclude=*.spec.ts --exclude=*.test.tsx --exclude=*.spec.tsx'

VIOLATIONS_FILE=$(mktemp)
trap "rm -f $VIOLATIONS_FILE ${VIOLATIONS_FILE}.delta ${VIOLATIONS_FILE}.raw" EXIT

EMOJI_PATTERNS=(
  "[📊📈📉]"
  "[💰💵💸💳]"
  "[👤👥👨👩]"
  "[🔧🛠️⚙️]"
  "[📅📆🗓️]"
  "[📝✏️📋]"
  "[🔔🔕]"
  "[✅❌⚠️]"
  "[🏠🏢🏪]"
  "[📞📱📨]"
  "[🚀🎯⭐]"
  "[🔒🔓🔐]"
  "[🎨🖌️]"
  "[📦🛍️]"
  "[🌐🌍🌏]"
  "[🚗🚙🛵]"
)

# Collect all emoji-as-icon hits to VIOLATIONS_FILE (format: file:line:content).
for pattern in "${EMOJI_PATTERNS[@]}"; do
  grep -rEn $EXCLUDE "$pattern" $SEARCH_DIRS 2>/dev/null | while IFS= read -r line; do
    if echo "$line" | grep -qE "// emoji-allowed"; then
      continue
    fi
    printf '%s\n' "$line"
  done >> "$VIOLATIONS_FILE" || true
done

grep -rEn $EXCLUDE \
  "<(Button|Icon|IconButton|MenuItem|NavLink|Tab)[^>]*>[^<]*[😀-🙏🌀-🗿🚀-🛿☀-⛿]" \
  $SEARCH_DIRS 2>/dev/null >> "$VIOLATIONS_FILE" || true

sort -u -o "$VIOLATIONS_FILE" "$VIOLATIONS_FILE"
ABSOLUTE_COUNT=$(wc -l < "$VIOLATIONS_FILE" | tr -d ' ')

if [ -n "$PHASE" ]; then
  source "$(dirname "$0")/lib/baseline-diff.sh"
  filter_to_phase_diff "$PHASE" < "$VIOLATIONS_FILE" > "${VIOLATIONS_FILE}.delta" || true
  DELTA_COUNT=$(wc -l < "${VIOLATIONS_FILE}.delta" | tr -d ' ')

  report_baseline_delta "gate-1-emoji" "$ABSOLUTE_COUNT" "$DELTA_COUNT" "$VIOLATIONS_FILE"

  if [ "$DELTA_COUNT" -gt 0 ]; then
    echo ""
    echo "FAIL: ${PHASE} introduced ${DELTA_COUNT} new emoji-as-icon violation(s):"
    cat "${VIOLATIONS_FILE}.delta"
    echo ""
    echo "Replace with lucide-react / lucide-react-native icons. If intentional"
    echo "content (not iconography), add '// emoji-allowed' comment on same line."
    exit 1
  fi

  echo "GATE: PASS (no new violations introduced by ${PHASE})"
  exit 0
fi

if [ "$ABSOLUTE_COUNT" -gt 0 ]; then
  echo "EMOJI ICONOGRAPHY DETECTED (${ABSOLUTE_COUNT}):"
  head -n 50 "$VIOLATIONS_FILE"
  if [ "$ABSOLUTE_COUNT" -gt 50 ]; then
    echo "... and $((ABSOLUTE_COUNT - 50)) more"
  fi
  echo ""
  echo "FAIL: Emoji detected as iconography. Replace with lucide icons."
  echo "If a specific use is intentional content (not iconography), add '// emoji-allowed' comment."
  exit 1
fi

echo "PASS: No emoji used as iconography."
exit 0
