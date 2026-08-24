#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 12 verification: BIR invoice pipeline.
#
# OPS-205: this verifier deliberately fails closed. The prior version called a
# nonexistent endpoint and queried a nonexistent table/columns, then reported
# success without DB evidence when PROD_DB_URL was absent. See E22.

set -euo pipefail

echo "FAIL: the BIR invoice pipeline cannot be certified while E22 is open."
echo "The old verifier targeted /internal/test/issue-or and bir_receipts, neither"
echo "of which exists. A replacement must exercise the approved real route,"
echo "official_receipts storage, PDF archive, VAT math, and authorized sequence."
echo "See .ai-coder/escalations/E22-bir-invoice-numbering-and-fake-verifiers-2026-08-24.md"
exit 1
