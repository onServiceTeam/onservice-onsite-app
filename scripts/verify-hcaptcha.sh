#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 5 verification: hCaptcha production keys.
set -euo pipefail

if [ -z "${HCAPTCHA_SITE_KEY:-}" ]; then
  echo "FAIL: HCAPTCHA_SITE_KEY missing"
  exit 1
fi

if [ -z "${HCAPTCHA_SECRET_KEY:-}" ]; then
  echo "FAIL: HCAPTCHA_SECRET_KEY missing"
  exit 1
fi

# Sanity: production keys are NOT the development bypass key
if [ "$HCAPTCHA_SITE_KEY" = "10000000-ffff-ffff-ffff-000000000001" ]; then
  echo "FAIL: HCAPTCHA_SITE_KEY is the public dev-bypass key. Rotate to production."
  exit 1
fi

# Verify against hCaptcha API using the documented test response token
RESP=$(curl -fsS "https://hcaptcha.com/siteverify" \
  -d "secret=$HCAPTCHA_SECRET_KEY&response=10000000-aaaa-bbbb-cccc-000000000001" || true)

if [ -z "$RESP" ]; then
  echo "FAIL: hCaptcha siteverify endpoint unreachable"
  exit 1
fi

echo "OK: hCaptcha keys configured + siteverify reachable"
echo "  site key prefix: ${HCAPTCHA_SITE_KEY:0:8}..."
echo "  test verify resp: $RESP"
