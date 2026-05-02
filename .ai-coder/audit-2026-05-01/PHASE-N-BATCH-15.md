# Audit 2026-05-01 — Phase N Batch 15 — booking.service (re-read), admin, breach-log, payout

**Status:** 4 service files fully read line-by-line, ~2,284 lines covered.

## Files fully read (4 files, 2,284 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/booking.service.ts | 1197 |
| packages/api/src/services/admin.service.ts | 520 |
| packages/api/src/services/breach-log.service.ts | 277 |
| packages/api/src/services/payout.service.ts | 290 |

## CRIT-N05 INVALIDATED

**Where:** packages/api/src/services/booking.service.ts:144-187

Re-read confirms `createBooking` DOES perform canonical addon lookup server-side: `SELECT id, subcategory_id, price, is_active, name FROM service_addons WHERE id = ANY($1::uuid[])` then asserts `is_active = TRUE` and `subcategory_id` matches the booking's subcategory before computing the line total from canonical price.

**`saveBookingAddons` in catalog.service.ts:677-696 is exported but has ZERO callers** (verified via grep across packages/api/src). The dead export poses theoretical risk only — bug fix would be deletion of the dead function. Reclassifying CRIT-N05 → MED-N67.

## NEW CRITICAL findings (1)

### CRIT-N09 — booking.service.ts createBooking NOT wrapped in a transaction

**Where found:** packages/api/src/services/booking.service.ts:209-253

```ts
const result = await db.query<BookingRow>(`INSERT INTO bookings ...`);
// ...
if (resolvedAddons.length > 0) {
  for (const addon of resolvedAddons) {
    await db.query(`INSERT INTO booking_addons ...`);
  }
}
```

The booking row INSERT and the per-addon `booking_addons` INSERTs run as separate top-level `db.query` calls. If any addon INSERT fails (DB blip, FK violation, statement timeout), the booking is created with a `total_amount` that reflects addons the customer thinks they ordered but `booking_addons` is empty (or partial). Customer pays the full total but the assigned provider doesn't see all addons.

**Impact:**
- Money/state mismatch: customer charged for X+Y+Z but provider sees only X.
- Phase 14 D06 transactional discipline regression (the entire D06 dispatch was about wrapping money operations in transactions; this is the very entry point for new bookings).
- Recovery is manual (admin must reconcile).

**Fix:** Wrap the entire `createBooking` body (post-validation) in `db.transaction(async (client) => { ... })` and use `client.query` for both the booking INSERT and the addon INSERTs. Convert the per-addon for-loop into a single multi-row INSERT for performance. Add a regression test that simulates a forced FK violation on the second addon and asserts no booking row remains.

## NEW MEDIUM findings (12)

### MED-N67 — saveBookingAddons dead code (downgraded from CRIT-N05)

**Where:** packages/api/src/services/catalog.service.ts:677-696

Function `saveBookingAddons(bookingId, addons[])` accepts client-supplied `name` and `price`. No callers exist anywhere in `packages/api/src`. Dead export.

**Risk:** A future contributor sees the function and calls it from a route layer with client-supplied values, opening the bypass that was the original CRIT-N05 concern.

**Fix:** Delete the function. If there's anticipated future need, either rename it `saveBookingAddons_INTERNAL_DO_NOT_USE_FROM_ROUTES` with a guard that asserts an internal caller, or rebuild it to do the canonical lookup itself.

### MED-N68 — booking.service cancellations_last_30d may double-count current cancellation

**Where:** booking.service.ts:535-547

```ts
UPDATE providers SET
  total_cancellations = total_cancellations + 1,
  cancellations_last_30d = (
    SELECT COUNT(*) FROM bookings WHERE provider_id = $1
      AND status = 'cancelled_by_provider' AND cancelled_at > NOW() - INTERVAL '30 days'
  ) + 1,
```

The parent transaction (line 417-558) just set `status = 'cancelled_by_provider'` and `cancelled_at = NOW()` on the booking. This UPDATE on `providers` runs OUTSIDE the transaction (line 535 uses `db.query` not `client.query`). Inside the subquery, the bookings table reflects the new cancelled state (committed) plus the `+ 1` adds another count → double-counted current cancellation.

Either remove the `+ 1` (since the just-cancelled booking is already in COUNT) OR scope the subquery with `AND id != $current_booking_id`. Also, the whole UPDATE should run inside the transaction to be atomic with the booking state change.

**Fix:** Move the providers UPDATE inside the transaction (use `client.query`), and remove the `+ 1` addend.

