#!/usr/bin/env bash
# Bug 1286 fix. Production builds must not ship config placeholders.
# Refuses if any of these tokens appear under apps/mobile/:
#   YOUR_GOOGLE_MAPS_API_KEY  — original placeholder from app.json
#   YOUR_EAS_PROJECT_ID       — ditto
#   DEV_MISSING_              — sentinel produced by app.config.ts when the
#                                env var is unset on a non-prod machine
#
# Excludes app.config.ts itself (the literal "DEV_MISSING_" string lives
# there as a code constant) and anything under node_modules / build output.

set -euo pipefail

VIOLATIONS=0

scan() {
  local pattern="$1"
  local label="$2"
  local matches
  matches=$(grep -r --line-number \
    --exclude-dir=node_modules \
    --exclude-dir=android \
    --exclude-dir=ios \
    --exclude-dir=.expo \
    --exclude-dir=dist \
    --exclude=app.config.ts \
    --exclude=a-cross-source-no-google-maps-placeholder.sh \
    "$pattern" apps/mobile/ 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "GATE A VIOLATION (Bug 1286) — $label:"
    echo "$matches"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

scan "YOUR_GOOGLE_MAPS_API_KEY" "Google Maps placeholder"
scan "YOUR_EAS_PROJECT_ID"      "EAS project id placeholder"
scan "DEV_MISSING_"             "DEV_MISSING sentinel from unset env vars"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "Gate A — placeholders found: FAIL ($VIOLATIONS pattern(s))"
  exit 1
fi
echo "Gate A — no Google Maps / EAS placeholders: OK"
