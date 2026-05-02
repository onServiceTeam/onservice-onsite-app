# Phase B Findings Part 9 — Admin Money Services (booking-admin + financial-admin)

Files added in this batch:
- `services/booking-admin.service.ts` (1,143) — admin Booking 360 page (overview, timeline, evidence, manual escrow ops)
- `services/financial-admin.service.ts` (1,065) — read-only aggregation for the admin Financials page (7 tabs)

**Phase B running total: ~13,599 lines fully read** (was 11,391; +2,208 this batch).

---

## CRITICAL bugs

**None new.** Both files are in good shape relative to the rest of the money-path code:

- `booking-admin.service.ts` correctly uses Phase 14 D06 transaction-aware variants for all sacred mutations:
  - `manualReleaseEscrow` (line 612-684) → `releaseEscrowInTransaction` + audit in same tx + OR post-commit
  - `refundBookingEscrow` (line 690-770) → `refundFromEscrowInTransaction` + audit in same tx + gateway refund post-commit
  - `cancelBookingAsAdmin` (line 854-950) → `handleCancellationInTransaction` + status update + audit in same tx
  - `reassignBookingProvider` (line 776-848) → `SELECT ... FOR UPDATE` + UPDATE + audit in same tx
  - `forceCompleteBooking` (line 956-1011) → same pattern

- `financial-admin.service.ts` is **READ-ONLY** (sacred-file note at line 8-14 explicitly states "ZERO money writes"). Cannot corrupt money state.

This is the model the rest of the codebase should follow. The CRIT bugs found in B01-B08 (multi-step non-atomic flows in `payment.routes`, `webhook.routes`, `workers.ts`, etc.) should be refactored to use this same D06 pattern.

---

## MEDIUM bugs

