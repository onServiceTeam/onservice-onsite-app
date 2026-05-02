# Phase N Batch 4 — financial-admin.service.ts (1 file, 1,065 lines)

## File fully read
- packages/api/src/services/financial-admin.service.ts (1,065)

## Findings

### MED-N11 — getRevenueByPaymentMethod swallows missing-column errors silently
**Where found:** packages/api/src/services/financial-admin.service.ts:467-473
```ts
} catch (err) {
  logger.warn('getRevenueByPaymentMethod: payment_method column missing', { ... });
  return [{ dimension: 'unknown', label: 'Unknown', revenueCentavos: 0, bookings: 0 }];
}
```
**Understood:** Falls back to placeholder row when bookings.payment_method column is missing. The intention is graceful degradation, but it means schema migrations that fail to run silently produce a working dashboard with empty data. Operator sees "all bookings paid via Unknown method" and can't tell whether the data is real or a missing-column fallback.
**Fix:** Either return an error indicator field in the response so the UI can show "Payment-method tracking unavailable" banner, or remove the fallback (let the error surface — admin sees a broken page, runs the migration, page works again).

### MED-N12 — getEscrowSummary capped at 500 pending releases; could miss escrow-held bookings
**Where found:** packages/api/src/services/financial-admin.service.ts:533
```ts
ORDER BY b.completed_at NULLS LAST
LIMIT 500
```
**Understood:** If more than 500 bookings have escrow_status='held', only the 500 oldest are shown. Aging bucket counts derived from this list will UNDERCOUNT — an admin viewing the escrow tab during a high-volume backlog (post-outage, post-payout-job-failure) sees only the first 500.
**Fix:** Either (a) increase limit and document; (b) make the aging buckets aggregate via separate COUNT queries (not derived from the list); (c) add pagination to the pending-release list.

### POSITIVE — Read-only design, comprehensive money-write isolation
- Comment line 8-15 — explicit "ZERO money writes" + "no audit rows" + "no wallet balance touches". Aggregator-only.
- Sacred-file discipline. The actual money mutations live in escrow.service / commission.service / wallet.service.

### POSITIVE — 8-tab Phase 08 coverage
- Overview, Revenue Breakdown (by category/city/tier/payment method), Escrow (with aging), Payouts, Guarantee Fund (with runway calculation), Reconciliation, BIR Reports (VAT 2550M + 2307 quarterly), Receipts search.

### POSITIVE — Date-range validation
- assertDateRange (line 34) validates ISO format + from <= to.
- All tab functions call it.

### POSITIVE — Table existence guards (graceful degradation)
- `tableExists()` helper using `to_regclass()`. Used for payouts, official_receipts, bir_2307_batches, vat_monthly_reports, reconciliation_snapshots — all Phase 08 tables that may not exist on older schemas.
- Each guarded query returns a known-empty shape rather than throwing.

### POSITIVE — Guarantee fund runway calculation
- Lines 730-734 — `runwayMonths = balance / averageMonthlyOutflow`. Uses 90-day window for stability.
- needsReplenishment if runway < 3 months OR balance < ₱1M floor.

### POSITIVE — Limit/offset clamping
- clampLimit(1..MAX_LIMIT=100, default 25), clampOffset(0..+Inf). Defensive against caller-provided huge values.

### POSITIVE — Receipts search filters all parameterized
- ILIKE for OR number, customer name, provider name. Date range optional. All bind via $N — no SQL injection.

## Cumulative Phase N progress: 4 / 104 files (~5,136 lines)
