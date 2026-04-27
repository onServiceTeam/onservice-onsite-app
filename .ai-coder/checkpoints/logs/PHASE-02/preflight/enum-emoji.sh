#!/usr/bin/env bash
SEARCH_DIRS="packages/api/src apps/admin/src apps/mobile/app apps/mobile/src apps/mobile/components"
EXCLUDE="--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude=*.test.ts --exclude=*.spec.ts --exclude=*.test.tsx --exclude=*.spec.tsx"
PATTERNS=(
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
VF="$(mktemp)"
for p in "${PATTERNS[@]}"; do
  grep -rEn $EXCLUDE "$p" $SEARCH_DIRS 2>/dev/null | grep -v "// emoji-allowed" >> "$VF" || true
done
grep -rEn $EXCLUDE "<(Button|Icon|IconButton|MenuItem|NavLink|Tab)[^>]*>[^<]*[😀-🙏🌀-🗿🚀-🛿☀-⛿]" $SEARCH_DIRS 2>/dev/null >> "$VF" || true
sort -u "$VF" > "$VF.s"
mv "$VF.s" "$VF"
echo "TOTAL=$(wc -l < $VF)"
echo "--- BY FILE ---"
cut -d: -f1 < "$VF" | sort | uniq -c | sort -rn
echo "--- ALL ---"
cat "$VF"
rm -f "$VF"
