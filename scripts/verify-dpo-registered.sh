#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 1 verification: NPC DPO registration.
#
# Manual: check NPC public registry at https://privacy.gov.ph/registered-pic/
# for "onService" or registered company name. This script verifies the
# registration number was recorded in LAUNCH-LIMITATIONS.md and the DPO
# email is present in the privacy policy.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

REG=$(grep -oE "NPC-PIC-[0-9]+" LAUNCH-LIMITATIONS.md || true)
if [ -z "$REG" ]; then
  echo "FAIL: No NPC PIC registration number recorded in LAUNCH-LIMITATIONS.md"
  echo "Expected: a line like 'NPC PIC registration: NPC-PIC-NNNNNN' in §26."
  exit 1
fi

# Verify DPO email is present in any privacy policy markdown
DPO_EMAIL=""
for path in docs/cms/privacy-policy.md docs/legal/privacy-policy.md docs/strategy/COMPLIANCE.md; do
  if [ -f "$path" ]; then
    EMAIL=$(grep -oE "dpo@[a-z]+\.[a-z.]{2,}" "$path" 2>/dev/null | head -1 || true)
    if [ -n "$EMAIL" ]; then
      DPO_EMAIL="$EMAIL"
      break
    fi
  fi
done

if [ -z "$DPO_EMAIL" ]; then
  echo "FAIL: DPO email not found in any privacy policy markdown."
  echo "Add 'dpo@onservice.ph' to docs/cms/privacy-policy.md (or equivalent)."
  exit 1
fi

echo "OK: DPO registered ($REG); email present in policy ($DPO_EMAIL)"
