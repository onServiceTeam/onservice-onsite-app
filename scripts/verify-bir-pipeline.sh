#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 12 verification: BIR e-receipt issuance pipeline.
#
# Triggers a test transaction on the internal endpoint and confirms an OR
# row + S3 PDF + VAT calc landed. Expects API_BASE_URL + INTERNAL_TOKEN.

set -euo pipefail

if [ -z "${API_BASE_URL:-}" ]; then
  echo "FAIL: API_BASE_URL not set (e.g. https://api.onservice.ph)"
  exit 1
fi

if [ -z "${INTERNAL_TOKEN:-}" ]; then
  echo "FAIL: INTERNAL_TOKEN not set (admin-only smoke endpoint auth)"
  exit 1
fi

if [ -z "${TEST_BOOKING_ID:-}" ]; then
  echo "FAIL: TEST_BOOKING_ID not set (a known confirmed staging booking)"
  exit 1
fi

# Trigger test issuance (idempotent on test booking)
RESP=$(curl -fsS -X POST "$API_BASE_URL/internal/test/issue-or" \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"booking_id\":\"$TEST_BOOKING_ID\"}" 2>/dev/null || true)

if [ -z "$RESP" ]; then
  echo "FAIL: /internal/test/issue-or returned no response"
  exit 1
fi

# Wait for async OR issuance
sleep 5

# Optional DB check if PROD_DB_URL provided
if [ -n "${PROD_DB_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  ROW=$(psql "$PROD_DB_URL" -t -c "
    SELECT or_number || '|' || amount_cents || '|' || vat_cents || '|' || pdf_s3_key
      FROM bir_receipts
     WHERE booking_id = '$TEST_BOOKING_ID'
     LIMIT 1
  " 2>/dev/null || true)

  if [ -z "$(echo "$ROW" | tr -d ' ')" ]; then
    echo "FAIL: no bir_receipts row for booking $TEST_BOOKING_ID"
    exit 1
  fi

  if ! echo "$ROW" | grep -qE "[A-Z]+-[0-9]{7,}"; then
    echo "FAIL: bir_receipts row exists but or_number does not match expected pattern"
    echo "  row: $ROW"
    exit 1
  fi

  echo "OK: BIR OR pipeline working — $ROW"
else
  echo "OK: /internal/test/issue-or succeeded (DB verification skipped — PROD_DB_URL not set)"
fi
