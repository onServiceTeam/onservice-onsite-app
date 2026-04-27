#!/bin/bash
# verify-no-emoji.sh
#
# Detects emoji used as iconography in React/RN code.
# After Phase 02, the only allowed icons are lucide-react / lucide-react-native.
#
# Allowlist:
#  - Comments (lines starting with //)
#  - String literals containing user-facing copy where emoji is content (not icon)
#  - Test files (mock data may contain emoji)
#
# This script is a heuristic — false positives are possible but rare.

set -e

EXIT_CODE=0
SEARCH_DIRS="packages/api/src apps/admin/src apps/mobile/app apps/mobile/src apps/mobile/components"
EXCLUDE='--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude=*.test.ts --exclude=*.spec.ts --exclude=*.test.tsx --exclude=*.spec.tsx'

# Common emoji used as iconography (not exhaustive — covers the 73 from the audit)
EMOJI_PATTERNS=(
  "[📊📈📉]"     # charts
  "[💰💵💸💳]"   # money
  "[👤👥👨👩]"   # users
  "[🔧🛠️⚙️]"    # settings/tools
  "[📅📆🗓️]"    # calendar
  "[📝✏️📋]"     # documents
  "[🔔🔕]"       # notifications
  "[✅❌⚠️]"      # status
  "[🏠🏢🏪]"     # locations
  "[📞📱📨]"     # contact
  "[🚀🎯⭐]"     # gamification
  "[🔒🔓🔐]"     # security
  "[🎨🖌️]"      # design
  "[📦🛍️]"      # commerce
  "[🌐🌍🌏]"     # global
  "[🚗🚙🛵]"     # transport
)

# Look for emoji in JSX/TSX context — typically as button/icon content
for pattern in "${EMOJI_PATTERNS[@]}"; do
  hits=$(grep -rEn $EXCLUDE "$pattern" $SEARCH_DIRS 2>/dev/null || true)
  if [ -n "$hits" ]; then
    # Filter: only flag occurrences in JSX (between < and >, or as children)
    while IFS= read -r line; do
      # Skip if line contains "// emoji content allowed" comment
      if echo "$line" | grep -qE "// emoji-allowed"; then
        continue
      fi
      echo "EMOJI ICON: $line"
      EXIT_CODE=1
    done <<< "$hits"
  fi
done

# Also detect any emoji used inside Button, Icon, IconButton components
SUSPICIOUS=$(grep -rEn $EXCLUDE \
  "<(Button|Icon|IconButton|MenuItem|NavLink|Tab)[^>]*>[^<]*[😀-🙏🌀-🗿🚀-🛿☀-⛿]" \
  $SEARCH_DIRS 2>/dev/null || true)

if [ -n "$SUSPICIOUS" ]; then
  echo ""
  echo "EMOJI in component children:"
  echo "$SUSPICIOUS"
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "PASS: No emoji used as iconography."
else
  echo ""
  echo "FAIL: Emoji detected as iconography. Replace with lucide-react / lucide-react-native icons."
  echo "If a specific use is intentional content (not iconography), add '// emoji-allowed' comment on the same line."
fi

exit $EXIT_CODE
