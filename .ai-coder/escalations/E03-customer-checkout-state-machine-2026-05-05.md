# E03 — Customer fixed-price checkout flow blocked by state machine
**Date:** 2026-05-05
**Severity:** CRITICAL — launch blocker
**Found during:** Phase 87 deep audit (continuation)

## What I found

The customer mobile app's fixed-price booking checkout flow at
[apps/mobile/app/customer/booking/checkout.tsx:73-90](apps/mobile/app/customer/booking/checkout.tsx) does:

```ts
const booking = await createBooking({...});       // POST /api/v1/bookings
const intent = await createPaymentIntent(booking.id, selectedMethod); // POST /api/v1/payments/intent
```

These two calls happen back-to-back. There is no dispatch step between them.

## Why it fails

`bookingService.createBooking` always inserts the booking with
`status='requested'` (see
[packages/api/src/services/booking.service.ts:246](packages/api/src/services/booking.service.ts:246)):

```ts
const initialStatus = 'requested';
```

The payment-intent route at
[packages/api/src/routes/payment.routes.ts:30](packages/api/src/routes/payment.routes.ts:30)
gates on the booking-state machine:

```ts
if (!canTransition(booking.status as BookingStatus, 'payment_pending')) {
  throw createAppError(`Cannot pay for a booking in "${booking.status}" status.`, 409);
}
```

The state machine at
[packages/api/src/types/booking.types.ts:67](packages/api/src/types/booking.types.ts:67)
explicitly forbids `requested → payment_pending`:

```ts
requested: ['quoted', 'matched', 'cancelled_by_customer', 'cancelled_by_admin'],
```

And the assertion is locked in by a test at
[packages/api/__tests__/booking-state-machine.test.ts:17-19](packages/api/__tests__/booking-state-machine.test.ts:17):

```ts
it('should NOT allow requested → payment_pending directly (must go through matched)', () => {
  expect(canTransition('requested', 'payment_pending')).toBe(false);
});
```

**Net result:** every customer who reaches the checkout screen for a
fixed-price service hits HTTP 409 "Cannot pay for a booking in 'requested'
status" and sees an "Payment Failed" alert. There is no path through the
mobile UI to actually pay for a fixed-price booking.

## How the spec resolves it

The booking-offer service exists and exposes `kickOfferCycle(bookingId)`
plus a `POST /api/v1/bookings/:id/dispatch` route. The intended flow is
presumably:

1. Customer creates booking → 'requested'
2. POST /:id/dispatch → server calls `kickOfferCycle` → offer to provider
3. Provider accepts within 45s → status = 'matched'
4. Customer notified → opens booking → pays → status = 'payment_pending' → 'paid'

But the mobile customer app **never calls `/dispatch`**. Grep confirms no
such call exists in apps/mobile.

## Three materially different fixes (need Ken's choice)

### Option A: Pay-first, match-second
Change `VALID_TRANSITIONS` to allow `requested → payment_pending`. The
booking is paid into escrow before any provider is matched. After
payment, `kickOfferCycle` is triggered server-side. If matching fails
within the 72h expiry window, the escrow refunds the customer.

**Pros:** Customer UX is what they expect — tap Pay, payment processes,
done. They get a confirmation immediately.

**Cons:**
- The state-machine integrity test fails — has to be deleted/rewritten.
- Funds are held without a counterparty for up to 72h (operationally OK
  since escrow is trusted, but moves money risk earlier).
- "What do I pay" — without a matched provider, the price is fixed by
  subcategory base_price + addons + fees, but the customer could be paying
  for nobody.

### Option B: Match-first, pay-second (with auto-dispatch)
Mobile checkout splits into 2 steps: createBooking + dispatch (which
returns immediately after kicking offer cycle), then a polling/socket
loop until status='matched', then pay.

The actual implementation:
1. createBooking returns booking
2. Mobile immediately calls `POST /:id/dispatch`
3. UI shows "Finding a provider..." spinner
4. Mobile listens via socket for `booking:status_changed` events or polls
   GET /:id every 3s
5. When status becomes 'matched', UI shows "Provider found! [Pay]" button
6. Customer taps Pay → createPaymentIntent

**Pros:** State machine stays clean. Customer sees the matched provider
before paying.

