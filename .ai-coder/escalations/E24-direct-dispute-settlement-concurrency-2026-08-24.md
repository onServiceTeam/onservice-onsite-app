# E24 — Direct dispute settlement can race and separate case state from escrow

**Date:** 2026-08-24

**Status:** OPEN — money-path redesign required; deployed direct settlement held
**Hard-stop reason:** Provider full-refund acceptance and customer acceptance of
a partial offer can be submitted concurrently and can commit dispute/booking
state separately from escrow movement.

## Bad news first

The API has direct participant settlement endpoints, but the app previously had
no screens that called them. While building the missing dispute workspace, the
money-path trace found that both direct settlement flows read an open dispute,
then update it without first locking the dispute and booking rows as one
settlement unit. Two concurrent requests can both pass the pre-check. The case
and booking can also be marked resolved before escrow and gateway work succeeds.

This is separate from E18, which records the 24-hour release versus 48-hour
dispute-window contradiction. E24 applies even while escrow is still held.

## Evidence

- `packages/api/src/services/dispute.service.ts:addProviderResponse` reads the
  dispute before its transaction and does not lock it with `FOR UPDATE`.
- The provider `accept` branch resolves the dispute and booking inside one
  transaction, then calls `refundFromEscrow` after commit.
- `acceptPartialOffer` reads and updates without a transaction or a guarded
  `WHERE status='open'` clause, then performs escrow refund and partial release
  as later operations.
- The shared escrow wallet lock prevents the platform wallet from becoming
  negative, but it does not make one booking/dispute settlement idempotent.
- The code already has transaction-aware escrow primitives, but a correct split
  settlement also needs one canonical lock order, idempotency, gateway retry,
  booking status, provider credit, and audit contract.

## Immediate containment applied

Production now fails closed before any write for:

1. a provider directly accepting the whole claim;
2. a provider submitting a partial-refund offer;
3. a customer accepting a partial-refund offer.

Providers can still contest a dispute, which records their response and moves
the case to the admin review queue. Customers and providers can now view the
same case, evidence, response, status, and decision. Admin resolution remains
the existing reviewed path. The tracked deployment contract keeps
`DISPUTE_PARTY_SETTLEMENT_ENABLED=0`; changing the value cannot bypass the hold.

## Required replacement

Before lifting the hold:

1. Resolve E18 and define whether funds are always held through the full dispute
   window or whether a post-release clawback model exists.
2. Lock the dispute, booking, and affected wallets in one documented order.
3. Make each settlement action idempotent per dispute and outcome.
4. Commit dispute state, booking state, internal ledger movements, participant
   notifications, and audit records atomically.
5. Run external gateway work post-commit with a unique retry record tied to the
   settlement operation.
6. Add concurrent behavioral tests proving only one settlement can move money.
7. Re-enable participant settlement through an explicit reviewed code change,
   not an environment edit.

## Recommendation

Keep the current contest-to-admin-review path for launch until E18 and E24 are
resolved together. This preserves the provider's right to respond without
exposing an unproven direct refund path.
