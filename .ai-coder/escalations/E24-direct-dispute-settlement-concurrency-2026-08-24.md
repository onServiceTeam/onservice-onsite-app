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

## Progress, 2026-10-10 (MC-03 candidate, not deployed)

The hold is unchanged and stays in place. Status remains OPEN.

MC-03 on the PR81 topic branch changes the three held paths as follows. This is in source and tests only.

**Provider accepts the whole claim.** One transaction, in this order:

1. a guarded dispute write: still open, no provider response;
2. the booking lock;
3. the booking update and the escrow refund;
4. the customer's inbox row.

Only the payment-record update runs after commit, and only it is retried, linked to the dispute. A second accept is refused before it writes (OPS-561).

**Provider sends a partial offer.** One guarded dispute write with no money movement. A second offer is refused before it writes (OPS-561).

**Customer accepts a partial offer.** One transaction (FIN-014):

1. the dispute lock and the re-checks;
2. the booking lock;
3. the guarded dispute update;
4. the booking update and the escrow refund.

After commit, two steps run:

- the payment-record update;
- the provider-share release, through `releasePartialEscrow`.

A failed release is queued as `release_partial_escrow`, and the worker retries it. A replay is refused once the escrow is released, so it cannot pay twice, but the release is still a post-commit step.

This path writes **no participant notification and no audit row**. The provider is not told that the offer was accepted.

**Against "Required replacement":**

- **Item 2 is met for all three paths:** dispute, then booking, then wallets. Real-database race tests show no deadlock and one refund.
- **Item 3 is met only in part.** Duplicate responses and accepts are refused, and the per-booking escrow cap stops any refund beyond what the booking holds. There is no idempotency key per settlement operation.
- **Item 4 is met for the provider accept.** For the customer accept-offer, the money and the states commit together, but the participant notification and the audit record do not exist yet.
- **Item 5 is met only in part.** The payment-record update is the only retried refund step, but the accept-offer release still runs after commit.
- **Item 6:** FIN-014, OPS-561 and the race tests in `dispute-refund-commits-with-resolution-postgres.test.ts`.

**Still open before the hold can be lifted:**

- item 1 (E18);
- the idempotency key;
- the accept-offer notification and audit row;
- a release inside the settlement, or durably tied to it;
- item 7: Ken approves lifting the hold through a reviewed code change.

See the MC-03 section of `docs/audits/BOOKING-AUTHORITY-SLICE1-2026-10-10.md`.
