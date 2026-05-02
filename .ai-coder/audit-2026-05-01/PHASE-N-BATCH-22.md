# Audit 2026-05-01 — Phase N Batch 22 — booking/{promo,from-quote,pricing,surge}, pricing/cancellation, promotion, rebooking, referral, tip

**Status:** 9 service files fully read line-by-line, ~1,596 lines covered.

## Files fully read (9 files, 1,596 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/pricing/cancellation.service.ts | 268 |
| packages/api/src/services/rebooking.service.ts | 258 |
| packages/api/src/services/referral.service.ts | 248 |
| packages/api/src/services/tip.service.ts | 186 |
| packages/api/src/services/booking/pricing.service.ts | 185 |
| packages/api/src/services/promotion.service.ts | 144 |
| packages/api/src/services/booking/from-quote.service.ts | 124 |
| packages/api/src/services/booking/promo.service.ts | 118 |
| packages/api/src/services/booking/surge.service.ts | 65 |

## NEW CRITICAL findings (1)

### CRIT-N15 — booking/pricing.service.ts promo discount STUB returns 0 (Bug 261 incomplete)

**Where found:** packages/api/src/services/booking/pricing.service.ts:149-151

```ts
// Promo: stub returns 0 until subtask 3 wires services/booking/promo.service.ts.
// Bug 261 fix lands when this stub is replaced with `await resolvePromo({code, subtotalCents, userId})`.
const promoDiscountCents = 0;
```

The `/bookings/pricing-preview` endpoint (booking.routes.ts:291-324) calls THIS pricing service for the customer's price preview. A customer entering a valid promo code sees:

- **Preview:** total = base + addons + surge + serviceFee (NO discount applied)
- **Actual booking creation:** booking.service.ts:194-201 calls `resolvePromo()` directly and applies the discount

This means the customer sees one number in the preview screen and a DIFFERENT (cheaper) number when they actually book. Acceptable when the customer pays less than expected — bad UX but not money loss. BUT:

- Customer with `subtotal < minimumOrderCentavos`: preview shows the booking is allowed (no promo error), but actual creation throws "promo_min_order_not_met" and the booking fails. Customer can't book.
- Customer with `subtotal >= minimumOrderCentavos but discount cap kicks in`: preview shows full price, customer is misled into thinking the code didn't work.

This contradicts Phase 14 D05 closeout claim that Bug 261 server-canonical promo resolution is complete. The promo.service.ts module exists (and works); it's just not wired into the pricing-preview path.

**Impact:**
- Customer-facing inconsistency: preview ≠ booking creation.
- Phase 14 D05 closeout claim partially false: Bug 261 is fixed in createBooking but NOT in pricing-preview.
- Trust erosion when customer realizes discount was promised but not shown.

**Fix:**
1. Replace the stub at line 151 with: `const promoDiscountCents = input.promoCode ? await resolvePromo({code: input.promoCode, subtotalCents: surgeBase + surgeAmountCents, userId: input.userId}) : 0;`
2. Update the BookingPricingInput type to accept optional `promoCode`.
3. Update booking.routes.ts:291-324 (pricing-preview) to pass `promoCode` from request.
4. Add a regression test that asserts pricing-preview matches actual booking creation for promo cases.
5. Update Phase 14 D05 closeout to reflect the actual scope of Bug 261 fix.

## NEW MEDIUM findings (8)

### MED-N147 — referral.service generateCode uses Math.random (predictable)

**Where:** referral.service.ts:38-44

```ts
function generateCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
```

Math.random is not cryptographically random. An attacker who knows when a referral code was generated (e.g., timestamp) and the alphabet (line 36) can predict the next code with reasonable probability and pre-redeem it. Combined with the 10-attempt collision retry (line 63), an attacker can DoS the code generation by spamming codes.

**Fix:** Use `crypto.randomBytes(8)` instead of `Math.random`. Or use UNIQUE constraint with ON CONFLICT DO NOTHING and re-loop only on actual collision.

### MED-N148 — referral.service collision retry pattern fragile

**Where:** referral.service.ts:53-65

`do { generateCode(); SELECT to check; } while (attempts < 10)` — three separate DB queries per attempt. Should use INSERT with `ON CONFLICT DO NOTHING RETURNING id` to atomically check + insert.

### MED-N149 — referral.service redeemReferralCode pre-checks outside transaction

**Where:** referral.service.ts:80-104

Validity checks (lines 84-104) read referral_codes outside the transaction (line 106). Race window: between SELECT and INSERT, another redemption can flip `is_active` or cause `uses_count >= max_uses`.

**Fix:** Move the existence + active checks inside the transaction with `FOR UPDATE` row lock.

### MED-N150 — promotion.service deletePromotion HARD DELETE no audit

**Where:** packages/api/src/services/promotion.service.ts:122-126

