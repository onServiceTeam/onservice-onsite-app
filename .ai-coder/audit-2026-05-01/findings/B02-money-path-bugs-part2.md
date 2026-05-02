# Phase B Findings Part 2 — Promotions, Referrals, Suki, Pricing, Cancellation

Files added in this batch:
- `services/promotion.service.ts` (144) — banner-style promotions, NOT promo codes
- `services/referral.service.ts` (248)
- `services/suki.service.ts` (335)
- `services/rebooking.service.ts` (258)
- `services/pricing.service.ts` (411)
- `services/pricing/cancellation.service.ts` (268)
- `services/booking/pricing.service.ts` (185)
- `services/booking/promo.service.ts` (118)
- `services/booking/surge.service.ts` (65)
- `services/booking/from-quote.service.ts` (124)

**Phase B running total: ~3,517 lines fully read.**

---

## CRITICAL bugs (continued numbering from B01)

### CRIT-08 — Promo discount stub returns 0 in booking pricing resolver
**File:** [packages/api/src/services/booking/pricing.service.ts:149-151](packages/api/src/services/booking/pricing.service.ts#L149)
```ts
// Promo: stub returns 0 until subtask 3 wires services/booking/promo.service.ts.
// Bug 261 fix lands when this stub is replaced...
const promoDiscountCents = 0;
```
The promo resolver `services/booking/promo.service.ts` exists and is correct. But the booking pricing resolver doesn't actually call it. So if a customer enters `PROMO50`, the booking proceeds with `promoDiscountCents = 0`. **Customer charged full price; no discount applied.**

If `booking.service.ts` calls `resolvePromo` separately and applies it before persistence, this stub may be benign. **Verify in next read of booking.service.ts.**

**Fix:**
```
1. In booking/pricing.service.ts:149, replace the stub with:
   const promoDiscountCents = input.promoCode
     ? await resolvePromo({ code: input.promoCode, subtotalCents: servicePriceCents + addonsCents + surgeAmountCents, userId: input.userId })
     : 0;
2. Add tests:
   - PROMO50 returns 50% discount on servicePrice + addons + surge.
   - Invalid promo returns promo_invalid.
   - Promo below min order returns promo_min_order_not_met.
   - Promo expired/exhausted properly rejected.
```

### CRIT-09 — Per-customer promo limit not enforced
**File:** [packages/api/src/services/booking/promo.service.ts:17-20](packages/api/src/services/booking/promo.service.ts#L17) (comment confirms)
The `usage_limit_per_customer` column exists on `promo_codes` but no code reads it. A single customer can re-use a "first booking" promo unlimited times.

**Fix:**
```
1. New migration: create promo_redemptions(promo_id, customer_id, booking_id, redeemed_at).
2. resolvePromo should accept userId and SELECT COUNT(*) FROM promo_redemptions WHERE promo_id = $1 AND customer_id = $2; reject if >= usage_limit_per_customer.
3. Booking creation transaction (D06) should INSERT into promo_redemptions atomically with booking insert.
4. Tests: same customer using PROMO50 twice — first succeeds, second rejected with promo_exhausted.
```

### CRIT-10 — Quote acceptance accepts already-accepted quotes
**File:** [packages/api/src/services/booking/from-quote.service.ts:71](packages/api/src/services/booking/from-quote.service.ts#L71)
```ts
const QUOTE_ACCEPTABLE_QUOTE_STATUSES = new Set([null, 'submitted', 'accepted']);
```
'accepted' is in the acceptable set. So validateAndResolveQuote returns success even if `is_accepted=true` already. The booking row's service_price could already be set from prior acceptance. Re-acceptance could re-compute pricing using a newer surge multiplier or charge a customer twice in the wrong order.

**Fix:** remove 'accepted' from the acceptable set. Add explicit check: `if (quote.is_accepted) throw quoteWrongStatus`.

### CRIT-11 — Suki points redemption race condition (negative balance)
**File:** [packages/api/src/services/suki.service.ts:145-153](packages/api/src/services/suki.service.ts#L145)
- Line 145: `if (m.points_balance < points)` — read check.
- Line 150-153: UPDATE has no WHERE guard on points_balance.

Two concurrent redemptions can each pass the check, then both subtract — resulting in negative points balance.

**Fix:**
```ts
const updated = await client.query<{points_balance: number}>(
  `UPDATE suki_memberships SET points_balance = points_balance - $1, updated_at = NOW()
   WHERE id = $2 AND points_balance >= $1 RETURNING points_balance`,
  [points, membershipId],
);
if (updated.rows.length === 0) throw createAppError('Insufficient points (concurrent redemption?).', 409);
```

### CRIT-12 — Pricing rule timezone handling fragile
**File:** [packages/api/src/services/pricing.service.ts:282-288](packages/api/src/services/pricing.service.ts#L282)
```ts
const scheduledInManila = new Date(scheduledDate.toLocaleString('en-US', { timeZone: platformConfig.timezone }));
```
`toLocaleString` returns a locale-specific string ("5/1/2026, 2:30:45 PM"); parsing that back via `new Date()` relies on the runtime's locale parsing being identical. On Node 20+ Intl this happens to work for en-US but it's fragile and unreliable for some locales/edge cases.

For peak-hours rules, an off-by-one timezone determination = wrong surge applied = wrong price = real money. A booking scheduled for "5pm Manila" might evaluate against UTC 5pm instead.

**Fix:** use Intl.DateTimeFormat with parts:
```ts
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: platformConfig.timezone,
  hour: 'numeric', hour12: false, minute: 'numeric', weekday: 'short', year:'numeric', month:'numeric', day:'numeric'
});
const parts = Object.fromEntries(fmt.formatToParts(scheduledDate).map(p => [p.type, p.value]));
const scheduledHour = parseInt(parts.hour, 10);
// ... etc
```
And add a test: schedule a booking for `2026-12-25T17:00:00+08:00` and verify peak-hours rule "17:00-19:00 Mon-Fri Manila" matches.

---

## MEDIUM bugs

### MED-07 — Provider no-show apology credit stored in PHP, not centavos
**File:** [packages/api/src/services/pricing/cancellation.service.ts:238](packages/api/src/services/pricing/cancellation.service.ts#L238)
```ts
const apologyCreditCentavos = policy.provider_no_show_credit_php * 100;
```
Whole-peso increments only. If ops wants to set credit to ₱150.50, can't. Migration should use centavos throughout.

### MED-08 — Referrer not notified when their code is redeemed
**File:** [packages/api/src/services/referral.service.ts:106-146](packages/api/src/services/referral.service.ts#L106)
Referee gets notification + bonus immediately. Referrer gets nothing until referee completes a booking. UX expectation: "Someone joined with your code!" notification on signup.

**Fix:** add notification INSERT for referrer in redeemReferralCode transaction.

### MED-09 — Rebooking suggestion uses ILIKE on city/province text fields
**File:** [packages/api/src/services/rebooking.service.ts:138](packages/api/src/services/rebooking.service.ts#L138)
- `WHERE p.city ILIKE $2 OR p.province ILIKE $3`
- Fuzzy text matching, no real geo-radius.
- Even though latitude/longitude are SELECTed (line 130-131), distance is never computed (line 165: `distanceKm: null`).

So a customer in Boracay sees rebooking suggestions from any provider with "Bor" in their city name. Boracay-specific is fine for v1.0 launch but the geo-search is broken.

**Fix (post-launch):** use the existing `service_areas` polygons (migration 022/074) to do real geographic matching: `ST_Contains(sa.bounds, ST_MakePoint(b.longitude, b.latitude))`.

### MED-10 — Rebooking only triggers on provider/admin cancellation, not customer cancel
**File:** [packages/api/src/services/rebooking.service.ts:81](packages/api/src/services/rebooking.service.ts#L81)
Customer who cancels their own booking ("oops, wrong time") gets no rebooking suggestions. Should also trigger for `cancelled_by_customer`.

### MED-11 — Booking history filters use unusual status set
**File:** [packages/api/src/services/rebooking.service.ts:111,207](packages/api/src/services/rebooking.service.ts#L111)
Filters on `b.status IN ('confirmed', 'payout_ready', 'paid_out')`. Missing 'completed' / 'resolved' / etc. depending on the actual enum from migrations. Cross-reference with the `bookings.status` enum during Phase G.

### MED-12 — Promotion soft delete missing
**File:** [packages/api/src/services/promotion.service.ts:122-125](packages/api/src/services/promotion.service.ts#L122)
Hard delete. Acceptable since promotions look like banner content, not coupons. But if a promotion ID is referenced anywhere (analytics, click logs), hard delete loses history.

### MED-13 — Suki tier names hardcoded in computeTier
**File:** [packages/api/src/services/suki.service.ts:36-41](packages/api/src/services/suki.service.ts#L36)
Tier names are string literals. Adding a new tier in `platformConfig.sukiTiers` doesn't auto-detect — `computeTier` would still only check the four hardcoded names.

**Fix:** iterate `Object.entries(SUKI_TIERS).sort((a,b) => b[1].minBookings - a[1].minBookings)` and return first match.

### MED-14 — Promo time check is local time, not UTC
**File:** [packages/api/src/services/booking/promo.service.ts:76-86](packages/api/src/services/booking/promo.service.ts#L76)
`Date.now()` and `new Date(promo.valid_from).getTime()` both work in absolute UTC milliseconds — actually fine. Withdrawn.

---

## LOW / INFO

- `cancellation.service.ts` is well-written: cache pattern correct, fallback to DB on Redis miss, structured policy schema, pure preview helper for admin "what if" pane.
- `from-quote.service.ts` is read-only and small. Cleanly delegates mutation to caller.
- `surge.service.ts` is a thin wrapper. Hacky basePrice=0 trick to extract a rule but works.
- `pricing.service.ts` has solid validation (multiplier range, type-required-fields).
- `referral.service.ts:38-44` uses `Math.random()` for code generation. Codes are public so not a security issue per se, but `crypto.randomBytes` is preferred for slight collision-predictability reduction.
- `promotion.service.ts:91-120` falls back to existing values per-field — can't clear nullable fields back to null. Minor.

---

## Cross-cutting observations

**The same pricing math lives in three places now:**
1. `commission.service.ts` (legacy commission + cancellation refund tiers)
2. `booking/pricing.service.ts` (server-canonical resolver — D05)
3. `escrow.service.ts` (recomputes commission + guarantee at release time)

This is a smell. Each call site can produce slightly different numbers depending on settings drift, rounding order, and which service was invoked. **The fix is the snapshot pattern from CRIT-04: lock all money math at quote time, persist as immutable booking_pricing_snapshot row, every downstream consumer reads the snapshot.**

This is a single-dispatch refactor and would resolve CRIT-04, MED-05, and the latent risk in pricing.service.ts:calculatePricing → escrow.service.ts:releaseEscrow drift.

---

## What's left in money path

Still to read:
- `services/booking.service.ts` (1,197 lines) ← THE BIG ONE — call site for everything above
- `services/reconciliation.service.ts` (472)
- `routes/booking.routes.ts` (1,025)
- `routes/wallet.routes.ts` (342)
- `routes/payment.routes.ts` (117)
- `routes/payout.routes.ts` (160)
- `routes/tip.routes.ts` (86)
- `routes/webhook.routes.ts` (TBD — paymongo webhooks land here)
- All `validators/*.validators.ts` (795 total)
- `jobs/workers.ts` (566) — payout polling, reminder jobs, scheduled tasks

Subtotal still to read: ~5,500+ lines.
