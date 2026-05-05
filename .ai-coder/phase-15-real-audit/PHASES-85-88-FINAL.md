# Phases 85–88 — Continuation deep audit pass (2026-05-05, part 2)

Four phases continuing the screen-by-screen audit started in Phases
17–84. Same recipe: read full source, identify gaps, fix narrowly, verify
with tsc + jest, commit atomically with co-author attribution. Phase 87
surfaced a launch-blocker regression that needs Ken's call — escalation
file `.ai-coder/escalations/E03-customer-checkout-state-machine-2026-05-05.md`.

## Real bugs found and fixed

### BUG-PHASE85-01 — Customer recurring screens missing enriched fields

**Files:** `packages/api/src/services/recurring.service.ts`,
`packages/api/__tests__/bug-phase85-01-recurring-enrichment.test.ts`

The customer recurring list (`apps/mobile/app/customer/recurring/index.tsx`)
and detail (`apps/mobile/app/customer/recurring/[id].tsx`) screens read
fields the backend never returned:

- `categoryName`, `subcategoryName` (the title row)
- `nextScheduledDate` (the "Next: …" row + Skip Next button gate)
- `totalCompleted`, `totalSkipped` (the counters)
- `providerName` (detail screen)

The backend's `getCustomerRecurringBookings` and `getRecurringBooking`
both did `SELECT * FROM recurring_bookings`, and `formatRecurringBooking`
mapped scalar columns only.

User-visible breakage pre-fix:

- Title row blank (subcategoryName ?? categoryName both undefined).
- "Next: …" row never appeared on either screen.
- Skip Next button never showed (gated on nextScheduledDate truthiness).
- "Completed" / "Skipped" counters showed undefined.
- Provider name never appeared on the detail screen.

**Fix:** Shared `RECURRING_SELECT_WITH_JOINS` preamble used by both
detail-by-id and customer-list queries. JOINs `service_categories`,
`service_subcategories`, `providers`, `users`, and aggregates
`recurring_instances` counts (completed via `b.status='completed'`,
skipped via `ri.status='skipped'`). `formatRecurringBooking` exposes the
new fields plus `nextScheduledDate` alias and `cancelReason` alias so the
mobile screens render correctly without a client-side rewrite.

**Test:** 7 assertions covering the SQL shape (table joins, aggregate
predicates, list query parity with detail) and formatter exposure
(present, fallbacks for missing data, alias mirrors).

### BUG-PHASE86-01 — Quote-accepted bookings stuck on payment_pending

**Files:** `apps/mobile/app/customer/booking/pay.tsx` (new),
`apps/mobile/app/customer/booking/[id].tsx`,
`apps/mobile/app/customer/booking/quotes.tsx`,
`apps/mobile/__tests__/bug-phase86-01-pay-existing-booking.test.ts`

When a customer accepted a quote on a quote-based booking, the server
moved booking.status to `payment_pending` and the mobile app routed to
`/customer/booking/[id]` (the booking detail). That screen had branches
for `ACTIVE_STATUSES`, `COMPLETED_STATUSES`, `CANCELLABLE_STATUSES`, and
`NEEDS_CONFIRMATION` but no `payment_pending` branch.

User-visible breakage pre-fix: after tapping "Accept Quote" the customer
saw only "Cancel Booking" and "Chat with Provider" — no path to actually
pay. The accepted quote could not be redeemed without re-creating the
booking from scratch (and the same provider may not re-quote).

**Fix:**

1. New screen `apps/mobile/app/customer/booking/pay.tsx` that takes a
   `bookingId`, fetches the booking, refuses non-payment_pending states,
   shows the receipt + payment-method picker, and calls
   `createPaymentIntent(bookingId, method)`. On wallet, the API debits
   + funds escrow synchronously; on gcash/maya/card/qrph, the returned
   `checkoutUrl` is opened via Linking. Same 5 channels as the
   new-booking checkout for parity.
2. Booking detail renders a "Complete Payment" button that routes to
   `/customer/booking/pay?bookingId=…` when `status === 'payment_pending'`.
3. Quotes accept-success now routes directly to `/pay` instead of the
   dead-end booking detail.

**Test:** 8 assertions covering the new screen's wiring (right service
calls, status guard, all 5 payment channels, checkout URL flow), the
booking detail's Complete Payment button gating, and the quotes accept
flow's new route + removal of the old dead-end.

### BUG-PHASE88-01 — Promotion ctaLink fails for external URLs

**Files:** `apps/mobile/app/(tabs)/home.tsx`,
`apps/mobile/__tests__/bug-phase88-01-promo-cta-link.test.ts`

