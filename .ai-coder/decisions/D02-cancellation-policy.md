# D02 — Cancellation policy tiers

Decision date: 2026-04-30
Decided by: Ken (delegated to autonomous execution)

Status: RESOLVED

---

## Decision

Option C (custom). Ship sensible launch defaults via migration 071,
AND build an admin editor so the policy is fully configurable from
the admin UI post-launch without code changes or new migrations.

## Seed values for migration 071 (version 1, launch defaults)

Tier 1: min_hours_before=24,  max_hours_before=null, refund=100%, fee=0%,  label="24+ hours before"
Tier 2: min_hours_before=4,   max_hours_before=24,   refund=75%,  fee=25%, label="4-24 hours before"
Tier 3: min_hours_before=0,   max_hours_before=4,    refund=50%,  fee=50%, label="under 4 hours"
Tier 4: min_hours_before=-999,max_hours_before=0,    refund=0%,   fee=100%,label="after scheduled time / no-show"

intro_text: "Cancel anytime. Refunds depend on how close to your booking you cancel."
legal_disclaimer: "Refund processed to original payment method within 5-10 business days. Service fees and taxes are non-refundable except for the 100%-refund tier."

## Provider no-show counterbalance (separate rule, not a tier)

If provider fails to arrive: customer gets 100% refund + ₱200
platform-funded apology credit. Implement as a separate code path
in cancellation.service.ts; this is not part of the tier table.

## Side decisions (defaults accepted)

- Refund destination: original payment method, 5-10 business days
- Provider comp on customer cancellations: provider receives the
  customer-paid fee × provider_share for any tier where customer
  is charged something. Same split as completed booking.
- Recurring cancellations: per-occurrence tiers apply; "cancel the
  series" treated as one cancellation event for the next upcoming
  occurrence + free cancellation for all later occurrences.

## Additional D02 scope: admin editor

Build /admin/settings/cancellation-policy admin page so Ken can edit
the policy from the admin UI post-launch. Full requirements in the
instruction block below. This is bundled into D02 since the database
schema already supports versioned policies; shipping migration 071
without an editor would force every tuning change to require a
developer + migration round-trip.

## Why these defaults

Boracay tourist demographic, flight delays drive most cancellations,
a fair-feeling policy at launch builds review momentum, the values
can be tuned from the admin once real cancellation patterns are
observed. The 50% refund inside 4h covers customer goodwill while
the platform absorbs the difference for committed providers.
