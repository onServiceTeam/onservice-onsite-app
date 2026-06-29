# D27 Phase 5 — Per-milestone escrow release: how should money move?

Status: OPEN — needs Ken
Date: 2026-06-29
Author: AI coder

## Background

D27 Phase 5 adds a "project" layer for big multi-stage jobs (home building,
interior design, roof, condo complexes): a project groups milestones, material
selections (door type, colours), and documents (blueprints, permits, contract).

The tracking layer (projects, milestones, selections, documents) is built and
shipped — it has no money risk. What is NOT built, and what I am escalating, is
**moving money per milestone** (deposit on milestone 1, release on completion
of each stage, etc.). Milestone `amount` is currently display/planning only.

## Why this needs Ken (money + compliance)

Per-milestone escrow is a real money-path design with policy forks the spec is
silent on:

1. **Up-front commitment.** Does the customer fund the whole project into escrow
   at the start, or fund each milestone as it begins? Full-up-front is simpler
   to enforce but a big ask for a ₱500k build; pay-as-you-go risks the customer
   walking mid-project.
2. **Release trigger.** Who confirms a milestone is done — customer approval,
   provider mark-complete + auto-release after N days (like the existing
   change-order expiry), or an admin/inspector? Each shifts dispute risk.
3. **Partial work / disputes.** If milestone 3 of 6 is disputed, what happens to
   the funds already in escrow for 4–6? Refund policy, partial release, mediation.
4. **Provider payout timing + commission.** Is commission taken per milestone
   release or once at project end? Affects the payout ledger and the fee math.
5. **Cancellation.** Mid-project cancellation by either side — what is refundable,
   what is forfeit (materials already bought, work already done).
6. **Regulatory.** Holding large sums in escrow across weeks/months may have
   different BIR / financial-handling implications than a same-day service
   payment. Worth confirming against the launch compliance items.

These are business + legal calls, not implementation details. Picking a default
here would be exactly the kind of money-path decision CLAUDE.md says to escalate.

## Options (for Ken to choose)

- **A. Ship project tracking now, defer escrow (recommended).** Projects,
  milestones, selections, documents work as a planning + progress tool. Payment
  continues to use the existing per-job booking + change-order escrow. Add
  per-milestone money once Ken sets the policy. Zero new money risk.
- **B. Milestone deposits, full-up-front funding.** Customer funds the project
  total into escrow at acceptance; each milestone release needs customer
  approval (or auto-release after N days). Needs Ken's answers to items 2–6.
- **C. Pay-as-you-go per milestone.** Customer funds each milestone as it starts.
  Lower up-front friction, higher mid-project-abandonment risk. Needs items 2–6.

## Recommendation

Option A for now. The tracking layer is the 80% of the value for planning big
jobs. Escrow is the 20% that carries the risk and needs Ken's policy.

## What I need from Ken

1. Defer milestone escrow for v1.0, or build it now?
2. If now: funding model (B full-up-front or C pay-as-you-go) + answers to the
   release-trigger / dispute / payout-timing / cancellation questions (items 2–6).
