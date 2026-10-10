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
- **Super admin:** refused on cancel (any kind), confirm, paid, disputed, requested, quoted, matched and payment pending through this route. The super admin keeps the dedicated, audited admin actions for cancel, force complete, release and refund. The payment, dispute, quote and offer statuses come only from their own flows.

**Not decided (unchanged until you answer):**

- **(a)** May either admin role move a job's on-site steps for a provider ("en route", "arrived", "in progress")? K07 gives these to the provider and their team only.
- **(b)** May a super admin set "completed by provider", "payout ready", "paid out" and "resolved" through this route?
  - Today this route is the only way to mark a booking payout ready or paid out after a manual escrow release, because manual release does not change the booking status.
  - It is also the only way out for a booking that was marked "disputed" without a dispute record. Customers can do that through this route until Slice 1 step S1-4. Every dispute resolution path needs the dispute record, and cancel, force complete and release do not accept "disputed".
  - **A related existing gap.** If a super admin marks a "confirmed" booking "payout ready" while its escrow is still held, the money stays held. Nothing releases it.
  - K07 marks these statuses as dedicated-flow-only.

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

**Held until answered:** suspension behavior does not change. One addition since S1-9: an accepted quote whose provider is not approved cannot be paid (Q12).

When you answer (a), the answer should apply to job evidence too (checklist, photos, the customer sign-off image), not only to status changes. Today a suspension signs out only the provider owner, not their team members.

## Q4. Cancellation when escrow shows a partial refund

When a booking's escrow already shows a partial refund and it is then cancelled, who gets what is left? There are two ways a booking ends up there:

- **A support partial refund.** A super admin refunds part of the money through the admin escrow refund route, usually before the job is done. The rest stays held. This case is the open question.
- **A dispute partial refund.** It leaves the booking "resolved", with escrow "partially refunded", until the rest is released. The dispute design already sends the rest to the provider through the release action. So for disputes this question is largely answered.

**Interim (built in Slice 1, step S1-6):**

- A customer's or assigned provider's cancellation is refused with a clear message while escrow shows a partial refund. No money moves on its own.
- Since step S1-8 the admin cancel follows the same rule. An admin who cancels such a booking sees: "Escrow shows a partial refund. For a resolved dispute, use Release instead of cancelling. Otherwise use Refund for the rest, then cancel." (this admin wording also needs your yes). (Before S1-8 the admin cancel went through and left the rest in escrow.)
- For a resolved dispute, the admin uses the release action instead.

**Proposed wording:**

- **Customer:** "This booking already had a partial refund. Please contact support to finish cancelling it."
- **Provider:** "Part of this job's payment was already refunded. Please contact support about this job."

The same server text currently appears on both the customer's booking screen and the provider's job screen.

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

- A customer, or the assigned provider, who cancels a booking paid before the financial-snapshot update has the cancellation saved.
- The person cancelling is told the refund will be processed within 48 hours.
- The money stays in escrow, and nothing is queued.

**After Slice 1 (step S1-5):** that cancellation is refused instead, so nothing is half-done. This covers both the customer's cancel and the provider's cancel. The admin cancel already refused these bookings before Slice 1.

The server has two refusal messages for this. Both are internal text, and both would appear as an error on the customer's booking screen and on the provider's job screen:

- **No payment snapshot yet:** "Financial terms are missing for this booking. Money movement is blocked until operations completes the reviewed E50 legacy snapshot."
- **Snapshot does not match the booking:** "Booking does not match its immutable financial terms. Cancellation money movement is blocked for operations review."

**Proposed wording:**

- **Customer:** "We're finishing a review of this booking's payment. Please contact support to cancel it."
- **Provider:** "This job's payment is under review. Please contact support about this job."

**Recommended:** show the approved wording from the server, or through one error code that both apps translate, so that a fix on one screen cannot leave the other showing the internal text.

**Also your decision:** what support does when a provider cannot attend one of these jobs before its review is done. Either support reassigns the job, or the review is completed first.

**Release precondition:** releasing Slice 1 waits for this wording. It also waits for the Legacy Review of already-paid bookings that E50 already requires. That review is what removes the "no payment snapshot" case for both roles.

## Q8. Idempotency keys

The repair contract K08 wants every money request to carry a unique "Idempotency-Key" and to refuse requests without one. Installed apps send none. How long should the grace period be before requests without a key are refused?

**Recommended:** accept requests without a key until the first updated app version is installed by testers, then refuse them. This is foundation work, not Slice 1.

## Q9. Reassigning a provider who already arrived

The repair contract says reassigning a job resets it to "paid", so the new provider must tap "On my way". Slice 1 does this for "en route". For "arrived", the server and the admin page block reassignment today.

Should reassignment from "arrived" be allowed, with the same reset?

## Q10. Paying by wallet after an abandoned card or GCash attempt

Some bookings are stuck at "payment pending" because a card or GCash attempt was started and abandoned. External payments are switched off (E14). May the customer then pay that booking from their wallet?

The risk: if the abandoned attempt somehow completes later, the customer could be charged twice.