### MED-N69 — booking.service createBooking serial addon INSERTs (N+1)

**Where:** booking.service.ts:246-251

For-loop with `await db.query(INSERT...)` per addon. With 3 addons, 3 round-trips. Should be one multi-row INSERT.

**Fix:** Single INSERT with `VALUES ($1,$2,...), ($3,$4,...), ...` pattern. Same shape as `saveBookingAddons` (which is dead code but its INSERT pattern is correct).

### MED-N70 — booking.service respondToChangeOrder + finalizeChangeOrderPayment decoupled

**Where:** booking.service.ts:1046-1112, 1114-1175

`respondToChangeOrder` (approve case) commits the change_order status update in a transaction, then exits with `paymentRequired: true` (line 1100-1108). The customer is supposed to call `finalizeChangeOrderPayment` separately to update booking totals. If they never call it (closes app, network drops), the change_order is "approved" but booking math is unchanged. Provider may complete the additional work without ever being paid for it.

**Fix:** Either (a) auto-expire approved change_orders after 24h with rollback, OR (b) require respondToChangeOrder + payment intent in one atomic step (block approval until payment succeeds), OR (c) add `expired` status with worker that flips approved-but-unpaid orders.

### MED-N71 — admin.service approveProvider sends 'tier_upgrade' notification type

**Where:** admin.service.ts:192-195

```ts
INSERT INTO notifications (user_id, type, title, body, data)
VALUES ($1, 'tier_upgrade', 'Account Approved', ...
```

Provider approval is NOT a tier upgrade. Notification type semantics are wrong, breaking any client-side filter on notification type. Should be `'provider_approved'` or similar.

**Fix:** Add notification type `'provider_approved'` to the `NotificationType` union in notification.service.ts:20-28 and use it here.

### MED-N72 — admin.service rejectProvider uses notification type not in union

**Where:** admin.service.ts:222

```ts
VALUES ($1, 'provider_rejected', 'Application Declined', ...
```

`'provider_rejected'` is not in the `NotificationType` union in notification.service.ts:20-28. If there's a CHECK constraint on notifications.type, this fails. If not, the type string is silently wrong.

**Fix:** Add `'provider_rejected'` to the union and ensure CHECK constraint allows it.

### MED-N73 — admin.service suspendProvider doesn't pause active bookings

**Where:** admin.service.ts:233-249

When a provider is suspended, their active bookings (provider_en_route, provider_arrived, in_progress, completed_by_provider) remain assigned. The suspended provider could still mark them complete and trigger escrow release. Suspension should at minimum prevent new escrow releases until admin resolves the active bookings.

**Fix:** Either (a) cascade-cancel all in-flight bookings (refund customer, no commission), or (b) flag the provider's bookings for admin review before allowing escrow release. Add a `provider_suspended_at` check in escrow release path.

### MED-N74 — admin.service changeProviderTier accepts arbitrary tier strings

**Where:** admin.service.ts:269-294

```ts
async function changeProviderTier(providerId: string, adminId: string, newTier: string, reason: string)
// ...
UPDATE providers SET tier = $1 WHERE id = $2
```

No whitelist of valid tiers. Admin can typo "preimum" or "founder" instead of "founding". Stored as-is. Subsequent commission lookups fail or use fallback.

**Fix:** Validate against `['new', 'silver', 'gold', 'platinum', 'founding']` set (matching migration 073 + TIER_LADDER), or query `platform_settings.commission_rates` for valid keys.

### MED-N75 — admin.service approveProvider doesn't check KYC documents

**Where:** admin.service.ts:175-201

No precondition that `nbi_clearance_url`, `government_id_front_url`, `selfie_url` are non-null before approval. Admin can approve a provider who hasn't uploaded any KYC docs. Bug 1234 / NBI tracking depends on these being present.

**Fix:** Add precondition check: `SELECT nbi_clearance_url, government_id_front_url, selfie_url FROM providers WHERE id = $1` and refuse approval if any are NULL. Surface to admin UI.

### MED-N76 — admin.service getRevenueReport interpolates truncUnit into SQL

**Where:** admin.service.ts:386-397

```ts
date_trunc('${truncUnit}', wt.created_at)
```

`truncUnit` is from a whitelist (line 384) so currently safe. Pattern is bad — same dynamic SQL concern as MED-N30.

**Fix:** Use a switch returning a static SQL fragment instead of interpolation.

### MED-N77 — payout.service NO AML threshold check

**Where:** packages/api/src/services/payout.service.ts:29-95

