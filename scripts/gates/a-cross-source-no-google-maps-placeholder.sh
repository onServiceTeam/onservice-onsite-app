#!/usr/bin/env bash
# Bug 1286 fix. Production builds must not ship YOUR_GOOGLE_MAPS_API_KEY placeholder.

set -euo pipefail

if grep -r "YOUR_GOOGLE_MAPS_API_KEY" apps/mobile/ 2>/dev/null; then
  echo "GATE A VIOLATION (Bug 1286): Google Maps placeholder found"
  exit 1
fi
echo "Gate A — no Google Maps placeholder: OK"
