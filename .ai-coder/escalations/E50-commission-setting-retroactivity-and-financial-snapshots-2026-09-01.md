# E50 — Commission settings can retroactively change unsettled bookings

**Date:** 2026-09-01
**Status:** OPTION A APPROVED BY KEN; implementation checkpoint is on a money-path topic branch and production remains blocked pending legacy review
**Scope:** System Settings, booking financial terms, escrow release, partial dispute settlement, provider-specific commission controls

## Bad news

The current commission settings are not prospective-only controls.

Both escrow release paths read the provider's current tier and the current
commission_rate_<tier> setting when money is released:

- packages/api/src/services/escrow.service.ts — releaseEscrow
- packages/api/src/services/escrow.service.ts — releaseEscrowInTransaction
- partial dispute settlement also recomputes commission from current settings

The booking stores service_price, service_fee, and total_amount, but it does
not store the agreed commission rate, commission amount, guarantee-fund
rate/contribution, provider net, or platform retained amount.

Therefore, changing a tier commission rate can alter the provider/platform
split for an older booking that was already priced and paid but whose escrow
has not yet been released. A provider tier change before release can produce
the same problem.

This contradicts the operator requirement that configuration changes must not
silently rewrite older transactions.

## Existing evidence

This was identified in the May money audit but was not implemented:

- .ai-coder/audit-2026-05-01/findings/B01-money-path-bugs.md
  - CRIT-04 calls for immutable quote-time money snapshots.
  - MED-05 records live-recomputed commission during partial escrow release.

The current release code still performs those live reads.

## Immediate containment

Until immutable financial terms exist:

1. Treat every commission_rate_* setting as held/read-only in System Settings.
2. Keep guarantee_fund_rate held under E10.
3. Do not add provider-specific commission overrides that can affect an
   already-authorized booking.
4. Do not change production commission rows directly.
5. Show operators that current rates are informational only and unsafe to
   mutate while paid/unreleased bookings exist.

## Recommended permanent design

Use immutable per-booking financial terms fixed at the last authoritative
pricing/authorization boundary.

### New financial-terms record

Recommended one-to-one table: booking_financial_terms.

Store at minimum:

- booking_id unique foreign key
- pricing_version
- provider_id
- provider_tier
- commission_source (tier_default, provider_contract, manual_quote)
- commission_rate_percent
- commission_amount_centavos
- service_fee_rate_percent
- service_fee_amount_centavos
- guarantee_fund_rate_percent
- guarantee_fund_amount_centavos
- provider_receives_centavos
- platform_retains_centavos
- currency
- fixed_at
- fixed_by_event
- source setting/version identifiers needed for audit

The record becomes immutable after payment authorization/verified escrow hold.
Escrow release, partial settlement, dispute resolution, receipts, payout
evidence, and admin Booking 360 must read this record rather than live settings.

### Effective-dated commission controls

Tier and provider-specific commission controls should be versioned:

- an explicit effective date/time
- optional end date
- reason and approver
- no overlap for the same scope
- future bookings resolve the applicable version
- existing financial-term snapshots never change

An operator can schedule a future rate, inspect affected providers, and cancel
the future version before it becomes effective. Editing an old version in
place must not be supported.

### Provider-specific rates

Provider-specific commission should be a dated contract/exception, not a
mutable field on the provider row. It needs:

- provider and scope
- rate
- effective period
- business reason
- approver
- audit history
- preview of future impact
- no retroactive application

## Legacy in-flight bookings

This is the production-data hard stop.

Recommended rollout:

1. Add the new table and new-write logic without switching releases.
2. Freeze commission changes.
3. Identify every paid/held/unreleased booking.
4. Under a reviewed maintenance run, create a financial-terms snapshot for
   each legacy in-flight booking using the exact configuration that operations
   has agreed should govern it.
5. Reconcile every snapshot:
   provider_receives + platform_retains + guarantee_fund = total_amount.
6. Switch release/dispute paths to require the snapshot.
7. Refuse release and create an operator exception if a snapshot is missing.
8. Only then enable effective-dated commission changes.

Blindly backfilling from today's tier/rate is not automatically safe because
the historically promised rate may differ and the provider's tier may have
changed.

## Decision required

Approve the recommended model:

**Option A — immutable financial terms + effective-dated tier/provider rates
(recommended).** Correct audit and non-retroactivity model; requires an
additive schema migration and a separately reviewed legacy backfill.

**Option B — freeze all commission changes permanently for v1.0.** Lower
implementation risk, but the admin cannot safely operate tier or
provider-specific rates.

Do not use a direct mutable provider commission field or continue live
recalculation at release.

## Work paused

Per AGENTS.md, this finding is both a money risk and a production-data
migration decision. Implementation and production synchronization must pause
until the model and legacy-booking treatment are approved.

## Decision and implementation update — 2026-09-01

Ken approved Option A and authorized the recommended future-safe design.

The `codex/system-settings-control-fix` topic branch now contains the additive
schema, effective-dated tier/provider agreement controls, immutable booking
financial terms, snapshot-based escrow/release/cancellation paths, fail-closed
legacy handling, and a super-admin legacy financial review queue. The queue
requires cited evidence and an exact reproduction of the recorded service fee;
it does not blindly infer historical terms from today's settings or tier.

The branch has passed the complete API, admin, and mobile executable suites,
all typechecks, lint, API/admin production builds, Gate A, Gate C, and the Gate C
smoke tests. Gates D and E are still repository-defined REPORT gates. The one
Docker-only nginx check could not run because Docker Desktop was unavailable.

This approval does not authorize a blind production backfill. Production
deployment remains blocked until all paid/held/unreleased legacy bookings can
be inventoried and reviewed, and until pre-payment pricing evidence is fixed at
the authoritative pricing boundary so a configuration change between quote
and payment cannot alter the agreed inputs.
