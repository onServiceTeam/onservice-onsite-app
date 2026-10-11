# E18 — Escrow releases before the advertised dispute window closes

**Date:** 2026-08-24

**Status:** OPEN — money-path product decision and remediation required
**Hard-stop reason:** The live server releases escrow to the provider after 24
hours, while the customer and dispute flow continue to promise and accept a
48-hour dispute window.

## Bad news first

A customer can file an accepted dispute between hour 24 and hour 48 after job
completion even though the provider has already been credited and the booking's
escrow has already been released. The current dispute code then changes the
booking back to `escrow_status='held'` without reversing the provider credit.
Any refund attempt debits the shared platform escrow wallet, not the provider's
already-released wallet balance. That is not a valid post-release dispute model.

No booking, wallet, dispute, platform setting, or production data was changed
during discovery.

## Evidence

- `packages/api/src/config/platform.config.ts` configures
  `escrowAutoConfirmHours: 24` and `escrowDisputeWindowHours: 48`.
- `packages/api/src/jobs/workers.ts` selects provider-completed bookings older
  than 24 hours, marks them confirmed, calls the transactional escrow release,
  and advances them to `payout_ready`.
- `packages/api/src/services/dispute.service.ts` permits a customer dispute for
  either `completed_by_provider` or `confirmed` until 48 hours after
  `completed_at`, then unconditionally writes `escrow_status='held'`.
- `packages/api/src/services/escrow.service.ts` releases held escrow by reducing
  the platform escrow wallet and crediting provider/platform wallets. Its refund
  functions debit the platform escrow pending balance; they do not claw back an
  earlier provider credit.
- `apps/mobile/app/customer/booking/complete.tsx` tells the customer both that
  there is a 48-hour dispute period and that the booking auto-confirms after 24
  hours.
- `docs/operations/09-trust-safety-and-disputes.md` and customer-facing terms
  contain conflicting descriptions of when auto-confirmation occurs.
- A read-only live configuration check on 2026-08-24 confirmed the effective
  24-hour auto-confirm and 48-hour dispute values.

## Impact

This can produce all of the following between hour 24 and hour 48:

1. a customer-visible right to dispute that no longer has matching held funds;
2. a provider who keeps the released amount while a customer refund draws from
   unrelated pooled escrow;
3. booking status and escrow status that claim funds are held when they are not;
4. support and admin staff making decisions from internally contradictory state;
5. legal/customer-trust exposure because the product promises a longer remedy
   than the settlement model safely supports.

## Options

### Option A — Hold escrow for the full dispute window (recommended)

Set auto-confirm/release to no earlier than the dispute deadline, use one
canonical setting for customer UI and server behavior, and reject any admin
configuration where release time is shorter than the dispute window. Preserve
the current 48-hour customer promise. This is the smallest launch-safe model and
keeps disputed funds in escrow until the right to dispute expires.

### Option B — Shorten the dispute window to 24 hours

Make the API, customer UI, terms, support documentation, and admin tooling all
use 24 hours. This reduces a currently advertised customer protection, so it
requires Ken's explicit product/legal approval before code or copy changes.

### Option C — Build a true post-release dispute and clawback model

Allow disputes after release, reserve or debit the provider wallet, define
negative-balance and already-withdrawn-funds behavior, reconcile gateway refunds,
and expose the state to support staff. This is a substantial finance product,
ledger, payout, legal, and operations project, not a launch patch.

## Recommendation

Choose Option A for launch. Keep funds held for 48 hours, derive all countdowns
and wording from the same server-canonical value, and add money-path tests proving
that a dispute and auto-confirm racing at the deadline cannot both move funds.
Then correct the contradictory operations and customer documentation.

## What I need from Ken

Approve Option A, or choose Option B or C. Until then, do not change the live
24/48 settings and do not represent this money path as launch-ready. Independent
non-money audit and remediation can continue while this escalation remains open.

## Correction (2026-10-11, Claude Code, while building S2-2)

Part of the "Bad news first" section is not what the code does, on live (`7ed367cd`) or in the candidate. The 24-hour automatic confirmation releases the money and moves the booking to `payout_ready` in the same step (`jobs/workers.ts`). A customer's own confirmation does the same. Filing a dispute accepts only `completed_by_provider` or `confirmed`. So after the automatic release, a dispute is refused, not accepted.

Released money could still reach a dispute in two narrower ways:

- **After a super admin's manual release.** That release does not change the booking's status, so the job can still be disputed.
- **Through a race.** Before S2-2, the filing read the booking without a lock, so it could race the automatic confirmation. S2-2 closes that race in the candidate (LAUNCH-LIMITATIONS 122).

**What is still true, and still needs the decision above:**

- the apps promise 48 hours to dispute;
- after the 24-hour automatic confirmation the customer cannot file;
- the dispute screen then says "This booking is not eligible for a dispute yet. The provider must mark the job complete first.", which is wrong.

**One more change in the candidate:** filing a dispute no longer relabels the money as "held" (LAUNCH-LIMITATIONS 122).
