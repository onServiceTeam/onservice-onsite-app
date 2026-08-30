# E31 - Manual wallet adjustments remain unbounded and single-operator

**Date:** 2026-08-30
**Status:** OPEN
**Hard stop:** direct customer/provider money movement

## Finding

Customer 360 and Provider 360 permit a super-admin to submit a manual wallet adjustment without a final balance preview, amount cap, or second-person approval. The server correctly prevents a negative resulting balance and keeps the ledger update atomic, but it cannot distinguish a legitimate large adjustment from an extra-zero mistake.

This is historical CRIT-133. The earlier audit proposed a configurable maximum and dual control, while Phase 05 explicitly deferred the dual-control model. No approved thresholds or pending-adjustment schema currently exist.

## Required decision

Use `.ai-coder/decisions/D33-admin-wallet-adjustment-controls.md`. Option A, server-authoritative limits plus confirmation and a different-super-admin approval for large adjustments, is recommended.

## Work paused

Do not change amount limits, invent approval thresholds, or alter wallet behavior until the money-control contract is approved. Read-only payment linkage and unrelated admin work may continue.
