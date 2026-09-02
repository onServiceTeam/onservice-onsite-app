# E63: Founding-provider 12-month commission entitlement is not enforced

**Date:** 2026-09-02

**Status:** OPEN: provider-contract and money-path decision required
**Hard-stop reason:** Current recruiting and operations material promises a
city-limited, time-protected commission benefit that the data model and Admin
controls cannot identify or enforce.

## Bad news first

Current strategy and operations material describes the Founding offer as the
first 50 providers per city receiving 10% commission for 12 months. The app
stores only `providers.tier = 'founding'` and a global/effective-dated
commission schedule. It does not store:

- the city or service-area cohort that granted the benefit;
- the provider's position inside a 50-provider cap;
- the entitlement start or protected end timestamp;
- the offer/version accepted by the provider; or
- the post-term tier/rate decision.

Admin can assign the Founding tier to any provider. Commission Controls can
schedule another Founding-tier rate without checking an individual provider's
promised 12-month window. Immutable E50 booking terms correctly protect every
booking after its financial terms are fixed, but they do not protect the rate
promised for the provider's future bookings during a Founding term.

No provider tier, commission agreement, booking term, setting, migration, or
production data was changed during this audit.

## Evidence

- `docs/strategy/STRATEGY.md` and current operations guides promise the first
  50 providers per city a 10% rate for 12 months.
- `packages/api/migrations/073_founding_tier.sql` adds only the `founding`
  enum value to `providers.tier`.
- `packages/api/src/services/admin.service.ts:changeProviderTier()` accepts
  `founding` like every other tier and records no cohort or term evidence.
- `packages/api/migrations/162_immutable_booking_financial_terms.sql` creates
  effective-from commission versions, but no protected entitlement start/end.
- `packages/api/src/services/booking-financial-terms.service.ts` resolves the
  latest effective provider or tier agreement and then snapshots it per
  booking. That protects existing bookings, not a future-booking promise.
- Commission Controls exposes the Founding tier alongside all other tiers and
  has no protected-term validation.

## Immediate containment

Until this decision and implementation are complete:

1. Do not advertise “first 50 per city” or “locked for 12 months” as an
   enforceable app benefit.
2. Do not newly assign the Founding tier without a separately approved written
   offer and an operator record outside the unavailable workflow.
3. Do not schedule a Founding-tier rate change based only on the global tier.
4. For an existing booking, use its immutable Booking 360 financial terms.
5. For an existing Founding provider, escalate the entitlement evidence before
   quoting or changing a future rate.

These are operating safeguards only. They do not alter runtime behavior.

## Options

### Option A: Individual protected Founding entitlements (recommended)

Create an audited provider entitlement linked to the service area/city, offer
version, cohort position, accepted/start timestamp, protected end timestamp,
and 10% provider-specific agreement. Enforce the cohort cap transactionally.
Open an Admin expiry-review queue at least 30 days before term end. The review
selects the provider's next standard tier and creates a prospective agreement.
If staff miss the deadline, retain the provider-safe 10% temporarily rather
than silently overcharge them. Existing Founding providers require evidence
review; do not invent dates from today's row.

This scales because the contractual benefit belongs to the provider and cohort,
while E50 still snapshots the resolved rate on every booking.

### Option B: Make Founding a permanent 10% tier

Remove all first-50 and 12-month claims, keep Founding invite-only, and treat
10% as an indefinite tier agreement until a reasoned prospective change. This
is simpler but creates a larger permanent revenue commitment.

### Option C: Keep the current manual promise

Not recommended. The platform cannot prove eligibility, prevent over-enrolment,
or stop a rate schedule from violating an individual term.

## Required decision

Approve Option A or B and confirm the treatment of existing Founding providers
before changing tier assignment, Founding commission controls, or production
data. Option A is recommended. Independent audit and non-Founding work can
continue while E63 remains open.
