# Phase B Findings — Money Path (Part 1 of N)

Files read in full so far:
- `packages/api/src/utils/currency.ts` (10 lines)
- `packages/api/src/services/payment.service.ts` (204 lines)
- `packages/api/src/services/commission.service.ts` (113 lines)
- `packages/api/src/services/wallet.service.ts` (199 lines)
- `packages/api/src/services/escrow.service.ts` (759 lines)
- `packages/api/src/services/payout.service.ts` (290 lines)
- `packages/api/src/services/tip.service.ts` (186 lines)

**Subtotal so far: 1,761 lines fully read in this audit.**

---

## CRITICAL bugs (data loss, money loss, compliance gap)

### CRIT-01 — Cannot partial-refund a payment more than once
**File:** [packages/api/src/services/payment.service.ts:137-139](packages/api/src/services/payment.service.ts#L137)
```ts
if (intent.status !== 'succeeded') {
  throw createAppError('Can only refund succeeded payments.', 409);
}
```
After the first partial refund, `status` becomes `'partially_refunded'`. Any subsequent partial refund (legitimate use case — disputes resolved in stages, multi-step compensation) is rejected with 409.

**Fix:** allow `succeeded` OR `partially_refunded`. Then track cumulative refunded amount in metadata or a new `refunded_amount` column to compute "is this fully refunded now?" instead of comparing to `intent.amount`.

**Dispatch instruction for AI coder:**
```
1. Read packages/api/migrations/ list — pick the next migration number after 088.
2. Write migration: `ALTER TABLE payment_intents ADD COLUMN refunded_amount BIGINT NOT NULL DEFAULT 0;`
3. Backfill: `UPDATE payment_intents SET refunded_amount = amount WHERE status = 'refunded';`
4. Edit payment.service.ts:processRefund:
   - Allow status in ('succeeded', 'partially_refunded').
   - Compute new refunded_amount = current refunded_amount + refundAmount.
   - Reject if new refunded_amount > intent.amount.
   - Status: if refunded_amount === intent.amount → 'refunded', else 'partially_refunded'.
5. Add tests:
   - Bug CRIT-01 partial-refund-twice: first partial 30%, second partial 30%, expect both succeed and status='partially_refunded' with refunded_amount = 60% of total.
   - Bug CRIT-01 reject overrefund: refund > remaining must throw 409.
6. Real assertion test, not file-existence — render the actual flow against a test pg and assert the refund row exists + state is correct.
```

### CRIT-02 — PayMongo refund call uses wrong ID field (likely never works in prod)
**File:** [packages/api/src/services/payment.service.ts:144-156](packages/api/src/services/payment.service.ts#L144)
```ts
data: {
  attributes: {
    amount: refundAmount,
    payment_id: intent.paymongo_intent_id,  // ← intent ID, not payment ID
    reason: 'requested_by_customer',
    notes: reason,
  },
},
```
PayMongo's refund API expects the actual `payment.id` (e.g. `pay_XYZ`), not the `payment_intent.id` (e.g. `pi_XYZ`). The intent has many payments; the refund attaches to the specific payment that succeeded. Code is sending the intent ID.

**Verification needed:** confirm against the live PayMongo response shape what `paymongo_intent_id` actually stores. If it stores the intent ID (which the variable name and INSERT at line 84-88 suggest), refunds in production are broken.

**Fix sketch:**
```
1. After payment succeeds in webhook, also store the payment.id (pay_XYZ) on the payment_intents row, e.g. paymongo_payment_id column.
2. Use paymongo_payment_id in the refund call.
3. If multiple payments per intent (rare for one-shot), need a payments table.
4. Verify by triggering a real refund in PayMongo sandbox.
```

### CRIT-03 — Money conservation check logs but doesn't throw on booking amount mismatch
**File:** [packages/api/src/services/escrow.service.ts:68-73](packages/api/src/services/escrow.service.ts#L68)
```ts
if (Math.abs(totalAmount - (servicePrice + serviceFee)) > 1) {
  logger.error('Booking amount mismatch detected', {...});
  // ← no throw! continues with wrong numbers
}
```
If booking row has `total_amount = 1500` but `service_price + service_fee = 1400` (data corruption from older migrations or bad pricing), the escrow release proceeds anyway. The downstream conservation check at line 90-102 catches a different invariant (sum of distributions = total) but won't catch a corrupt booking row whose totals are internally consistent.

**Fix:** make this throw. Refusing to release escrow on a corrupt booking is correct.

### CRIT-04 — Inconsistent guarantee fund calculation in two places
**File:** [packages/api/src/services/commission.service.ts:42](packages/api/src/services/commission.service.ts#L42) vs [packages/api/src/services/escrow.service.ts:85](packages/api/src/services/escrow.service.ts#L85)
- `commission.service.ts` computes guarantee fund from the **clamped service fee** (`serviceFeeAmount` after min/max clamp).
- `escrow.service.ts` computes guarantee fund from the **booking's stored service_fee** (which was set at quote time using clamped fee).

Normally these match. They diverge if:
- Settings (service_fee_min/max or guarantee_fund_rate) change between quote and release.
- The booking's stored service_fee is from a different code path that doesn't clamp.

This means quote-time math and release-time math can disagree on guarantee fund contribution by a few centavos to a few pesos per booking. Over 10,000 bookings/month this is non-trivial.

**Fix:** lock all money math at quote time and store the breakdown on the booking row (commission_rate, commission_amount, service_fee_rate, service_fee_amount, guarantee_fund_rate, guarantee_fund_amount, provider_receives, platform_retains) as immutable snapshot. Release reads from the snapshot, doesn't recompute.

### CRIT-05 — Non-wallet tips silently never reach the provider
**File:** [packages/api/src/services/tip.service.ts:71-127](packages/api/src/services/tip.service.ts#L71)
- If `paymentMethod !== 'wallet'` (i.e. gcash/maya/card), tip is INSERT'd with `status='pending'`.
- No PayMongo intent is created.
- Provider's wallet is NOT credited.
- Provider notification is NOT sent.

So a customer can choose gcash for a tip, the UI says "Tip sent!", but nothing happens. The tip row sits at status='pending' forever.

**Fix:**
```
Either:
(a) Disable non-wallet payment methods for tips (and remove from validators/UI), OR
(b) Wire payment.service.createPaymentIntent for gcash/maya/card tips, store paymongo_intent_id on the tip row, mark completed on webhook, then credit provider wallet from the webhook handler.
Recommendation: (a) for v1.0 launch — wallet-only tips. Re-enable card tips post-launch when webhook reconciliation is solid.
```

### CRIT-06 — Provider cancellation compensation pays no commission to platform
**File:** [packages/api/src/services/escrow.service.ts:380-415](packages/api/src/services/escrow.service.ts#L380)
When a customer cancels late (provider already arrived, etc), provider gets `refund.providerCompensationAmount` paid as a straight 100% transfer from escrow → provider wallet. **No commission is deducted from this comp payment.** Platform gets nothing on the comp portion of the cancellation.

Two interpretations:
- **Spec intent:** Cancellation comp is a goodwill/protection payment to provider, platform doesn't take a cut. Acceptable.
- **Bug:** Provider should still net `comp - commission`, platform should retain `commission` on comp. Standard marketplace behavior.

**Decision needed from Ken:** which is the right business rule? File `.ai-coder/decisions/D-money-cancellation-commission.md` and pause.

### CRIT-07 — Service fee retained on customer no-show, but the receipt to provider is silent
**File:** [packages/api/src/services/escrow.service.ts:417-444](packages/api/src/services/escrow.service.ts#L417)
On customer no-show, platform takes the full service_fee. Provider also gets `providerCompensationAmount` (which is `servicePrice * 1.0` since customer-no-show refund% is 0). But provider receives no notification of "you've been compensated for the no-show." (No notification INSERT in this branch.)

**Fix:** add notification INSERT in the no-show fee retention block.

---

## MEDIUM bugs

### MED-01 — payment.service.ts swallows refund error in dev/test
**File:** [packages/api/src/services/payment.service.ts:158-162](packages/api/src/services/payment.service.ts#L158)
In non-prod, if PayMongo refund call fails, the error is logged and silently dropped. The DB then marks the refund as 'refunded' anyway. So in staging/sandbox, you get false-positive refund successes that mask integration bugs. Should at minimum re-throw in NODE_ENV=test.

### MED-02 — completePayout doesn't require paymongoTransferId
**File:** [packages/api/src/services/payout.service.ts:177-216](packages/api/src/services/payout.service.ts#L177)
`paymongoTransferId?: string` is optional. Without it, reconciliation against PayMongo bank transfer reports is impossible. Should require.

### MED-03 — completePayout doesn't log to admin_actions
**File:** [packages/api/src/services/payout.service.ts:177-216](packages/api/src/services/payout.service.ts#L177)
Approve/reject log to admin_actions. Complete doesn't. Audit trail gap — who marked the payout completed?

### MED-04 — OR (BIR receipt) issuance silently failing leaves no trail in legacy releaseEscrow
**File:** [packages/api/src/services/escrow.service.ts:182-197](packages/api/src/services/escrow.service.ts#L182)
`try { await orService.issueOR(...) } catch { logger.error(...) }`. OK to be best-effort, but there's no follow-up: no retry queue, no admin alert, no `bookings.or_status='failed'` flag for ops to find later. Silently broken receipts = BIR compliance risk.

**Fix:** add a `bookings.or_issuance_status` column with values `pending|issued|failed`. On failure set to `failed` and surface in the admin DispatchConsole / FinancialsPage. Add a worker that retries failed ORs nightly.

### MED-05 — partial escrow release uses live-recomputed commission, not snapshot
**File:** [packages/api/src/services/escrow.service.ts:235](packages/api/src/services/escrow.service.ts#L235)
`releasePartialEscrow` calls `calculateCommission(proportionalServicePrice, tier)` which reads live settings. If commission rate changed between booking and dispute resolution, partial release uses the new rate, not the rate the customer was quoted. Fairness/audit issue.

**Fix:** same as CRIT-04 — snapshot money math at quote time, release reads snapshot.

### MED-06 — `getWalletTransactions` default page size of 20 is small for power users / admin views
**File:** [packages/api/src/services/wallet.service.ts:153](packages/api/src/services/wallet.service.ts#L153)
Provider with 100 jobs/month sees 5 pages of transactions. UX friction. Bump default to 50, allow up to 200.

---

## LOW / INFO

- `currency.ts` is fine but only formats display strings. Comparing centavos as Number is fine up to 9e15. No silent rounding, good.
- `wallet.service.ts:debitWallet` uses `WHERE available_balance >= $1` as the row-level guard — correct race-safe pattern.
- `payout.service.ts` enforces single pending payout per provider — good UX.
- `escrow.service.ts` `*InTransaction` variants (Phase 14 D06) correctly delegate post-commit side effects (OR issuance, gateway refund) to caller. Good pattern.

---

## What's left in money path for this Phase B

Still to read in full (with line counts):
- `services/promotion.service.ts` (144 lines)
- `services/referral.service.ts` (248 lines)
- `services/suki.service.ts` (335 lines)
- `services/rebooking.service.ts` (258 lines)
- `services/booking/{from-quote,pricing,promo,surge}.service.ts` (492 total)
- `services/pricing/cancellation.service.ts` (268 lines)
- `services/pricing.service.ts` (411 lines)
- `services/booking.service.ts` (1,197 lines) ← THE BIG ONE
- `services/reconciliation.service.ts` (472 lines)
- `routes/booking.routes.ts` (1,025 lines)
- `routes/wallet.routes.ts` (342 lines)
- `routes/payment.routes.ts` (117 lines)
- `routes/payout.routes.ts` (160 lines)
- `routes/tip.routes.ts` (86 lines)
- `routes/webhook.routes.ts` (line count TBD — webhook handler probably critical)

Subtotal still TBD: ~5,800+ lines. Will continue in same Phase B.
