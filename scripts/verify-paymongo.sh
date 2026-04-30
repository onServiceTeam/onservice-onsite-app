#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 7 verification: PayMongo live mode.
set -euo pipefail

if [ -z "${PAYMONGO_SECRET_KEY:-}" ]; then
  echo "FAIL: PAYMONGO_SECRET_KEY missing"
  exit 1
fi

if [[ ! "$PAYMONGO_SECRET_KEY" =~ ^sk_live_ ]]; then
  echo "FAIL: PAYMONGO_SECRET_KEY does not start with 'sk_live_'."
  echo "      Got prefix: ${PAYMONGO_SECRET_KEY:0:8}"
  echo "      Either still in test mode, or wrong env file sourced."
  exit 1
fi

if [ -z "${PAYMONGO_PUBLIC_KEY:-}" ] || [[ ! "$PAYMONGO_PUBLIC_KEY" =~ ^pk_live_ ]]; then
  echo "FAIL: PAYMONGO_PUBLIC_KEY missing or not pk_live_*"
  exit 1
fi

if [ -z "${PAYMONGO_WEBHOOK_SECRET:-}" ]; then
  echo "FAIL: PAYMONGO_WEBHOOK_SECRET missing"
  exit 1
fi

# Hit /v1/accounts/me to confirm live mode
RESP=$(curl -fsS -u "$PAYMONGO_SECRET_KEY:" \
  https://api.paymongo.com/v1/accounts/me 2>/dev/null || true)

if [ -z "$RESP" ]; then
  echo "FAIL: PayMongo /accounts/me unreachable or unauthenticated"
  exit 1
fi

# Crude grep for live_mode true (avoids jq dependency)
if echo "$RESP" | grep -q '"live_mode":true'; then
  echo "OK: PayMongo in live mode"
else
  echo "FAIL: PayMongo /accounts/me did not report live_mode=true"
  echo "$RESP"
  exit 1
fi