`promotions.cta_link` (migration 044) is `VARCHAR(500)` with no format
constraint. Operators set it to either internal paths
(`/customer/category/cleaning`) or external URLs
(`https://onservice.ph/promo`). Pre-fix the home tab passed it straight
to `expo-router`'s `router.push`, which silently fails for external
URLs — the customer's tap on the promo CTA did nothing.

**Fix:** Route by shape. Internal paths (`startsWith('/')`) still go
through `router.push`; http/https URLs go through `Linking.openURL`;
anything else (malformed string, mailto:, tel:) is ignored — no crash,
no unintended external-protocol launch.

**Test:** 4 source-shape assertions covering import, both branches, and
absence of the pre-fix unconditional `router.push`.

## Phase 87 — Escalation E03 (no code change yet)

Phase 87's audit surfaced a critical regression: the customer fixed-price
checkout flow at `apps/mobile/app/customer/booking/checkout.tsx` calls
`createBooking` + `createPaymentIntent` back-to-back. `createBooking`
inserts with `status='requested'`; the payment-intent route gates on
`canTransition('requested','payment_pending')` which has returned `false`
since commit `86a2417`. **Every fixed-price customer purchase hits HTTP
409 "Cannot pay for a booking in 'requested' status".**

The original design (initial commit + d7904b4) supported instant-pay —
the test file at booking-state-machine.test.ts:17 was once labeled
"requested → payment_pending (fixed-price instant-pay)" returning `true`.
86a2417 inverted it without updating the mobile UI. No end-to-end test
covers the customer checkout flow, so the regression went unnoticed.

Three fix options written up in
`.ai-coder/escalations/E03-customer-checkout-state-machine-2026-05-05.md`.
Recommended: one-line revert of the state-machine change. Halted on this
specific issue pending Ken's call; continued auditing other screens.

## Verification

| Phase | Mobile jest | API jest | tsc |
|-------|-------------|----------|-----|
| 85    | 400/400     | 2505/2505 (incl. 7 new) | clean |
| 86    | 408/408 (incl. 8 new) | 2505/2505 | clean |
| 87    | n/a (no code change — escalation only) | n/a | n/a |
| 88    | 412/412 (incl. 4 new) | 2505/2505 | clean |

## Cumulative since Phase 17

- Phases 17–62: 112 bugs
- Phases 63–84: 30 bugs + 22 stale tests
- Phases 85, 86, 88: 3 bugs
- Phase 87: 1 escalation (E03 — launch blocker)

**Total: 145 real bugs surfaced and fixed since Phase 17 deep-audit pass
began. Plus 1 escalated launch-blocker regression awaiting Ken.**

## Commits

```
7e00fa0 fix: Phase 88 — promo carousel ctaLink silently fails on external URLs — 1 real bug fixed
845a9a0 escalation: E03 — customer fixed-price checkout broken by state-machine regression
6643ecc fix: Phase 86 — quote-accepted bookings stuck on payment_pending — 1 real bug found + fixed
9429b00 fix: Phase 85 — customer recurring screens missing enriched fields — 1 real bug found + fixed
```

## Patterns observed (carry-over from Phases 63–84)

The same bug families keep surfacing. Phase 85–88 added:

7. **Server response missing UI-required fields** — backend ships the
   `SELECT *` shape, frontend has been quietly evolving its consumed
   field list. The drift accumulates until a UI ships visibly broken
   to the user. (Phase 85 — recurring enrichment.)
8. **Status-machine state with no UI affordance** — the booking enters
   `payment_pending` after quote-accept but no screen exposes the
   action that resolves that state. The state-machine and the UI's
   button matrix have to agree, and they're maintained separately.
   (Phase 86 — pay-pending.)
9. **State-machine regression with no integration test backstop** —
   commit 86a2417 changed `requested → payment_pending` from allowed to
   disallowed without updating the mobile UI. The state-machine unit
   tests caught the rule change but no end-to-end test exercised the
   actual customer checkout flow, so the regression sat in production
   undetected. (Phase 87 / E03.)
10. **Free-text URL fields rendered with one transport** — promotions'
    `cta_link` is admin-managed free text that can be either an internal
    path or an external URL, but the consumer code assumed one transport.
    (Phase 88.)

## What's still genuinely outstanding

Updated from PHASES-63-84-FINAL.md:

1. **NEW LAUNCH BLOCKER:** E03 — customer fixed-price checkout 409s on
   every purchase due to state-machine regression in 86a2417. Awaiting
   Ken's call between three documented fix options (recommendation: revert).
2. F#3 + F#4 baseline capture — F#4 done; F#3 blocked on simulator
3. F#10 attorney-reviewed disclaimer wording
4. 12 D14 operational items

Plus the v1.1+ candidates documented in earlier closeouts.
