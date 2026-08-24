#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 2 verification: BIR invoice authority + series.
#
# OPS-205: this verifier deliberately fails closed. The prior version checked
# three environment variables that no application code reads and could report
# success without proving that the generated document used an authorized
# series. See E22 before implementing a replacement.

set -euo pipefail

echo "FAIL: BIR invoice authority/series is not wired to the application."
echo "The previous BIR_OR_SERIES_* variables were dead configuration and the"
echo "application currently generates its own monthly OR-YYYY-MM-###### sequence."
echo "Resolve .ai-coder/escalations/E22-bir-invoice-numbering-and-fake-verifiers-2026-08-24.md"
echo "with the Philippine accountant/tax counsel before this item can pass."
exit 1
