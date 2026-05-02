# Phase B Findings Part 6 — booking.routes.ts (1,025 lines)

**Phase B running total: ~7,926 lines fully read** (was 6,901; +1,025 this batch).

---

## CRITICAL bugs (continuing from CRIT-31)

### CRIT-32 — Change-order payment: finalize before debit creates inflated-booking-no-payment state
**File:** [packages/api/src/routes/booking.routes.ts:247-287](packages/api/src/routes/booking.routes.ts#L247)
```ts
const result = await bookingService.finalizeChangeOrderPayment(changeOrderId, userId);
// ↑ This flips change_order.status='paid' AND increases booking.total_amount

const customerWallet = await walletService.getUserWallet(userId, 'customer');
await walletService.debitWallet(...);  // ← can fail if insufficient
await escrowService.holdInEscrow(...);
```
Order is wrong: booking is updated FIRST, then payment is debited. If wallet has insufficient balance, the booking shows the inflated total but no money moved. Customer sees wrong total; reconciliation breaks.

This partially mitigates CRIT-15 (no payment proof was the original bug — now wallet payment is required) but introduces a new bug: the wrong order of operations.

**Fix dispatch:**
```
1. Wrap entire flow in db.transaction:
   - SELECT customer wallet FOR UPDATE; verify balance >= additionalTotal.
   - finalizeChangeOrderPaymentInTransaction(client, changeOrderId, userId)
   - debitWalletInTransaction(client, walletId, amount, ...)
   - holdInEscrowInTransaction(client, bookingId, amount)
2. Rejects insufficient-balance BEFORE finalize commits.
3. Add tests:
   - Insufficient wallet balance → 400, booking unchanged.
   - Wallet debit OK → all 3 commit together.
   - Escrow hold throws → rollback wallet debit + finalize.
```

### CRIT-33 — PATCH /status uses stale pre-fetched escrow_status to drive escrow release
**File:** [packages/api/src/routes/booking.routes.ts:442-549](packages/api/src/routes/booking.routes.ts#L442)
```ts
const preTransitionRow = await db.query<PreTransitionRow>(
  `SELECT status, escrow_status, latitude, longitude FROM bookings WHERE id = $1`,
  [id],
);
const oldEscrowStatus = preTransitionRow.rows[0]?.escrow_status;
// ... (transitionBookingStatus runs in its own tx) ...
if (newStatus === 'confirmed' && oldEscrowStatus === 'held') {
  await escrowService.releaseEscrow(id);
}
```
The pre-fetch reads escrow_status WITHOUT a lock. Between this read and the conditional escrow release (~50ms+), another process (autoConfirmBookings worker, admin action) could already release the escrow.

If oldEscrowStatus was 'held' at read but is now 'released', this code calls releaseEscrow again. The escrow.service.ts:releaseEscrow guard at line 110-117 (`WHERE escrow_status = 'held' RETURNING`) catches this and throws 409 — **but only because of the safety guard**. If the guard is ever loosened, double-release would occur.

**Fix dispatch:**
```
1. Move the pre-fetch INSIDE the transitionBookingStatus call OR refactor PATCH /status to:
   - Begin transaction
   - SELECT ... FOR UPDATE (locks the row)
   - Validate transition + escrow conditions
   - Apply status change
   - If escrow release needed, call releaseEscrowInTransaction(client, id)
   - All in one atomic block
2. Use the existing D06 transaction-aware variants (releaseEscrowInTransaction, handleCancellationInTransaction) — they exist for exactly this reason.
3. Add concurrent-test: two simultaneous PATCH /status to 'confirmed' on same booking — expect one success, one 409, no double escrow release.
```

### CRIT-34 — Cancellation escrow processing is non-atomic with status flip
**File:** [packages/api/src/routes/booking.routes.ts:551-576](packages/api/src/routes/booking.routes.ts#L551)
```ts
// (transitionBookingStatus already committed status='cancelled_by_*')
if ((newStatus === 'cancelled_by_customer' || ...) && oldEscrowStatus === 'held') {
  try {
    await escrowService.handleCancellation(id, hoursUntil, wasProviderArrived);
  } catch (escrowErr) {
    // Returns 207: "Your cancellation was recorded but refund delayed"
  }
}
```
Status is committed to 'cancelled_by_*' BEFORE the cancellation refund processing. If `handleCancellation` fails:
- Customer sees "cancelled".
- No refund.
- Code returns HTTP 207 with a "we'll process within 48 hours" message.
- **But there's no automated retry queue.** Manual ops only.

**Fix dispatch:**
```
1. Use handleCancellationInTransaction (D06 variant) inside the transitionBookingStatus transaction.
2. If escrow processing fails, the entire status change rolls back. Customer sees error and can retry.
3. Build a "stuck cancellations" admin view that lists bookings in cancelled_by_* with escrow_status='held' >5 minutes — surfaces stuck refunds.
4. Add a worker that retries handleCancellation on stuck bookings nightly.
5. Tests: simulate escrowService throw, assert booking status reverted to pre-transition value.
```

### CRIT-35 — Provider assignment does no transactional consistency between conflict check + price update
**File:** [packages/api/src/routes/booking.routes.ts:684-719](packages/api/src/routes/booking.routes.ts#L684)
```ts
const conflict = await matchingService.hasBookingConflict(...);
if (conflict) throw 409;

const { discountAmount } = await sukiService.calculateSukiDiscountForBooking(...);
// ← gap of milliseconds here

await db.query(`UPDATE bookings SET provider_id = $1, status = 'matched', service_price = $3, ...`);
```
Race: between conflict check and UPDATE, another customer could book the same provider for the same time slot. Both pass the conflict check, both UPDATE.

The matched-status uniqueness isn't enforced at DB level (no unique constraint on `provider_id + scheduled_at` for status='matched'). So both bookings exist with same provider, same time.

**Fix dispatch:**
```
1. Wrap in db.transaction:
   - SELECT bookings WHERE provider_id = $1 AND scheduled_at OVERLAPS ... FOR UPDATE
   - hasBookingConflict (or inline the same check)
   - UPDATE the booking
2. Add a partial unique index: CREATE UNIQUE INDEX ON bookings (provider_id, scheduled_at) WHERE status IN ('matched', 'paid', 'provider_en_route', 'provider_arrived', 'in_progress');
3. Tests: two parallel POST /:id/assign for same provider/time — assert one succeeds, one fails with conflict.
```

---

## MEDIUM bugs

### MED-37 — Slot-waitlist body has no Zod validation
**File:** [packages/api/src/routes/booking.routes.ts:357-386](packages/api/src/routes/booking.routes.ts#L357)
Manual `if (!field) throw` checks. Easy to miss new fields. No type narrowing. Use Zod schema like other routes do.

### MED-38 — Pricing preview uses legacy calculatePricing — different from booking creation
**File:** [packages/api/src/routes/booking.routes.ts:291-324](packages/api/src/routes/booking.routes.ts#L291)
Same root cause as CRIT-13 — preview computes via legacy `pricingService.calculatePricing` while booking creation uses different code paths. Customer might see X in preview but be charged Y. Once snapshot pattern is implemented (CRIT-13 fix), preview should call the same resolver.

### MED-39 — Photo upload allows customer + admin to add 'before'/'after' photos
**File:** [packages/api/src/routes/booking.routes.ts:845-918](packages/api/src/routes/booking.routes.ts#L845)
`verifyBookingAccess` allows customer AND provider. So customer can upload a photo as `phase='after'` and it counts toward the provider's "2 after photos required for completion" gate (Bug 1220). Customer could fake completion.

**Fix:** restrict 'before'/'after' photo phases to provider only; customer/admin photos should use a different photo_type ('damage', 'dispute_evidence').

### MED-40 — Customer can assign any approved provider, bypassing matching engine
**File:** [packages/api/src/routes/booking.routes.ts:641-741](packages/api/src/routes/booking.routes.ts#L641)
Customer can assign any provider with `status='approved'`. Bypasses radius, category, availability checks done by `matchingService.findMatchingProviders`. Maybe intended (customer can hand-pick) but should at least verify provider services the booking's category.

### MED-41 — Status transition referral/suki side effects swallow errors
**File:** [packages/api/src/routes/booking.routes.ts:531-548](packages/api/src/routes/booking.routes.ts#L531)
Both `creditReferrerAfterBooking` and `recordBookingForSuki` are best-effort try/catch. If they fail, no retry, no admin notification. Customer may have completed a referral-qualifying booking but referrer never gets credit. Add to a retry queue, or use a worker to backfill.

### MED-42 — verifyBookingAccess does extra DB hit for provider lookup on every call
**File:** [packages/api/src/routes/booking.routes.ts:61-79](packages/api/src/routes/booking.routes.ts#L61)
Even for customer access (where provider lookup is irrelevant), the function fetches the provider row. Optimization: skip provider lookup if `booking.customer_id === userId`.

---

## LOW / INFO

- Wildcard route ordering is correct (`/pricing-preview`, `/upcoming-holidays`, `/history/rebookable`, `/slot-waitlist*` all declared before `/:id`). Comments document this (line 289, 338, 355, 417). Good defense.
- `getParamId` helper (line 27-33) is a clean validation pattern.
- `haversineDistanceMeters` is correct.
- Photo upload (line 871-878) correctly rejects `file://` URIs (D07/Bug 36/461/1224 fix). Strong defensive pattern.
- Booking conflict check (line 684-695) is good in isolation but not protected by a transaction.
- Provider arrival geofence (line 449-475) is correctly enforced server-side.
- Minimum-time-on-site enforcement (line 477-494) is correctly enforced.

---

## What's still NOT read in money path

- `routes/wallet.routes.ts` (342)
- All `validators/*.validators.ts` (795)
- `services/invoice.service.ts` (498)
- `services/or.service.ts` (807)
- `services/bir-2307.service.ts` (842)
- `services/vat-report.service.ts` (645)
- `services/booking-admin.service.ts` (1,143)
- `services/financial-admin.service.ts` (1,065)

Continuing.
