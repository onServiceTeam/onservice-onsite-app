# D36 - Dispute decisions, change-order money and refund delivery (Slice 2 open questions)

**Date:** 2026-10-11
**Status:** OPEN. Questions for Ken. Work that does not depend on an answer continues, and each held part is listed below.
**Raised by:** Claude Code, from the Slice 2 plan and its three adversarial reviews.

## Background

Slice 2 finishes Stage 1 of the repair program:

- (b) change-order money (R-MON-04);
- (c) the remaining refund gaps (R-MON-02, R-MON-03, R-MON-08, R-MON-10).

Where the code needs a rule that nobody has decided, Slice 2 builds a refusal as the interim: the action is refused, nothing moves, and the question is asked here. Each refusal's wording also needs approval before release, as in D35.

A money issue found in the same planning is filed separately as a private escalation, because this repository is public.

---

## Q1. Dispute decisions after an earlier refund

A booking already had a partial refund from support (for example ₱2,500 of ₱10,000), and is then disputed.

- **"Partial (60%)" decision.** Should 60% mean:
  - (a) 60% of the original total, minus what was already refunded;
  - (b) 60% of what is still held; or
  - (c) something else?
- **"Full refund" decision.** Does it mean "return everything not yet returned" (here ₱7,500)?

**Interim built in S2-3:** any refund decision on a dispute after an earlier refund is refused, and nothing moves. A dispute on a booking with no earlier refund works as today.

## Q2. Wording of the admin refusals in S2-3

S2-3 adds refusals to admin dispute decisions:

- after an earlier refund (Q1);
- when no money is held for the booking any more;
- when the booking's held amount does not match its total.

The current interim wording is plain and technical. Please approve or replace it before release.

## Q3. Card-paid bookings and change orders paid from the wallet

A change order (extra work agreed during the job) is paid only from the customer's in-app wallet. If the booking itself was paid by card or GCash, a later refund cannot be split correctly today: the original payment and the change-order money would go back by different routes.

May a card- or GCash-paid booking take a wallet-paid change order? If yes, how should a later refund be split between the card and the wallet?

**Interim built in S2-6:** a change-order payment is refused unless the booking was paid from the wallet and its money is fully held.

## Q4. Customer wording when a change-order payment is refused

This covers the S2-6 refusals: the booking's money was already refunded, or the booking was not paid from the wallet. Please approve or replace the interim wording.

## Q5. Notices for a paid change order

Today the customer is told "The provider has been notified" after paying for a change order, but no notice is sent. S2-11 sends the provider a real notice.

Please approve:

- the provider's notice;
- the customer's confirmation text.

## Q6. Refunds to card payments while external payments are switched off (E14)

Some older bookings may have been paid by card or GCash. Refunding one calls the payment company with the live key.

While E14 holds, should such refunds:

- go to the payment company as today; or
- go to a person for manual handling?

**Held:** the Slice 2 refund-delivery steps (S2-9a, S2-9b, S2-10) are built and tested with a stand-in for the payment company, but are not released until this is answered.

## Q7. Finishing "send each card refund once" (R-MON-08)

Slice 2 makes sure a card refund is sent at most once. The rest needs PayMongo's refund documentation and a **test-mode** key, to confirm how its refunds handle a repeat-request key and what reference they return:

- a repeat-request key;
- storing PayMongo's refund reference;
- not holding a database lock while waiting on PayMongo.

May Claude read that documentation and use a test-mode key?

## Q8. "Pretend refunded" outside production

Outside production, a failed card refund call is treated as if it worked (`payment.service.ts`, `processRefund`).

- Is live running with `NODE_ENV=production`?
- May this behaviour be removed, so a failed call is always reported?

## Q9. Change-order limits

Each change order may add up to 50% of the booking's **current** price. Two change orders can therefore add more than 50% of the original price.

Should the limit be:

- 50% of the original price per change order;
- a combined limit across all change orders; or
- something else?

And how many change orders may wait for payment at once?

## Q10. Hourly bookings

1. Should change-order money be left out of the hours-based adjustment at the end of an hourly job?
2. The refund for unused hours always goes to the customer's wallet, even when the booking was paid by card. Should it go back to the original payment instead?

## Q11. The per-booking money record (K01)

The repair contract's per-booking money record (K01, owner decision D-07) would record every peso held for each booking: the original payment and each change order separately.

Slice 2 adds interim bookkeeping in its place. Approve starting K01 as the next stage?

## Q12. A refund decided after the money was already paid out

The provider has already been paid, and a dispute is then decided as "refund". The code refuses this today (there is no clawback). Slice 2 keeps that refusal and makes sure it never records a refund that was not paid.

What should support do in this case?

## Q13. Paying a provider for a booking marked "suspended during the job"

When a provider is suspended, their bookings that are under way are marked, and the money for a marked booking can never be released to them (LAUNCH-LIMITATIONS 118). Nothing in the app clears the mark.

If support decides the provider should still be paid for work done before the suspension, who may clear the mark (super admin only?), and what must they record (a reason, evidence)? Until this is answered, such money can only be refunded to the customer.
