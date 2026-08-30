# E33: fixed-price prepayment auto-dispatch contradicts the approved instant-pay contract

**Date:** 2026-08-30
**Severity:** Critical money/work-authorization risk
**Status:** Open hard stop for dispatch-semantic changes
**Found during:** Admin Booking queue W8 linkage audit

## Bad news first

E03 is marked resolved with Ken's Option A: a fixed-price booking is created,
verified payment moves it to `paid` with escrow `held`, and only then does
provider matching begin. The active operating manuals repeat that contract.

Current code can still offer the fixed-price booking to a provider before
payment:

1. `POST /api/v1/bookings` creates a `requested` booking.
2. `packages/api/src/routes/booking.routes.ts` calls
   `shouldAutoDispatch(created)` and, when `auto_dispatch_enabled` is true,
   calls `kickOfferCycle(created.id)` immediately.
3. `shouldAutoDispatch` accepts any fixed-price booking with coordinates. It
   does not require `paid` or escrow `held`.
4. `kickOfferCycle` accepts `requested`, `matched`, `payment_pending`, and
   `paid`, creates a provider offer, and sends the provider a new-job notice.
5. Provider acceptance can therefore assign a provider before the customer's
   payment is verified.

The payment-time safety net is correct in isolation: wallet success and the
verified external webhook call `dispatchPaidBookingIfNeeded`. The create-time
path bypasses that ordering.

## Why this is a hard stop

- A provider may be asked to reserve or accept work that is not funded.
- Provider training says a real offered/assigned job is paid and held. Current
  behavior can make that statement false.
- Dispatch/support staff may mistake `requested`, `matched`, or
  `payment_pending` records for ready-to-assign work.
- Changing the start condition touches the approved money-to-work state
  machine and therefore requires the money-path branch/PR discipline in
  `AGENTS.md`.
- E32 currently blocks production SSH, so the live value of
  `auto_dispatch_enabled` and any affected production offer rows cannot be
  inspected safely from this session.

## Safe containment applied in W8

The read-only Booking queue does not call a requested or pending booking
"needs assignment." Its assignment signal includes only `provider_id IS NULL`
plus `status = 'paid'`. No booking, offer, payment, escrow, or setting behavior
was changed.

## Recommended correction

Keep E03 Option A as the authority:

1. Do not start a fixed-price offer cycle from booking creation.
2. Start or resume fixed-price matching only from the verified wallet-payment
   transaction or verified payment webhook after `paid` plus held escrow is
   committed.
3. Separate quote-request discovery from fixed-price instant-pay dispatch.
   Quote leads may remain discoverable under their existing quote contract,
   but must not be represented as funded fixed-price jobs.
4. Make every manual/automatic fixed-price dispatch boundary independently
   verify the paid/held record instead of trusting the caller.
5. Add executed regressions for create-before-pay, wallet pay, verified
   webhook pay, duplicate dispatch, provider acceptance, and the provider
   notification payload.
6. Inspect production read-only after E32 is cleared, then use a topic branch
   and PR with exact pre/post data checks before deployment.

## What is not authorized by this record

- Do not disable or mutate the production setting without a verified server
  session, backup, and impact check.
- Do not change quote semantics, escrow amounts, payment authorization, or
  provider compensation as part of a queue/UI fix.
- Do not call E03 regressed or resolved in production until the setting and
  affected rows are checked on the actual server.

## Continuation boundary

Safe read-only admin/customer/provider audits may continue. Any change to
fixed-price dispatch timing, offer acceptance, payment state, or escrow state
stops at this record until the money-path correction is handled under the
required topic-branch/PR process.