### MED-55 — COMPLETED_STATUSES_SQL inconsistent across services
**File:** [packages/api/src/services/financial-admin.service.ts:78](packages/api/src/services/financial-admin.service.ts#L78)
```ts
const COMPLETED_STATUSES_SQL = `('completed_by_provider', 'confirmed', 'paid_out')`;
```
Other services use different sets:
- `rebooking.service.ts:111` uses `('confirmed', 'payout_ready', 'paid_out')` — excludes completed_by_provider, includes payout_ready
- `booking.service.ts:354` (listBookings) uses ACTIVE_STATUSES vs COMPLETED_STATUSES vs CANCELLED_STATUSES — yet another classification

So:
- **GMV in admin Financials includes** bookings still awaiting customer confirmation (completed_by_provider).
- **Rebooking history does NOT include** completed_by_provider — customer can't rebook with same provider until confirmed.
- **List bookings (customer view) classifies** completed_by_provider as ACTIVE.

These are all defensible per-context choices, but the inconsistency is a smell. Document the intent OR centralize the classification:

**Fix dispatch:**
```
1. Define one canonical place: types/booking.types.ts:BOOKING_STATUS_GROUPS = {
     active: [...],
     completed: ['completed_by_provider', 'confirmed', 'payout_ready', 'paid_out'],
     completedAndPaid: ['confirmed', 'payout_ready', 'paid_out'],  // for rebooking history
     cancelled: [...],
   }
2. Replace ad-hoc string sets in services with imports from this central source.
3. Add a comment explaining when 'completed_by_provider' should and shouldn't be included.
4. Tests: assert listBookings, financial-admin GMV, rebooking history all use the same imported groups.
```

### MED-56 — Escrow aging buckets hardcoded LIMIT 500
**File:** [packages/api/src/services/financial-admin.service.ts:533](packages/api/src/services/financial-admin.service.ts#L533)
```ts
ORDER BY b.completed_at NULLS LAST
LIMIT 500
```
The aging buckets are computed in JS from this capped list. At >500 pending escrow releases, buckets undercount. For a Boracay launch this is comfortably high, but at scale this misleads ops about how much money is stuck.

**Fix:** compute aging buckets server-side via SQL aggregation (one query for buckets + counts; separate query for the displayed list). Then bucket totals stay accurate at any scale.

### MED-57 — Guarantee fund replenishment threshold hardcoded
**File:** [packages/api/src/services/financial-admin.service.ts:28,736](packages/api/src/services/financial-admin.service.ts#L28)
```ts
const GUARANTEE_FLOOR_CENTAVOS = 1_000_000_00; // ₱1M
// ...
const needsReplenishment = runwayMonths < 3 || balance < GUARANTEE_FLOOR_CENTAVOS;
```
Both `1_000_000_00` (₱1M floor) and `3` (months runway) are hardcoded. Should be platform_settings:
- `guarantee_fund_floor_centavos`
- `guarantee_fund_min_runway_months`

So ops can tune the alert thresholds without redeploy.

### MED-58 — Phase-08-table runtime probes mask migration drift
**Files:**
- [packages/api/src/services/financial-admin.service.ts:64-70](packages/api/src/services/financial-admin.service.ts#L64) (`tableExists`)
- [packages/api/src/services/booking-admin.service.ts:506-553](packages/api/src/services/booking-admin.service.ts#L506) (`gps_checkins`, `receipts` runtime probes)
- [packages/api/src/services/financial-admin.service.ts:466-473](packages/api/src/services/financial-admin.service.ts#L466) (catches missing payment_method column, falls back to placeholder)

These defensive probes work around the possibility that some Phase-08 tables/columns might not exist in some environments. **Code smell.** In a production-ready system, migrations are deterministic — if the table is missing, surface it loudly. These silent fallbacks let environments drift from one another without anyone noticing.

**Fix dispatch:**
```
1. Add a startup check (server.ts boot path) that validates ALL expected tables and money-relevant columns exist. If missing, REFUSE TO START in production (warn in dev).
2. Once startup check is in place, remove the per-call `tableExists` probes — they become dead code.
3. The `getRevenueByPaymentMethod` try/catch at line 466-473 should also become unnecessary; remove.
```

### MED-59 — sendAdminMessageToBookingCustomer has 4 separate top-level queries
**File:** [packages/api/src/services/booking-admin.service.ts:1042-1142](packages/api/src/services/booking-admin.service.ts#L1042)
- Booking lookup (line 1059-1063)
- Conversation lookup (line 1067-1070)
- Message INSERT + conversations UPDATE (line 1076-1087)
- Notification INSERT (line 1090-1102)
- Audit INSERT (line 1115-1131)

If notification INSERT succeeds but audit fails, the customer was messaged but no admin attribution recorded. For a "support" message this is medium impact; for a refund-related message it could matter. Wrap message + notification + audit in one transaction.

---

## LOW / INFO

- **booking-admin.service.ts is the model implementation.** Comment at line 4-13 documents the sacred-file pattern. The Phase 14 D06 fixes (Bug 69, 70, 71) are correctly in place per file comments. This is what other money-path services should look like after fixes.

- **financial-admin.service.ts read-only contract is enforced by code structure**, not just comment. No INSERT/UPDATE/DELETE statements anywhere. Future maintainer can't accidentally break the invariant without obvious changes.

- **Both files use parameterized SQL throughout.** No injection risk.

- **Pagination/limit/offset clamping is consistent** (clampLimit, clampOffset helpers in financial-admin).

- **Date range validation** via `assertDateRange` is a clean pattern.

---

## CRIT-14 status (re-verified)

In B04 we invalidated CRIT-14 (premature customer confirm) based on the state machine. Reading booking-admin.service.ts confirms admins can `forceCompleteBooking` only from `in_progress` or `completed_by_provider` (line 154-157 `FORCE_COMPLETE_ALLOWED`). So even admin path doesn't allow premature confirm. **Confirmed invalidated.**

---

## Summary of money-path coverage

**Phase B is now COMPLETE for the money path** (all primary services + routes + validators read). Total: ~13,599 lines.

What was NOT read (and remains for later phases):
- `customer-admin.service.ts` (904) — admin customer ops, not strictly money path
- `provider-admin.service.ts` (999) — admin provider ops
- `dispute.service.ts` (843) + `dispute-admin.service.ts` (784) — read in Phase D/F when reviewing dispute UI
- `admin-analytics.service.ts` (1,314) — read in Phase F (admin)
- `marketing-admin.service.ts` (786) — read in Phase F
- `compliance.service.ts` (678) + `compliance-admin.service.ts` (489) — read in Phase F
- All other admin/ops services — Phase F
