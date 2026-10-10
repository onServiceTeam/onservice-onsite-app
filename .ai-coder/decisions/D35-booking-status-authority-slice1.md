# D35 - Booking status authority and cancellation (Slice 1 open questions)

**Date:** 2026-10-10
**Status:** OPEN. Questions for Ken. Work that does not depend on an answer continues, and each held part is listed below.
**Raised by:** Claude Code, from the Slice 1 plan, its adversarial review, and an independent fact check of this file.

## Background

The general "change booking status" route (`PATCH /api/v1/bookings/:id/status`) is what the customer and provider apps use for normal job steps.

Today, admin accounts skip that route's role and ownership check (`booking.service.ts`, `validateRoleForTransition`). They still face the status transition table, the arrival and on-site time checks and the completion checklist and photo gates, but they can request any status. Customers and providers can also request a few statuses that should only come from a dedicated flow (payment, disputes, quotes).

Slice 1 tightens this in dependency order. The tightening that is already backed by a recorded decision or the agreed design is built. The parts below are not decided, so they are not built until Ken answers.

The basis used for what is built:

- **F3** (`docs/operations/00-DECISIONS-FOR-KEN.md`): money actions belong to the super admin's money controls.
- **The super admin money routes**: the super admin's dedicated admin routes for cancel, force complete, release and refund already require a reason and write an audit row.
- **The repair contract K07** (`TRANSITION_ACTORS`): the agreed design. It marks payment, dispute, quote and payout statuses as dedicated-flow-only and gives on-site steps to the provider and their team only. K07 is a design document, not a decision by Ken. Where only K07 supports a change, the change is asked here, not assumed.

A money issue found in the same review is filed separately as a private escalation, because this repository is public.

---

## Q1. What may admin accounts still request through the general status route?

**Built in Slice 1 (backed by F3 and the audited admin routes):**

- **Plain admin:** refused on every money-moving or money-starting status. Those are cancel (any kind), confirm, paid, disputed, resolved, payout ready, paid out, completed by provider (which starts the 24-hour automatic release), requested, quoted, matched and payment pending.
- **Super admin:** refused on cancel (any kind), confirm, paid, disputed, resolved, requested, quoted, matched and payment pending through this route. The super admin keeps the dedicated, audited admin actions for these: cancel, force complete, release and refund.

**Not decided (unchanged until you answer):**

- **(a)** May either admin role move a job's on-site steps for a provider ("en route", "arrived", "in progress")? K07 gives these to the provider and their team only.
- **(b)** May a super admin set "completed by provider", "payout ready" and "paid out" through this route? Today this route is the only way to mark a booking payout ready or paid out after a manual escrow release, because manual release does not change the booking status. K07 marks these as dedicated-flow-only.

**Options:**

- **A.** Keep (a) and (b), but require a reason and write an admin audit row.
- **B (recommended, matches K07).** Remove both from the general route, and add one dedicated, audited admin action, "advance after manual release". On-site steps stay with the provider and their team.

Slice 1 also changes two other admin actions: reassignment (Q9) and, in one case, admin cancel (Q4).

## Q2. Does who cancelled change the refund?

This is already asked as D-03 in the repair folder and is hold-linked to E09. The urgent money part is in the private escalation. It is not restated here.

## Q3. Suspended providers

- **(a)** Should a suspended provider, and team members under a suspended provider, keep authority over jobs already under way? Today they do.
  - The admin "Suspend" action flags bookings from en route through completed. Bookings at matched or paid are not flagged.
  - Two other ways a provider becomes suspended flag no bookings and revoke no sessions: NBI expiry and the dispute outcome "refund with suspension".
- **(b)** Bookings flagged by a suspension can never be released, either manually or automatically, and nothing clears the flag. What should the "resolve suspension flag" action be?

This is related to D31 and E29, which cover a suspended *team member*, but it is a separate question. D31 keeps its own answer.

**Held until answered:** suspension behavior does not change.

## Q4. Cancellation when escrow shows a partial refund

When a booking's escrow already shows a partial refund and it is then cancelled, who gets what is left? Today:

- A support partial refund through the admin escrow refund route leaves the booking's escrow marked as partially refunded.
- A dispute partial refund also shows "partially refunded" until its remaining release to the provider completes.

**Interim (built in Slice 1):** a cancellation is refused with a clear message while escrow shows a partial refund, whether the customer or an admin cancels. No money moves on its own. For a resolved dispute, the admin uses the release action instead. Proposed customer message: "This booking already had a partial refund. Please contact support to finish cancelling it."

**Needs your yes on the wording** (see Q11).

## Q5. Customer "confirm job done"

Today the booking is saved as "confirmed" first, and the release to the provider runs as a second step. If the second step fails, the customer sees an error even though the booking already changed.

- **A (recommended).** Make it one step, like the automatic release. Either both happen or neither does, and the customer sees an honest error and can retry.
- **B.** Keep "confirmed but not yet released" as a waiting state. The customer sees success with a "payment to provider pending" note, and admins get a sweep.

**Held until answered:** the confirm path does not change.

## Q6. Wording for the admin-cancel notice

When an admin cancels a booking today, nobody is told, and no message text exists for it. Please approve a customer message and a provider message. Proposed:

- **Customer:** "onService cancelled your booking. Your refund details are on the booking."
- **Provider:** "onService cancelled this job. It no longer needs your visit."

## Q7. Old bookings that cannot yet be cancelled (a release precondition)

**Today:**

- A customer who cancels a booking paid before the financial-snapshot update has the cancellation saved.
- The customer is told the refund will be processed within 48 hours.
- The money stays in escrow, and nothing is queued.

**After Slice 1:** that cancellation is refused instead, so nothing is half-done. The server's message for this case is internal text about the "E50 legacy snapshot", and it would reach customers.

**Proposed customer wording:** "We're finishing a review of this booking's payment. Please contact support to cancel it."

**Release precondition:** releasing Slice 1 waits for this wording. It also waits for the Legacy Review of already-paid bookings that E50 already requires.

## Q8. Idempotency keys

The repair contract K08 wants every money request to carry a unique "Idempotency-Key" and to refuse requests without one. Installed apps send none. How long should the grace period be before requests without a key are refused?

**Recommended:** accept requests without a key until the first updated app version is installed by testers, then refuse them. This is foundation work, not Slice 1.

## Q9. Reassigning a provider who already arrived

The repair contract says reassigning a job resets it to "paid", so the new provider must tap "On my way". Slice 1 does this for "en route". For "arrived", the server and the admin page block reassignment today.

Should reassignment from "arrived" be allowed, with the same reset?

## Q10. Paying by wallet after an abandoned card or GCash attempt

Some bookings are stuck at "payment pending" because a card or GCash attempt was started and abandoned. External payments are switched off (E14). May the customer then pay that booking from their wallet?

The risk: if the abandoned attempt somehow completes later, the customer could be charged twice.

**Interim (built in Slice 1):** wallet payment is allowed for "payment pending" bookings that have no payment attempt at all. That covers every accepted custom quote. Bookings with an abandoned attempt stay refused until Ken answers.

## Q11. Wording for refused cancellations

Please approve one customer message for each case where Slice 1 refuses a cancellation instead of silently stranding money:

- **After a partial refund (Q4).**
- **After the money was already released to the provider.** The booking can no longer be cancelled. It can be disputed or handled by support. Proposed: "Payment for this booking was already released. Please contact support."