**Cons:** Customer waits 5-45s in the matching loop — bad UX. If matching
fails (no providers available), customer gets a different error path. Now
the booking can sit at 'requested' indefinitely if customer abandons.

### Option C: Hybrid auto-dispatch + pay-now allowance
Keep the current mobile flow but make `bookingService.createBooking`
also kick the offer cycle synchronously (or schedule it inline). AND
allow `requested → payment_pending` so the payment intent doesn't 409
during the 5-45s offer window.

**Pros:** No mobile UX wait, no state-machine surgery, works with one
backend change.

**Cons:** Still has the "what's the customer paying for" problem of
Option A in the brief window where the offer is pending. State-machine
integrity test needs an exception or rewrite.

## My recommendation

**Option A.** It's the simplest, mirrors the marketplace pattern that
customers already expect from Grab/Lalamove/etc (you pay, they find the
worker), and makes the existing checkout.tsx work as written. The
"matched" status becomes information about the provider assignment, not
a precondition for payment.

The test at booking-state-machine.test.ts:17 has to be reverted to allow
the transition, and the comment "must go through matched" is removed.

## What I'm NOT doing

- Not picking the option without Ken's call.
- Not editing the state machine, mobile checkout, or any related code
  until Ken weighs in.
- Not declaring this fixed in any closeout — flagged as a launch
  blocker until resolved.

## Pause point

Documenting and continuing audit on other screens (per Ken's "never stop"
directive). The fix to this specific issue is paused until Ken weighs in.

## Git-history evidence (added 2026-05-05 second pass)

This is a **regression**. The original design was "instant-pay" — exactly
what `checkout.tsx` was written for:

- **Initial commit** (`11c23de`): no `payment_pending` in requested transitions.
- **Phase 4 Soft Launch** (`d7904b4`): ADDED `payment_pending` to the
  `requested` allowed-transitions list. State-machine test asserts:

  ```ts
  it('should allow requested → payment_pending (fixed-price instant-pay)', () => {
    expect(canTransition('requested', 'payment_pending')).toBe(true);
  });
  ```

  Test path-test labeled: `'fixed-price instant-pay path: requested →
  payment_pending → paid_out'`.

- **86a2417** ("comprehensive platform build"): REMOVED `payment_pending`
  from requested. Tests rewritten to assert it's NOT allowed and the path
  to insert a `matched` step:

  ```ts
  it('should NOT allow requested → payment_pending directly (must go through matched)', () => {
    expect(canTransition('requested', 'payment_pending')).toBe(false);
  });
  ```

The 86a2417 commit's body lists feature additions and "critical bug
fixes" — none of them mention the state-machine change or any reason for
removing instant-pay. **The customer mobile checkout.tsx was NOT updated
in the same commit.** This is the regression.

## Recommendation, sharpened

Revert the state-machine change for `requested → payment_pending` (Option A
in the prior recommendation, now framed as fixing a regression rather
than a fresh architectural choice):

- VALID_TRANSITIONS.requested gets `payment_pending` re-added.
- Two test cases at booking-state-machine.test.ts:17-19 and :126-136 are
  reverted to the pre-86a2417 form.
- No mobile UI changes needed — checkout.tsx will work as written.

Ken's call needed: was 86a2417's removal intentional or accidental? If
intentional, the mobile UI needs Option B/C surgery instead. If
accidental, this is a one-line revert.

---

## RESOLUTION (2026-06-10)

Ken's direction (2026-06-10): "audit the repo and fix all of the problems in
the admin panel, provider and customer side of the app" — blanket
authorization to apply the recommended option, same precedent as E01.

**Option A applied (regression revert):**
- `payment_pending` restored to `VALID_TRANSITIONS.requested` in
  `packages/api/src/types/booking.types.ts` with an explanatory comment.
- The two tests that codified the regression reverted; the direct-transition
  test is now `Bug E03 — requested → payment_pending allowed (fixed-price
  instant checkout pays before matching)` and the fixed-price path test no
  longer routes through `matched`.
- No mobile change needed — checkout.tsx works as originally written.

Evidence the removal was accidental (from the investigation above): commit
86a2417's message lists no state-machine change, and the mobile checkout was
never updated to match — the two halves of the product disagreed from that
commit onward.

Shipped via topic branch `fix/e03-checkout-state-machine` (money-path change,
PR for visibility per CLAUDE.md).