`requestPayout` enforces `minimumWithdrawalAmount` but no maximum or AML flagging. PH AMLA covered transactions (Section 3 of RA 9160) require reporting cash transactions > P500K. A single payout of P1M from a provider should at minimum trigger admin review.

**Fix:** Add `LARGE_TRANSACTION_THRESHOLD` (default P500K) — payouts >= threshold require explicit super_admin approval. Log to AMLA reporting queue. Surface in admin Compliance dashboard.

### MED-N78 — payout.service no destination account format validation per method

**Where:** payout.service.ts:33

```ts
method: 'gcash' | 'maya' | 'bank_instapay' | 'bank_pesonet';
destinationAccount: string;
```

No per-method validation. GCash/Maya require 11-digit phone format; bank_instapay/bank_pesonet require account numbers. A typo in destinationAccount silently routes payment to wrong recipient.

**Fix:** Per-method regex validation in `requestPayout`:
- gcash/maya: `/^09\d{9}$/`
- bank_instapay/bank_pesonet: `/^\d{8,16}$/` plus bank code lookup

### MED-N79 — breach-log NPC reference regex too loose

**Where:** packages/api/src/services/breach-log.service.ts:37, 187

```ts
const NPC_REF_REGEX = /^NPC-\d{4}-[A-Z0-9]{6,}$/;
```

`{6,}` allows unbounded suffix length. NPC reference format actually has fixed length per NPC documentation (typically `NPC-YYYY-XXXXXX` exactly 6 alphanumeric). Could let admin paste a malformed reference.

**Fix:** Tighten to `/^NPC-\d{4}-[A-Z0-9]{6}$/` (exactly 6) and add a comment citing NPC source.

## POSITIVE findings

1. **Phase 14 D05 server-canonical addon pricing CONFIRMED** at booking.service.ts:144-187. Bug 176 fix is real and complete.
2. **Phase 14 D05 server-canonical promo discount CONFIRMED** at booking.service.ts:194-201 — uses `resolvePromo()` from booking/promo.service.ts.
3. **Phase 14 D05 fixed-price subcategory base_price CONFIRMED** at booking.service.ts:91-114 — no fallback to client-supplied servicePrice.
4. **Phase 14 D05 surge pricing via pricingService.calculatePricing** at lines 127-137 — server-resolved.
5. **Phase 14 D05 change-order 50% cap CONFIRMED** (Bug 1219) at booking.service.ts:1027-1033 — was warn-only, now hard error.
6. **Phase 14 D07 completion preconditions CONFIRMED** (Bug 463 + 1220) at lines 446-470 — checklist + 2 after-photos enforced server-side before `completed_by_provider` transition.
7. **Phase 14 D06 transactional discipline CONFIRMED** in payout.service (request/approve/reject/complete all properly trx).
8. **Phase 14 D08 breach-log SLA enforcement** properly enriched at lines 73-97 — sla72hExpired + remaining hours computed at read time.
9. **Phase 14 D08 PII masking** correctly applied at admin.service getAdminActions (line 438-440) — viewerRole determines visibility.
10. **VALID_TRANSITIONS state machine** at booking.service.ts:430-437 — explicit allowed transitions check before any UPDATE.

## Confirmations

- **Bug 1271 native fetch** verified across all 4 files (no axios).
- **Phase B claim that booking.service was "partial-read"** confirmed — full re-read found CRIT-N09 (createBooking not transactional) which Phase B did not catch.
- **Phase B claim that escrow.service is fully read** still pending — Batch 11 found CRIT-N04 (missing money-conservation check in trx-aware variant) which Phase B did not catch. Re-confirms that "Phase B" claims need verification.

## Cumulative running totals (after Phase N Batch 15)

| | Total | Batch 15 additions |
|---|---:|---:|
| **CRITICAL** | **183 + 1 - 1 (N05 invalidated → MED) = 183 real** (2 invalidated of 185) | **+1 net** |
| **MEDIUM** | **550 + 13 = 563** (N67 reclassified from N05 + 12 new) | **+13** |
| Lines fully read | ~121,737 / 146,236 | +2,284 |
| Coverage | **83.2%** | +1.5% |

## Files NOT YET READ — remaining (~78 files, ~19,500 lines)

Top priority for Batch 16:
- auth.routes.ts (977) + booking.routes.ts (1025)
- provider.routes.ts (735) + catalog.routes.ts (466) + business.routes.ts (400)
- recurring-booking.service.ts + uploads.service.ts + tip.service.ts + suki.service.ts
- account.service.ts + checklist.service.ts + booking-photo.service.ts
