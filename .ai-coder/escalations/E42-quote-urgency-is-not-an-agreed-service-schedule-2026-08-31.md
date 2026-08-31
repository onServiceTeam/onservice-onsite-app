# E42 — Quote urgency is being treated as an agreed service schedule

Date: 2026-08-31
Status: OPEN — architecture, dispatch, cancellation, and money-path hard stop
Raised by: customer/provider/admin linkage audit

## Bad news

Custom-quote requests currently receive an exact `bookings.scheduled_at` timestamp that neither the customer nor a provider selected or agreed to.

`createJobRequest()` converts the customer's broad urgency answer into a synthetic timestamp:

- `same_day` becomes the current time plus 4 hours;
- `within_3_days` becomes the current time plus 2 days;
- `within_a_week` becomes the current time plus 5 days;
- `flexible` becomes the current time plus 7 days.

That timestamp is stored as the booking's canonical schedule. The provider quote contract accepts estimated duration or estimated days, but no proposed start time or completion date. Quote acceptance assigns the provider and price and moves the booking to `payment_pending` without replacing or confirming the synthetic schedule.

## Why this is unsafe

This is not only display copy. `scheduled_at` is operational input across the platform:

- customer and provider booking records display it as the appointment;
- provider availability and conflict matching use it;
- admin dispatch and past-scheduled attention queues use it;
- cancellation and refund calculations use hours until the scheduled time;
- provider tools, invoices, receipts, notifications, and service-date reporting use it.

A customer asking for work "within 3 days" can therefore be shown, dispatched, charged cancellation consequences, or treated as overdue against an exact time that was never agreed. Support has no reliable record from which to distinguish a real appointment from this placeholder.

## Repository contract

The product specification says a structured provider quote includes an estimated start date, duration, and completion date. The live quote model and provider quote builder capture duration only. The customer acceptance step does not confirm a schedule.

Relevant implementation:

- `packages/api/src/services/booking.service.ts` — `createJobRequest`, `submitStructuredQuote`, and `acceptQuote`
- `packages/api/src/validators/booking.validators.ts` — `submitQuoteSchema`
- `packages/api/migrations/018_quotes_change_orders.sql` — quote fields have `estimated_days`, but no proposed schedule fields
- `apps/mobile/app/provider/job/[id]/quote.tsx` — duration only
- `apps/mobile/app/customer/booking/[id].tsx` and `apps/mobile/app/provider/job/[id].tsx` — display `scheduledAt` as the schedule
- `apps/admin/src/pages/BookingDetailPage.tsx` and dispatch services — use `scheduledAt` operationally

## Decision required

The platform needs one canonical quote scheduling agreement model before the placeholder can safely be removed. The main choices are:

1. Provider proposes a start time or bounded arrival window in each quote. Accepting the quote also accepts that schedule, subject to an explicit final confirmation before payment.
2. Customer accepts scope and price first, then customer and provider complete a separate schedule-agreement step before payment and dispatch.
3. Customer selects an exact schedule before requesting quotes, limiting eligible providers and making every quote refer to that same requested slot.

## Recommendation

Use option 1 for ordinary quote jobs: require a provider-proposed start time plus an arrival window and estimated duration; show it in quote comparison; make quote acceptance explicitly confirm scope, price, and schedule together. If a provider needs an assessment visit first, model that as a separate quoted visit rather than pretending the final job is scheduled.

For large projects, follow the project and milestone decision instead of forcing one appointment onto the entire project.

Before implementation, confirm how schedule changes after acceptance work and how cancellation clocks begin. This decision affects payment/refund behavior and existing production records, so it must not be inferred in code.

## Containment

- Do not describe the synthetic timestamp as customer/provider agreement in new UI or documentation.
- Do not add new dispatch, cancellation, or money behavior that relies on the quote placeholder.
- Do not backfill or rewrite existing quote bookings until production data has been measured and a migration plan is approved.
- Continue unrelated customer, provider, and admin audit work.
