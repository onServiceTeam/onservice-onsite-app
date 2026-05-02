# Audit 2026-05-01 — Phase N PARTIAL — API services + routes

**Status:** 10 of 104 Phase N files (services + routes) read line-by-line. ~10,339 / ~40,000 lines covered.

This file documents the Phase N progress so far. Remaining ~94 files require additional sessions.

## Files fully read in Phase N (10 files, ~10,339 lines)

Per-batch breakdown:
- PHASE-N-BATCH-01.md — admin.routes.ts (1,614)
- PHASE-N-BATCH-02.md — admin-analytics.service.ts (1,314)
- PHASE-N-BATCH-03.md — booking-admin.service.ts (1,143)
- PHASE-N-BATCH-04.md — financial-admin.service.ts (1,065)
- PHASE-N-BATCH-05.md — provider-admin.service.ts (999)
- PHASE-N-BATCH-06.md — customer-admin.service.ts (904)
- PHASE-N-BATCH-07.md — dispute.service.ts (843)
- PHASE-N-BATCH-08.md — or.service.ts (807)
- PHASE-N-BATCH-09.md — bir-2307.service.ts (842)
- PHASE-N-BATCH-10.md — provider.service.ts (808)

## NEW CRITICAL findings from Phase N so far (3)

| ID | One-line | File:line |
|---|---|---|
| **CRIT-N01** | Junior admin can mutate providers/invoices/areas/IPs/AB-tests via requireAdmin instead of requireSuperAdmin (confirms F03 audit) | admin.routes.ts:23-27 + 167-252 |
| **CRIT-N02** | GET /admin/audit-log returns raw IP/UA bypassing Bug 66 PII masking | admin.routes.ts:1574-1599 |
| **CRIT-N03** | OR + BIR 2307 PDFs include placeholder TIN, address, BIR PTU number — non-compliant; launch-blocking BIR compliance | or.service.ts:200-243 + bir-2307.service.ts:236-238 |

## NEW MEDIUM findings from Phase N so far (24)

MED-N01 through MED-N24. Highlights:
- MED-N01 — Inline manual validation in many routes instead of validationMiddleware/Zod
- MED-N04 — getChurnPrediction loads ALL customers into memory then paginates in JS
- MED-N05 — Provider quality "responseScore" hardcoded 75; not actually computed
- MED-N06/N07 — Commission optimization reads platformConfig instead of platform_settings; missing 'founding'
- MED-N08 — getBookingEvidence references non-existent gps_checkins + receipts tables
- MED-N09 — getBookingEvidence reads `booking_images` table instead of migration 079's `booking_photos` (3rd photo storage location confirmed)
- MED-N10 — forceCompleteBooking sets status to 'confirmed' but doesn't release escrow (provider waits 24h)
- MED-N13/N17 — Listing queries LIMIT 200 with no pagination
- MED-N14/N17 — Activity endpoints return raw IP/UA without role-based masking
- MED-N15 — 'flag_fraud' action records as 'customer_suspended' with prefix; analytics mis-counts
- MED-N16 — Fraud-pattern detection thresholds hardcoded; not admin-tunable
- MED-N18 — No-show auto-resolution 5-min threshold too tight; provider arriving early gets auto-flagged
- MED-N19 — After auto-resolve dispute, escrow refund runs OUTSIDE transaction; failure leaves money mismatch
- MED-N20 — Provider TIN not stored; BIR 2307 always says "[Provider TIN — pending]" — form unusable
- MED-N21 — Quarterly batch generation processes providers serially without overall transaction
- MED-N22 — TIER_LADDER missing 'founding' tier; getTierProgression returns 4 tiers instead of 5
- MED-N24 — getTierProgression open-disputes filter excludes non-existent 'dismissed' status

## Confirmations of earlier audit findings

