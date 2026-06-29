# E12 — Per-milestone project escrow: extended fund-holding needs legal sign-off

Date: 2026-06-29
Raised by: AI coder
Status: OPEN — HARD STOP (compliance). Code NOT built pending Ken/legal.

## Why this is a hard stop

D27 Phase 5b is per-milestone escrow for the projects layer (fund a milestone
into escrow, release it to the provider on the customer's approval). The design
is complete and money-safe technically (it reuses the audited escrow/commission/
wallet primitives, never trusts a client amount, idempotent state guards, money-
conservation asserts). Ken delegated the *technical* choices on 2026-06-29 ("do
what is best").

But there is one thing "do what is best" cannot resolve, because it is a legal/
regulatory question, not an engineering one:

**Holding a customer's money in escrow across weeks or months, per milestone,
on a large project (a renovation or build can be ₱100k–₱1M+), is materially
different from same-day booking escrow.** It can implicate:

- **BSP e-money / escrow-licensing rules.** Holding staged third-party funds for
  extended periods may require an e-money issuer or escrow/trust license that the
  same-day booking flow doesn't trigger.
- **AMLA / NPC posture.** Larger sums held longer change the AML and data-handling
  risk profile.

CLAUDE.md hard-stop #1 ("Money or compliance risk discovered") says to pause and
escalate rather than pick a default. The design's own risk analysis flagged this
as "a hard-stop compliance item — get Ken/legal sign-off." So I stopped before
building it, even though the code is designed and ready.

## What I need from Ken (and likely the attorney on the E10 track)

1. **May onService legally hold staged project funds in escrow, and for how
   long, given BSP e-money / escrow-licensing rules?** This is the blocker.
2. If yes — auto-release policy: the design proposes pay-as-you-go (fund a
   milestone when it starts, release on customer approval, auto-release after a
   72h fallback). Confirm the window, and whether auto-release should pay out at
   all without an explicit customer tap (conservative alternative: never auto-pay,
   escalate stuck milestones to admin).
3. Service fee on milestone escrow (the plan assumes 0, matching the zero
   customer-fee decision of 2026-06-28 — confirm).
4. Cross-milestone cancellation policy mid-project (refund of unreleased funds +
   any provider compensation for work-in-progress).

## What's already shipped (no compliance issue)

The project TRACKING layer (milestones, selections, documents, progress) is live
(D27 Phase 5, commit e2faf50). It moves no money. Only the per-milestone money
movement is gated by this escalation. Full design: the design-workflow output +
`.ai-coder/decisions/D27p5-milestone-escrow.md`.

## My recommendation

Get the attorney's read on item 1 (it likely shares the E10 attorney engagement).
Once cleared, I can build Phase 5b behind a `milestone_escrow_enabled` flag
(default off) so it ships dark, then flip it on per Ken. Until then it stays
unbuilt — risky money-path code holding real funds shouldn't land speculatively.
