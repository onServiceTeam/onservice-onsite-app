#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 8 verification: S3 BIR bucket Object Lock + KMS.
#
# Requires aws CLI configured with read access to the production BIR bucket.

set -euo pipefail

BUCKET="${BIR_BUCKET:-onservice-bir-receipts-prod}"

if ! command -v aws >/dev/null 2>&1; then
  echo "FAIL: aws CLI not installed"
  exit 1
fi

# 1. Object Lock 10y compliance
LOCK_YEARS=$(aws s3api get-object-lock-configuration --bucket "$BUCKET" 2>/dev/null \
  | grep -oE '"Years":[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+' || true)

if [ -z "$LOCK_YEARS" ] || [ "$LOCK_YEARS" -lt 10 ]; then
  echo "FAIL: Object Lock retention is not >= 10 years (got: ${LOCK_YEARS:-none})"
  exit 1
fi

LOCK_MODE=$(aws s3api get-object-lock-configuration --bucket "$BUCKET" 2>/dev/null \
  | grep -oE '"Mode":[[:space:]]*"[A-Z]+"' | grep -oE '"[A-Z]+"' | tr -d '"' || true)

if [ "$LOCK_MODE" != "COMPLIANCE" ]; then
  echo "FAIL: Object Lock mode is not COMPLIANCE (got: ${LOCK_MODE:-none})"
  exit 1
fi

# 2. KMS encryption
ENC_OUT=$(aws s3api get-bucket-encryption --bucket "$BUCKET" 2>/dev/null || true)
if ! echo "$ENC_OUT" | grep -q "aws:kms"; then
  echo "FAIL: KMS-SSE not enabled on $BUCKET"
  exit 1
fi

# 3. Versioning
VER=$(aws s3api get-bucket-versioning --bucket "$BUCKET" 2>/dev/null \
  | grep -oE '"Status":[[:space:]]*"[A-Za-z]+"' | grep -oE '"[A-Za-z]+"' | tr -d '"' || true)

if [ "$VER" != "Enabled" ]; then
  echo "FAIL: Versioning not Enabled on $BUCKET (got: ${VER:-none})"
  exit 1
fi

echo "OK: BIR bucket $BUCKET — Object Lock COMPLIANCE 10y + KMS-SSE + versioning enabled"
