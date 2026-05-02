# Phase B Findings Part 3 — booking.service.ts (the call site for everything)

File read in full: `packages/api/src/services/booking.service.ts` (1,197 lines)

**Phase B running total: ~4,714 lines fully read.**

---

## CRITICAL bugs (continued)

### CRIT-13 — Three different sources of truth for service fee math
**Files:**
- `services/booking.service.ts:76-82` — `calculateServiceFee` reads `platformConfig` (in-memory constants)
- `services/commission.service.ts:33-39` — reads `settings.service.ts` (DB-backed)
- `services/booking/pricing.service.ts:154-158` — also reads `settings.service.ts`
- `services/escrow.service.ts:84-85` — reads `settings.service.ts` for guarantee_fund_rate, but uses booking's stored `service_fee`

So at booking creation, fee is from `platformConfig` (literal constants). At "new" pricing resolver and escrow release, fee uses DB settings. If admin updates `service_fee_rate` in the DB, NEW bookings (via `createBooking`) won't see the change until code redeploys. The admin-editor pattern that Phase 14 dispatches built is **broken at the entry point.**

**Confirms and is the root cause of CRIT-04.** Booking creation should call the new pricing resolver (`services/booking/pricing.service.ts:resolvePricing`), not the in-line legacy code at `booking.service.ts:84-205`.

**Fix dispatch:**
```
1. Replace booking.service.ts:createBooking pricing block (lines 84-205) with:
   const resolved = await resolvePricing({
     userId: params.customerId,
     serviceCategoryId: params.categoryId,
     subcategoryId: params.subcategoryId!,
     addons: params.addons ?? [],
     scheduledAt: params.scheduledAt,
     city: params.city,
     promoCode: params.promoCode,
   });
2. Use resolved.servicePriceCents, resolved.serviceFeeCents, resolved.totalAmountCents.
3. ALSO fix booking/pricing.service.ts:149-151 stub to actually call resolvePromo.
4. Add migration: store the full breakdown on bookings table (commission_rate, commission_amount, fee_rate, fee_amount, guarantee_rate, guarantee_amount, promo_discount, suki_discount, addons_total) as immutable snapshot.
5. Update escrow.service.ts:releaseEscrow to read from booking columns, not recompute.
6. Tests:
   - Bug CRIT-13: change service_fee_rate setting, create new booking, assert serviceFee uses NEW rate (not platformConfig literal).
   - Bug CRIT-04: lock fee at booking time, change setting, release escrow, assert release uses LOCKED fee.
```