**Interim (built in Slice 1):** wallet payment is allowed for "payment pending" bookings that have no payment attempt at all. That covers accepted custom quotes, subject to the Q12 refusals. Bookings with an abandoned attempt stay refused until Ken answers.

Built in S1-9 (candidate, not deployed). Any earlier payment record blocks the wallet, a failed one included. The refusal wording, which needs your approval, is: "This booking already has a payment attempt. Please contact support to complete it."

## Q11. Wording for refused cancellations

Please approve a customer message and a provider message for each case where Slice 1 refuses a cancellation instead of silently stranding money. The same refusal reaches the customer's booking screen and the assigned provider's job screen.

**After a partial refund (Q4).**

- Customer: "This booking already had a partial refund. Please contact support to finish cancelling it."
- Provider: "Part of this job's payment was already refunded. Please contact support about this job."

**After the money was already released to the provider.**

- Customer: "Payment for this booking was already released. Please contact support."
- Provider: "This job's payment was already released. Please contact support about this job."

How the released case happens: a super admin releases the money before the job is done, and the booking stays "paid". At that point:

- The customer cannot cancel it in the app (S1-6).
- It cannot be disputed either, because disputes open only after the provider marks the job complete.
- No admin refund is possible, because the escrow is empty.
- Support's only tool today is the admin cancel, which ends the booking with no refund.

**Recommended:** as in Q7, show the approved wording from the server, or through one error code that both apps translate.

**Two decisions this raises:**

1. **Admin cancel of a released booking.** S1-8 moves the admin cancel onto the same cancellation code. Should an admin cancel of a booking whose money was already released:
   - stay allowed, moving no money, as today; or
   - be refused like the customer's cancel?

   **Interim (built in step S1-8):** until you answer, an admin cancel of a booking whose money was already released still goes through and moves no money, as before. Customers and providers are refused. The choice is passed to the shared cancellation code on purpose and has its own test, so your answer is a one-line change either way.
2. **Release before the job is done (a money question, older than Slice 1).** Releasing the money while the booking is still "paid" leaves no path to refund that customer if the provider never comes. Should manual release be limited to completed or resolved bookings, or should a refund path from the platform be added?

## Q12. Paying an accepted quote late, or after its provider was suspended

Accepting a custom quote does not set a time. The booking keeps the placeholder time set when the job was posted, from its urgency: same day is 4 hours later, "within 3 days" is 2 days later. A quote stays open for 48 hours by default; admins can set 12 to 168 hours. So a customer can reach the pay step after the booking's time has passed.

**If such a booking were paid, two things would go wrong:**

- **The no-show alert.** Once paid, the alert fires on its next scheduled check. It tells the customer they can "cancel for a full refund".
- **The refund bracket.** If the customer then cancels, the "less than 30 minutes before" bracket applies: 70% back by default, with 30% of the price going to the quoting provider.

**A suspended provider.** The quoting provider can also have been suspended (or deactivated) between quoting and payment. Nothing then re-offers the paid job.

**Interim (built in S1-9, candidate, not deployed):** the wallet refuses an accepted quote once its scheduled time has passed, or while its provider is not approved. When refused, nothing moves. That is the same as before S1-9, when no accepted quote could be paid at all.

**The interim wording, which needs your approval:**

- "The scheduled time for this booking has passed. Please contact support before paying."
- "The provider for this booking is not available right now. Please contact support before paying."

**What you should know before approving that wording.** By the time the pay step refuses, accepting the quote has already succeeded and declined the other providers' quotes. Support has these tools:

- **A passed time:** no tool changes a booking's time, so support can only cancel. The customer then posts the job again.
- **An unavailable provider:** support can cancel, or reassign the booking to another provider at the accepted price.

Bookings matched through a job offer ("matched") keep the earlier rules: no schedule or provider check at payment. The provider's status is read once, at payment time. A suspension a moment later is the Q3 case.

**Options:**

1. Keep refusing, and add a way for the customer to pick a new time (at the accept-quote or pay step).
2. Set the booking's time when the quote is accepted, from a date the customer or provider chooses.
3. Refuse payment within a minimum lead time (for example 2 hours), not only after the time has passed.
4. For a suspended provider: send the job back out for new quotes instead of refusing.
5. Make the same two checks when the quote is accepted, so the other quotes are not declined for a booking that cannot be paid.

**Recommended:**

- option 2, with option 1's refusal as the safety net, because a quote without a real time is the cause;
- option 5 either way;
- wording that tells the customer what will actually happen, for example "Please cancel this booking and post the job again".

**Related:**

- **E42** (open) already asks how agreed schedules should work: a quote request's urgency becomes an invented appointment time (finding R-DSP-11). Answering E42 answers most of this question; please decide them together.
- The no-show alert promises "a full refund" while a cancellation after the scheduled time refunds by the late bracket. That message is wrong for any late booking, not only quotes.
- After a quote is paid, the confirmation screen still says onService is "finding the best provider" and will notify the customer when one accepts. The provider is already assigned, so that notice never comes. This goes with the known gap that the provider is not told the booking was paid (finding R-CUS-09).
