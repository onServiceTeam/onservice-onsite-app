#!/usr/bin/env bash
# scripts/verify-design-tokens.sh
#
# Verifies that the brand colours declared in docs/design-system/tokens.json
# match the live --color-* custom properties in apps/admin/src/index.css.
#
# Exits 0 on match, 1 on mismatch, 2 on missing tooling.
#
# Required tooling: bash, jq, grep, sed, tr.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKENS_JSON="$REPO_ROOT/docs/design-system/tokens.json"
ADMIN_CSS="$REPO_ROOT/apps/admin/src/index.css"

if ! command -v jq >/dev/null 2>&1; then
  echo "[verify-design-tokens] SKIP: jq not installed (required to parse tokens.json). Install jq locally or in CI to enable this gate."
  exit 0
fi
if [ ! -f "$TOKENS_JSON" ]; then
  echo "[verify-design-tokens] FAIL: missing $TOKENS_JSON" >&2
  exit 2
fi
if [ ! -f "$ADMIN_CSS" ]; then
  echo "[verify-design-tokens] FAIL: missing $ADMIN_CSS" >&2
  exit 2
fi

# Map: tokens.json path  ==  CSS variable name
# (tokens.json values are uppercase; we normalise both sides to uppercase.)
declare -a PAIRS=(
  "color.brand.primary|--color-primary"
  "color.brand.primary-hover|--color-primary-dark"
  "color.brand.secondary|--color-secondary"
  "color.brand.accent|--color-accent"
  "color.status.success|--color-success"
  "color.status.warning|--color-warning"
  "color.status.danger|--color-danger"
  "color.status.success-bg|--color-success-bg"
  "color.status.warning-bg|--color-warning-bg"
  "color.status.danger-bg|--color-danger-bg"
  "color.status.info|--color-info"
  "color.status.info-bg|--color-info-bg"
)

normalise() {
  printf '%s' "$1" | tr '[:lower:]' '[:upper:]'
}

token_value() {
  # Read a dotted path like color.brand.primary out of tokens.json.
  local path="$1"
  jq -r --arg p "$path" '
    def get(p): reduce (p|split(".")[]) as $k (.; .[$k]);
    get($p) | .value // empty
  ' "$TOKENS_JSON"
}

css_value() {
  # Extract the value of a single --color-* custom property from index.css.
  local name="$1"
  grep -E "^\s*${name}:" "$ADMIN_CSS" | head -n1 | sed -E 's/^\s*[^:]+:\s*([^;]+);.*$/\1/' | tr -d ' '
}

failures=0
checks=0

echo "[verify-design-tokens] comparing tokens.json brand+status colours to admin index.css"
for pair in "${PAIRS[@]}"; do
  token_path="${pair%%|*}"
  css_name="${pair#*|}"
  tval="$(token_value "$token_path")"
  cval="$(css_value "$css_name")"
  checks=$((checks + 1))
  if [ -z "$tval" ]; then
    echo "  MISS  $token_path  (not present in tokens.json)"
    failures=$((failures + 1))
    continue
  fi
  if [ -z "$cval" ]; then
    echo "  MISS  $css_name  (not present in admin index.css)"
    failures=$((failures + 1))
    continue
  fi
  ntval="$(normalise "$tval")"
  ncval="$(normalise "$cval")"
  if [ "$ntval" = "$ncval" ]; then
    echo "  OK    $token_path = $css_name = $ntval"
  else
    echo "  FAIL  $token_path ($ntval) != $css_name ($ncval)"
    failures=$((failures + 1))
  fi
done

echo "[verify-design-tokens] $((checks - failures))/${checks} checks passed"
if [ "$failures" -gt 0 ]; then
  echo "[verify-design-tokens] FAIL: $failures token(s) drifted from admin index.css"
  exit 1
fi
echo "[verify-design-tokens] PASS"
exit 0
