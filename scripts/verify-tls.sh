#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 10 verification: DNS + TLS production cutover.
set -euo pipefail

SITES=("${TLS_SITES:-api.onservice.ph admin.onservice.ph}")

# Split into array (handles single string or multi)
read -ra ARR <<< "${SITES[@]}"

fail=0
for site in "${ARR[@]}"; do
  # 200/301/302 OK
  STATUS=$(curl -sI --max-time 10 "https://$site" | head -1 || true)
  if [ -z "$STATUS" ]; then
    echo "FAIL: $site unreachable"
    fail=1
    continue
  fi

  if ! echo "$STATUS" | grep -qE 'HTTP/[0-9.]+ (200|301|302)'; then
    echo "FAIL: $site returned: $STATUS"
    fail=1
    continue
  fi

  # HSTS present
  HSTS=$(curl -sI --max-time 10 "https://$site" | grep -i "strict-transport-security" || true)
  if [ -z "$HSTS" ]; then
    echo "FAIL: $site missing Strict-Transport-Security header"
    fail=1
    continue
  fi

  echo "OK: $site — $STATUS — $HSTS"
done

if [ "$fail" -eq 1 ]; then
  exit 1
fi

echo "OK: TLS + HSTS configured on all sites"
echo
echo "Manual: run https://www.ssllabs.com/ssltest/analyze.html?d=api.onservice.ph"
echo "Expected score: A+ (TLS 1.3, HSTS preload, OCSP stapling)"
