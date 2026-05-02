# Phase B Findings Part 7 — Wallet Routes + Money-Path Validators

Files added in this batch:
- `routes/wallet.routes.ts` (342)
- `validators/booking.validators.ts` (119)
- `validators/payment.validators.ts` (26)
- `validators/payout.validators.ts` (13)
- `validators/tip.validators.ts` (27)
- `validators/wallet.validators.ts` (8)
- `validators/promo.validators.ts` (34)
- `validators/suki.validators.ts` (7)
- `validators/referral.validators.ts` (6)
- `validators/cancellation-policy.validators.ts` (95)

**Phase B running total: ~8,599 lines fully read** (was 7,926; +673 this batch).

---

## CRITICAL bugs (continuing from CRIT-35)

### CRIT-36 — Wallet top-up endpoint has no Zod validation, accepts non-integer amounts
**File:** [packages/api/src/routes/wallet.routes.ts:70-114](packages/api/src/routes/wallet.routes.ts#L70)
```ts
router.post('/top-up', authMiddleware, async (req, res, next) => {
  const { amount, paymentMethod } = req.body as { amount: number; paymentMethod: string };
  if (!amount || typeof amount !== 'number' || amount < platformConfig.minimumTopUpAmount) {
    throw createAppError(`Minimum top-up amount is ${formatPHP(...)}`, 400);
  }
  // ... no integer check
```
- No validationMiddleware (no Zod schema for top-up).
- `typeof amount !== 'number'` doesn't catch NaN, Infinity, or fractional values.
- `100.5` passes the type check, gets passed to `paymentService.createPaymentIntent`, stored in payment_intents.amount.
- Webhook later credits user wallet with the fractional value — wallet balance becomes a fractional centavo. Subsequent integer-only DB constraints (if any) then fail; or worse, the fractional amount silently propagates through the system.

**Fix dispatch:**
```
1. Add validators/wallet.validators.ts:topUpSchema:
   z.object({
     amount: z.number().int().positive().min(platformConfig.minimumTopUpAmount).max(platformConfig.maximumTopUpAmount),
     paymentMethod: z.enum(['gcash','maya','card','qrph','bank_transfer']),
   }).strict()
2. Apply validationMiddleware(topUpSchema).
3. Test: amount=100.5 → 400; amount=-100 → 400; amount=Infinity → 400.
```

### CRIT-37 — TWO parallel withdrawal flows; one bypasses pending-payout check
**Files:**
- [packages/api/src/routes/payout.routes.ts:17-30](packages/api/src/routes/payout.routes.ts#L17) — `POST /payouts/request` → calls `payoutService.requestPayout`
- [packages/api/src/routes/wallet.routes.ts:116-183](packages/api/src/routes/wallet.routes.ts#L116) — `POST /wallet/withdraw` → DIRECT INSERT into payouts table

`payoutService.requestPayout` (payout.service.ts:62-68) checks for existing pending/processing/approved payouts and rejects with 409. But `/wallet/withdraw` bypasses this entirely — directly inserts a new payouts row in its own transaction. Provider can stack multiple pending withdrawals, doubling debits.

**Fix dispatch:**
```
1. Decision: deprecate /wallet/withdraw OR re-route it through payoutService.requestPayout.
   - Recommendation: redirect /wallet/withdraw to call payoutService.requestPayout. Same UX, same pending-payout guard.
2. Migration risk: any active mobile clients calling /wallet/withdraw must keep working — refactor the handler body, don't remove the route.
3. Add tests:
   - Provider has pending payout via /wallet/withdraw, then calls /payouts/request → 409.
   - Provider has pending payout via /payouts/request, then calls /wallet/withdraw → 409.
   - Currently second call SUCCEEDS (the bug).
```

### CRIT-38 — Withdrawal accepts arbitrary destinationAccount without name verification
**Files:**
- [packages/api/src/validators/wallet.validators.ts](packages/api/src/validators/wallet.validators.ts) (8 lines)
- [packages/api/src/validators/payout.validators.ts:3-9](packages/api/src/validators/payout.validators.ts#L3)

`destinationAccount` accepts any 1-255 (wallet) or 5-255 (payout) char string. No format check per method (gcash should be 09xx number; bank_instapay should be account number). No verification that the account holder name matches the verified provider identity.

A compromised provider session could redirect payouts to an attacker's gcash account.

**Fix dispatch:**
```
1. Add format validation per method:
   - gcash/maya: regex /^(?:\+?63|0)9\d{9}$/ (PH mobile)
   - bank_instapay/bank_pesonet: regex for 10-16 digit account number + bank code
2. Require accountName field; compare against the provider's verified KYC name (providers table). Soft match (Levenshtein distance < 3) acceptable but log mismatches for review.
3. For first-time withdrawals OR new destinationAccount, require additional confirmation (email/SMS OTP).
4. Test: gcash with non-PH phone format → 400.
```

---

## MEDIUM bugs

### MED-43 — Top-up ID format coupling with booking webhook
**File:** [packages/api/src/routes/wallet.routes.ts:90](packages/api/src/routes/wallet.routes.ts#L90)
`topUpId = topup_${userId}_${Date.now()}` — string concatenation. Webhook handler at [webhook.routes.ts:115-144](packages/api/src/routes/webhook.routes.ts#L115) parses it back via `bookingId.split('_').slice(1, -1).join('_')`. UUIDs without underscores are safe, but if user_id format ever changes to include `_`, parsing breaks.

**Fix:** pass `intent_type: 'topup'` and `userId` in PayMongo metadata fields directly; don't encode in the booking_id.

### MED-44 — Payout preferences PUT has no Zod validation; empty string overwrites
**File:** [packages/api/src/routes/wallet.routes.ts:273-326](packages/api/src/routes/wallet.routes.ts#L273)
- No validationMiddleware.
- Line 305: `[frequency ?? null, ..., destinationAccount ?? null, ...]`. If client sends `destinationAccount: ''`, `?? null` keeps empty string. SQL COALESCE($4 ?? null) overwrites with empty. Provider's saved account erased.

**Fix:** add Zod schema with `.min(5)` on destinationAccount when present; validate before COALESCE.

### MED-45 — Refund validator has no max amount cap
**File:** [packages/api/src/validators/payment.validators.ts:8-12](packages/api/src/validators/payment.validators.ts#L8)
```ts
amount: z.number().int().positive('Refund amount must be positive'),
```
No upper bound. Combined with CRIT-01 (status check blocks valid partial refunds anyway), refund flow is broken in two directions.

**Fix:** add `.max(10_000_000)` (₱100K hard cap as defense-in-depth) — actual booking-amount cap enforced in service.

### MED-46 — WebhookEventSchema only declares shape but isn't actually applied
**File:** [packages/api/src/validators/payment.validators.ts:14-26](packages/api/src/validators/payment.validators.ts#L14)
The schema exists but `webhook.routes.ts` doesn't use validationMiddleware on `/paymongo` (it manually checks `req.body?.data?.attributes`). Dead code OR missing wiring.

**Fix:** apply `validationMiddleware(webhookEventSchema)` to /paymongo OR delete the unused schema.

### MED-47 — Payout-preference frequency 'daily' creates massive payout volume
**File:** [packages/api/src/routes/wallet.routes.ts:284](packages/api/src/routes/wallet.routes.ts#L284)
Allows `frequency: 'daily'`. Combined with `payout_min_threshold`, this could trigger one payout per day per provider. PayMongo has per-transfer fees. Need to check business model — if fees absorbed by platform, could be a money sink. Document.

---

## LOW / INFO

- **STRONG validators:**
  - `booking.validators.ts` — all schemas use `.strict()` (rejects unknown keys), PH lat/lng bounded, change-order hard cap enforced (D05/Bug 1219). Good architecture.
  - `tip.validators.ts` — `.strict()`, hard cap 10M centavos. Default to wallet. Phase 14 D05/Bug 417 fix in place.
  - `cancellation-policy.validators.ts` — Excellent cross-row validation: refund + fee = 100, contiguous tier coverage, bottom-tier covers no-show. Strong defense.
  - `promo.validators.ts` — Both admin and customer schemas, `.strict()`.

- **Top-up flow** correctly creates a payment intent with a pseudo-bookingId and the webhook handler routes back to wallet credit.

- **Wallet route GET endpoints** (line 29-67) are simple, correct, paginated.

- **Withdrawal transaction** at [wallet.routes.ts:149-171](packages/api/src/routes/wallet.routes.ts#L149) IS atomic (the wallet UPDATE + transaction INSERT + payouts INSERT all in one tx). Good. The bug is that the OUTER pending-payout check is missing (CRIT-37).

---

## What's still NOT read in money path

- `services/invoice.service.ts` (498)
- `services/or.service.ts` (807) — BIR receipts
- `services/bir-2307.service.ts` (842) — BIR withholding tax
- `services/vat-report.service.ts` (645)
- `services/booking-admin.service.ts` (1,143)
- `services/financial-admin.service.ts` (1,065)

These contain the BIR/financial code paths — read in next batch.
