# E41 — Recurring provider assignment conflicts with D29

Date: 2026-08-31
Status: OPEN — architecture decision required
Raised from: customer recurring-work linkage audit

## Bad news

The current recurring setup persists the provider from the original booking and the recurring scheduler later creates each generated booking with that `provider_id` already populated. There is no provider-first offer, provider acceptance, service-area revalidation, current-service validation, current-availability validation, or customer fallback choice.

This conflicts with the open D29 decision, which pauses persisting a chosen provider and direct assignment until preferred-provider-first offer semantics are approved and implemented.

## Evidence

- `apps/mobile/app/customer/booking/make-recurring.tsx` posts `providerId: booking.providerId` when the customer creates a recurring series.
- `packages/api/src/services/recurring.service.ts:createRecurringBooking` writes that value to `recurring_bookings.provider_id`.
- `packages/api/src/services/recurring.service.ts:generateDueRecurringBookings` copies `rb.provider_id` into each new `bookings.provider_id` while creating the booking with `status = 'requested'`.
- The generator does not create or wait for a provider offer/acceptance record.
- `.ai-coder/decisions/D29-repeat-provider-selection-semantics.md` pauses storing a preferred provider, direct assignment, offer cancellation, and fallback behavior. Its recommended design is a validated provider-first offer that requires provider acceptance.

## Why this cannot be fixed as a screen-only change

Removing `providerId` from the customer payload would stop the silent assignment, but the current recurring generator does not fan an unassigned generated booking out to eligible providers. That risks creating stranded requested bookings. Keeping the field preserves a provider-consent and eligibility problem. Relabeling the screen would not change either fact.

## Recommendation

Resolve this as part of D29 Option A:

1. Treat the series provider as an optional preferred provider, not an assignment.
2. Revalidate provider approval, service, service area/radius, schedule, and conflicts for every generated visit.
3. Create a provider-first offer and require acceptance.
4. Ask the customer before falling back to normal matching after decline or expiry.
5. Keep each generated booking, offer, acceptance, fallback decision, notification, and support event in the booking audit record.
6. Add concurrency tests proving no competing offer or direct assignment survives acceptance.

## Containment until resolved

- Do not add new recurring-provider promises or direct-assignment entry points.
- Do not change generated-booking assignment, matching, or pricing as an incidental UX fix.
- Keep recurring auto-charge disabled under E20.
- Continue read-only, responsive, error-state, and truthful linkage work that does not alter assignment semantics.

## Decision needed

Approve D29 Option A and include existing recurring-series provider behavior in its migration and rollout plan, or explicitly choose a different documented provider-consent model.
