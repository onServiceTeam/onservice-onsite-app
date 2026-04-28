#!/bin/bash
# True Markdown link checker: matches ](path) syntax only, not narrative parens.
broken=0
while IFS= read -r line; do
  f="${line%%:*}"
  # Extract content between ]( and )
  rest="${line#*](}"
  link="${rest%%)*}"
  link_path="${link%%#*}"
  link_path="${link_path%% *}"
  [ -z "$link_path" ] && continue
  case "$link_path" in
    http://*|https://*|mailto:*) continue ;;
  esac
  link_path="${link_path%%\?*}"
  target_dir="$(dirname "$f")"
  if [ -e "$target_dir/$link_path" ] || [ -e "$link_path" ]; then
    :
  else
    echo "BROKEN: $f -> $link_path"
    broken=$((broken+1))
  fi
done < <(
  find . -name '*.md' \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './apps/*/node_modules/*' \
    -not -path './packages/*/node_modules/*' \
    -print0 | \
  xargs -0 grep -HoE '\]\([^)]+\.md[^)]*\)' 2>/dev/null
)
echo "TOTAL BROKEN: $broken"
exit $broken