### CRIT-14 — Customer can self-confirm bookings prematurely
**File:** [packages/api/src/services/booking.service.ts:579-584](packages/api/src/services/booking.service.ts#L579)
```ts
const customerAllowed: BookingStatus[] = [
  'cancelled_by_customer', 'confirmed', 'disputed', 'payment_pending',
];
```
Customer can transition to 'confirmed'. Whether this is a bug depends on `canTransition` rules — does the state machine prevent confirming a booking that's still 'in_progress'? If valid_transitions allows 'in_progress' → 'confirmed' for customer, the customer could confirm the job mid-shift and trigger escrow release before work completes.

**Verify in Phase G** by reading `packages/api/src/types/booking.types.ts` (canTransition + VALID_TRANSITIONS).

If state machine allows premature confirm, **this is a CRITICAL money-loss bug** — provider gets paid before doing the job.

### CRIT-15 — Change order can be marked paid without actual payment
**File:** [packages/api/src/services/booking.service.ts:1114-1175](packages/api/src/services/booking.service.ts#L1114)
`finalizeChangeOrderPayment` is called with `(changeOrderId, customerId)` only. There's no payment intent ID, no payment proof, no integration with `payment.service.ts`. The function trusts the caller (customer) that payment happened.

If the mobile client is compromised (or a curl call is made), customer can:
1. Approve a ₱5,000 change order.
2. Call `finalizeChangeOrderPayment` directly without paying.
3. Booking total amount is increased by ₱5,000.
4. Provider performs additional work (booking now shows as paid for ₱5k extra).
5. At escrow release, provider gets the higher amount — but customer's original payment was for the original total, so platform pays the extra out of platform_escrow → **silent platform loss.**

**Fix:** require a successful payment intent before allowing finalize. Either:
- (a) Caller must supply paymentIntentId; service verifies status='succeeded' AND amount=additionalTotal AND booking_id matches, OR
- (b) Move finalize into the webhook handler that processes the change_order payment.

### CRIT-16 — Provider cancellation count update fires-and-forgets outside transaction
**File:** [packages/api/src/services/booking.service.ts:534-555](packages/api/src/services/booking.service.ts#L534)
The status transition uses a transaction, but provider cancellation tracking is `db.query(...).catch()` — outside the transaction, no await. If the UPDATE fails (DB hiccup), the provider's `total_cancellations` and `cancellations_last_30d` are wrong, the auto-suspension threshold won't trigger, and the data is silently corrupted.

**Fix:** move the UPDATE inside the same transaction (pass the client through).

### CRIT-17 — Stale approved change orders accumulate
**File:** [packages/api/src/services/booking.service.ts:1046-1112](packages/api/src/services/booking.service.ts#L1046)
Customer approves change order → status='approved', awaiting payment. If customer never pays, the row sits at status='approved' indefinitely. No expiry, no cleanup worker.

If the customer LATER decides to pay (a week later), `finalizeChangeOrderPayment` happily processes — but by then the booking might be in a different state (cancelled, completed, disputed). No state check.

**Fix:**
- Add expiry: change_orders.approved_expires_at = approved_at + INTERVAL '24 hours' (configurable).
- finalizeChangeOrderPayment must check booking is still in_progress.
- Worker that auto-declines change_orders that have been approved-but-not-paid past expiry.

---

## MEDIUM bugs

### MED-15 — booking/pricing.service.ts (the new D05 resolver) appears to be dead code
**File:** [packages/api/src/services/booking/pricing.service.ts](packages/api/src/services/booking/pricing.service.ts) (185 lines)
`booking.service.ts:createBooking` does NOT call `resolvePricing` from `services/booking/pricing.service.ts`. It does pricing in-line (lines 84-205) using legacy paths. The D05-built server-canonical resolver is unused.

**Verify with grep:** `Grep "resolvePricing\|services/booking/pricing"`. If no callers, the D05 work is shipped-but-unused.

**Fix:** see CRIT-13 above — replace the inline code with the resolver.

### MED-16 — Quote-based bookings don't apply surge pricing
**File:** [packages/api/src/services/booking.service.ts:865-870](packages/api/src/services/booking.service.ts#L865)
`acceptQuote` computes `discountedPrice = quote.quoted_price - sukiDiscount`, then `serviceFee = calculateServiceFee(discountedPrice)`. No surge added. So a quote accepted on Christmas Day evening (peak surge) gets standard price.

**Decision needed:** is this intentional (provider's quote already includes their assessment of demand)? Or should surge multiply the accepted quote? File a decision doc.

### MED-17 — Job-request urgency-to-scheduledAt mapping is hardcoded in service code
**File:** [packages/api/src/services/booking.service.ts:949-958](packages/api/src/services/booking.service.ts#L949)
```ts
if (data.urgency === 'same_day') {
  scheduledAt.setHours(scheduledAt.getHours() + 4);
}
```
Magic numbers: 4h, 2d, 5d, 7d. Should be in `platform_settings` so admin can tune (e.g., during high-demand periods, "same_day" might mean 6h not 4h).

### MED-18 — submitStructuredQuote uses Math.round on `quantity * unitPrice` without specifying that quantity may be fractional
**File:** [packages/api/src/services/booking.service.ts:725](packages/api/src/services/booking.service.ts#L725)
If validator allows fractional quantity (e.g., 2.5 hours), this rounds to nearest centavo. If validator only allows integer quantity, the Math.round is unnecessary. Either way, document the contract.

### MED-19 — Quote acceptance doesn't apply expired-quote cleanup
**File:** [packages/api/src/services/booking.service.ts:879-883](packages/api/src/services/booking.service.ts#L879)
On accept, only OTHER quotes with `status='submitted'` are auto-declined. Expired quotes (where `expires_at < NOW()` but status hasn't been auto-updated) are left as 'submitted'. UI may show them as still pending.

**Fix:** worker that nightly transitions expired quotes to status='expired'. Or compute status dynamically (`expires_at < NOW() ? 'expired' : status`).

---

## LOW / INFO

- `transitionBookingStatus` uses `SELECT ... FOR UPDATE` to lock the booking — race-safe.
- Server-side checklist + photo gate at line 446-470 (D07/Bug 463+1220) is correctly enforced.
- 50% change order cap (line 1027-1033, D05/Bug 1219) is correctly enforced.
- Bug 175 (server-canonical service price) and Bug 176 (server-canonical addon prices) ARE correctly enforced in `createBooking` (lines 91-187). The D05 fixes work for fixed_price flow.
- `submitQuote` correctly bounds quotes per booking via `platformConfig.maxQuotesPerBooking`.

---

## Cross-cutting summary so far

The pattern across all money-path code is:
1. **Three separate sources of pricing/fee/commission math.** (CRIT-13)
2. **No snapshot of the breakdown on the booking row.** Every consumer recomputes. (CRIT-04 + CRIT-13)
3. **Several actions trust the client.** finalizeChangeOrderPayment (CRIT-15), customer self-confirm (CRIT-14 maybe), promo per-customer limit (CRIT-09).
4. **Some atomic ops aren't atomic.** Provider cancellation count (CRIT-16), promo redemption (CRIT-09).

These are interrelated. A single dispatch could fix CRIT-04 + CRIT-13 + MED-05 + MED-15 by:
- Making `createBooking` call `resolvePricing` (the D05 resolver).
- Adding a `booking_pricing_snapshots` table that stores ALL the math at booking creation.
- Updating escrow to read from the snapshot.

Estimated scope: 1 dispatch, ~600 lines of changed code, 1 migration, ~30 tests.