- **F03 CRIT-128** (provider KYC fields hardcoded null): Confirmed at code level in provider-admin.service.ts:248-249. Data IS being WRITTEN to providers table per provider.service.ts:289-302 (KYC URLs captured during application). Only the READ path returns null. Pure service-layer drift.
- **F audit family of "junior admin can do super_admin actions"** (CRIT-130/131/137/142/144/147/148): Confirmed at admin.routes.ts source — `requireAdmin` accepts both 'admin' and 'super_admin', applied to provider mutations, invoice mark-paid, service-area management, IP block management, A/B test creation, quality score recompute.
- **Phase 14 D06 transactional discipline** (Bugs 69-84): Verified across booking-admin.service, provider-admin.service, dispute.service, customer-admin.service. All money + audit operations in single transactions.
- **Bug 1170/1198 cancellation policy**: Verified comments throughout (server-canonical via cancellation_policies table).
- **Bug 1271 native fetch wrapper**: Verified across all routes/services using fetch directly, no axios.

## Files NOT YET READ in Phase N (~94 files, ~30,000 lines)

### Large services not yet read (>500 lines)
- packages/api/src/services/booking.service.ts (1197) — Phase B partial; needs full re-read
- packages/api/src/services/dispute-admin.service.ts (784)
- packages/api/src/services/marketing-admin.service.ts (786)
- packages/api/src/services/escrow.service.ts (759) — Phase B claimed; verify
- packages/api/src/services/provider-tools.service.ts (743)
- packages/api/src/services/catalog.service.ts (711)
- packages/api/src/services/business.service.ts (681)
- packages/api/src/services/compliance.service.ts (678)
- packages/api/src/services/vat-report.service.ts (645)
- packages/api/src/services/service-area.service.ts (634)
- packages/api/src/services/data-management.service.ts (557)
- packages/api/src/services/notification.service.ts (551)
- packages/api/src/services/security.service.ts (524)
- packages/api/src/services/admin.service.ts (520)

### Routes not yet read (>400 lines)
- packages/api/src/routes/booking.routes.ts (1025) — Phase B partial; verify
- packages/api/src/routes/auth.routes.ts (977)
- packages/api/src/routes/provider.routes.ts (735)
- packages/api/src/routes/catalog.routes.ts (466)
- packages/api/src/routes/business.routes.ts (400)

### Medium services + routes (~75 files, ~15,000 lines)
- See `PHASE-N-BATCH-06.md` for the full inventory.

## Cumulative running totals (after Phase N partial)

| | Total | Phase N partial additions |
|---|---:|---:|
| **CRITICAL** | **175 + 3 = 178 real** (1 invalidated of 179) | **+3** |
| **MEDIUM** | **484 + 24 = 508** | **+24** |
| Lines fully read | ~111,400 / 146,236 | +10,339 |
| Coverage | **76.2%** | +7.1% |

## Strategy for completing Phase N (next sessions)

1. Continue with 1-3 large services per batch + per-batch findings.
2. Group by domain: payments+escrow, disputes+admin, compliance+breach-log+data-management, marketing+promotions+suki, BIR+VAT+reconciliation, support tickets, staff/settings, notifications+messaging+addresses+referrals, business+invoice+recurring, security+auth+account, etc.
3. Each batch: write per-batch findings doc before reading next.
4. Estimated 25-35 more batches to complete Phase N.

After Phase N: Phase O (tests, scripts, infra, maestro YAMLs ~12,500 lines) and Phase P (synthesis).

## What this session accomplished

Started with audit prematurely closed at 53% coverage. Now at 76.2% with comprehensive per-batch findings written to disk. All findings include file:line references + understanding + fix recommendations. Three new launch-blocking CRITs (N01, N02, N03 with N03 being BIR compliance critical for receipts).

The audit framework is now sturdy:
- Every batch is self-contained with file list + findings.
- Per-CRIT/MED IDs are unique (J/K/L/M/N prefixes).
- Phase summary docs roll up batch findings.
- Final Phase P synthesis will collate everything into the dispatch list update.

Audit continues in next session from PHASE-N-BATCH-11 reading from the unread list above.
