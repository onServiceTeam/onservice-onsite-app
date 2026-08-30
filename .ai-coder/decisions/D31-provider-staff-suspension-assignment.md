# D31 — Provider-staff suspension and active assignments

Date: 2026-08-30
Status: OPEN — booking/evidence architecture decision required
Raised from: Provider 360 suspicion-first audit, Bugs UX-431/432

## Decision

What should happen to bookings assigned through `bookings.performer_staff_id` when an administrator suspends that provider staff member?

## Current behavior and evidence

- The staff member immediately stops qualifying as an approved performer and cannot open or update the assigned job.
- The booking still retains `performer_staff_id`, including for work that has not started and work already in progress.
- The provider owner still owns the booking account relationship and can take over or reassign it, but there is no dedicated exception queue or notification proving that happened.
- Clearing every assignment would lose useful actor attribution for evidence already captured by an in-progress staff member.
- Reactivation does not and should not silently restore an old assignment after another worker may have taken over.

D23 authorizes suspension at any time but does not define assignment, evidence, customer-notification, or completion behavior after suspension.

## Options

### Option A — State-aware reassignment exception (recommended)

- Atomically suspend the staff member.
- For work that has not begun, clear `performer_staff_id` so the provider owner becomes responsible, and notify the provider owner to confirm or reassign.
- For en-route, arrived, or in-progress work, preserve `performer_staff_id` for evidence attribution, revoke staff access, and create a visible admin/provider exception requiring an explicit takeover or reassignment decision.
- Prevent reactivation from restoring any earlier assignment automatically.
- Identify any customer-facing performer change and preserve it in the booking chronology.

Benefits: protects active customers without erasing who performed or uploaded earlier work.

Tradeoff: requires a canonical booking exception/chronology model and carefully tested status boundaries.

### Option B — Clear every non-terminal assignment immediately

Benefits: simplest authorization result and every job returns to the provider owner.

Tradeoff: can erase operational attribution while work is under way and can make existing proof harder to interpret.

### Option C — Keep all assignments and only revoke access

Benefits: preserves attribution without a schema or workflow change.

Tradeoff: the booking can remain visibly assigned to someone who cannot perform it, with no guaranteed provider response.

## Recommendation

Choose Option A. It separates pre-start reassignment from in-progress evidence preservation and makes the provider owner explicitly responsible for continuity. Do not use provider-account suspension's escrow hold automatically: a staff suspension may be an employment or access issue rather than provider-account fraud, so any money hold needs separate evidence and authority.

## Safe behavior while open

- Keep immediate access revocation.
- Warn the administrator that the provider must take over or reassign current work.
- Keep the reason in the append-only admin audit record.
- Do not silently clear assignments, create money holds, or restore assignments on reactivation.
- Continue auditing other Provider 360, customer, support, and admin workflows.