```ts
const result = await db.query(`DELETE FROM promotions WHERE id = $1`, [id]);
```

Hard delete with no admin_actions audit. Promotions affect customer-visible marketing copy; admin's deletion of one should be traceable.

**Fix:** Soft-delete via `deleted_at, deleted_by, deleted_reason`. Add admin_actions audit row. Wrap in transaction.

### MED-N151 — promotion.service createPromotion + updatePromotion no audit

**Where:** promotion.service.ts:68-119

Neither createPromotion nor updatePromotion writes admin_actions audit. Marketing-team admin actions are unaudited.

**Fix:** Add audit rows in both. Wrap mutations in transactions.

### MED-N152 — rebooking.service availableProviders SQL doesn't filter by service area radius

**Where:** rebooking.service.ts:120-149

Suggests "available providers" by city/province ILIKE match — but does NOT verify the provider's `service_radius_km` covers the booking's location. Recommended providers may not actually serve the customer's location, leading to wasted match attempts.

**Fix:** Add Haversine + service_radius_km filter (matching pattern from matching.service.ts:93). Or trim recommendations after matching service runs.

### MED-N153 — tip.service non-wallet tips have no completion path

**Where:** tip.service.ts:91-96

```ts
status: method === 'wallet' ? 'completed' : 'pending'
```

Tips paid via gcash/maya/card are inserted as `'pending'`. There's no integration with PayMongo to actually charge the customer's payment method, no webhook handler to flip status to 'completed', and no notification to the provider. Pending tips accumulate forever — provider never sees the money.

**Fix:** Either (a) restrict tipping to wallet method only at the route validator (block non-wallet entirely), OR (b) wire PayMongo payment intent flow + webhook handler analogous to booking payment flow. (a) is shorter for v1.0; document in LAUNCH-LIMITATIONS.

### MED-N154 — booking/promo.service per-customer limit NOT enforced

**Where:** packages/api/src/services/booking/promo.service.ts:15-20

The file header explicitly says:

> "Per-customer limit (`usage_limit_per_customer`) is NOT enforced by this resolver — there is no `promo_redemptions` table in v1.0 to count per-user usage."

Promo codes have a `usage_limit_per_customer` column and the admin UI accepts the value, but it's silently ignored. A customer can apply the same promo to 100 bookings if `usage_limit_total` allows.

**Fix:** Either (a) add `promo_redemptions` table tracking (booking_id, promo_code_id, customer_id) with INSERT inside the booking transaction; check count before resolving, OR (b) remove `usage_limit_per_customer` column from admin UI and the schema until v1.1 to avoid the misleading value. Track on LAUNCH-LIMITATIONS.

## POSITIVE findings

1. **Phase 14 D02 Bug 1170/1198 cancellation policy** — pricing/cancellation.service.ts confirmed end-to-end. Server-canonical from `cancellation_policies` table, Redis-cached 5 min, admin-tunable. Both customer-cancel and provider-no-show paths.
2. **Phase 14 D05 Bug 175** verified at booking/from-quote.service.ts — quote price server-canonical from `booking_quotes.quoted_price`.
3. **Phase 14 D05 Bug 176** verified at booking/pricing.service.ts:99-134 — addon prices server-canonical from `service_addons.price`.
4. **Phase 14 D05 Bug 261** verified at booking/promo.service.ts — promo discount server-canonical from `promo_codes`. Note: only used in createBooking; NOT in pricing-preview (CRIT-N15).
5. **Phase 14 D05 Bug 417** (tip cap) verified at tip.service.ts:33-40 — server-canonical via getSettingNumber.
6. **referral.service properly transactional** for both redemption and bonus crediting (lines 106, 159).
7. **tip.service properly transactional** for wallet-method tips (line 73-131) — wallet debit + tip insert + provider credit + notification all atomic.
8. **rebooking.service excludes cancelled provider** correctly (line 109, 137).
9. **Bug 1271 native fetch** verified — no axios across all 9 files.

## Confirmations

- **Phase 14 D02 Bug 1170/1198** verified at canonical source.
- **Phase 14 D05 Bug 175 / 176 / 261 / 417** all verified at the relevant service entry points.
- **CRIT-N15 (preview ≠ create promo discount)** is NEW — Phase 14 D05 closeout did NOT claim pricing-preview was migrated, but the audit's coverage of D05 missed this gap.

## Cumulative running totals (after Phase N Batch 22)

| | Total | Batch 22 additions |
|---|---:|---:|
| **CRITICAL** | **188 + 1 = 189 real** (2 invalidated of 191) | **+1** |
| **MEDIUM** | **632 + 8 = 640** | **+8** |
| Lines fully read | ~135,574 / 146,236 | +1,596 |
| Coverage | **92.7%** | +1.1% |
