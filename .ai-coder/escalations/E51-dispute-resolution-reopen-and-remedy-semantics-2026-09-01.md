# E51 — Dispute resolution controls can misstate or repeat a settlement

**Date:** 2026-09-01
**Status:** OPEN — money-path and source-of-truth decision required
**Scope:** Dispute 360, dispute resolution, reopen, free redo, provider warning, participant notifications, gateway retry state

## Bad news

The operator dispute console presents several actions as complete business
outcomes even though the underlying implementation does not fully perform or
represent those outcomes.

### Reopen can make a settled dispute resolvable again

`reopenDispute` changes a resolved dispute back to `under_review` and clears
`resolved_at` and `resolved_by`. It does not reverse or preserve a separate
immutable record of the prior settlement, and it leaves the booking and wallet
outcome unchanged.

The ordinary resolution guard only rejects a dispute whose current status is
`resolved`. After reopen, the same dispute can therefore be submitted through
the resolution path again. Existing escrow guards should reject a second
movement for many already-settled bookings, but the dispute and booking can be
rewritten before that post-commit attempt fails, and a permanently failing
gateway retry can be created. A different second resolution can also contradict
the first decision without an explicit compensating-ledger model.

The current UI compounds this contradiction. Its resolution confirmation says
the action cannot be undone, but a Reopen action appears after resolution.

### `free_redo` does not create or schedule a redo

The resolution path marks the dispute and booking resolved and intentionally
does not release or refund the held escrow. It does not create a replacement
booking, work order, provider assignment, schedule, acceptance workflow, or
customer/provider obligation for the promised redo. The result is a terminal
case with funds left held and no executable redo.

### `refund_with_warning` does not record a provider warning

The option performs the same 100% refund calculation as a full refund and uses
warning wording, but no provider warning, quality event, disciplinary record,
or standing change is written. Operations documentation currently says this
option logs a warning on the provider.

### Resolution success and participant wording are ahead of settlement state

The dispute and booking are committed as resolved before post-commit refund or
release work finishes. If the movement fails, a gateway retry is queued. The
participant notifications still say the dispute was resolved using labels such
as "Full refund issued", and Dispute 360 does not show the linked pending or
failed gateway action. A queued retry is not a completed refund.

## Existing source conflict

The following current operations documents explicitly allow Reopen and describe
`free_redo` and `refund_with_warning` as completed remedies:

- `docs/operations/09-trust-safety-and-disputes.md`
- `docs/operations/11-admin-system-training-manual.md`
- `docs/operations/13-policies-codes-and-templates.md`

The Phase 07 honesty check explicitly recorded both dispute-message delivery
and refund clawback on reopen as deferred. Message delivery can be completed
without changing money semantics. Reopen cannot be made correct by a UI-only
patch.

## Immediate containment

Until this decision is resolved and implemented:

1. Do not use Reopen on a dispute that has any refund, release, retry, or other
   settlement movement.
2. Do not use `free_redo`; create a support case and handle the customer need
   without promising an in-app redo workflow that does not exist.
3. Do not treat `refund_with_warning` as a recorded provider warning. Use the
   existing provider quality/support record while the canonical warning model
   is decided.
4. Verify the booking Money view and gateway retry status before telling either
   party that a refund or release completed.
5. Do not deploy a migration or backfill that rewrites historical dispute
   outcomes until production settlement records are inventoried.

## Recommended permanent design

Choose an immutable settlement plus supplemental-review model.

- A resolved dispute and its settlement remain immutable.
- New evidence opens a linked `dispute_appeal` or supplemental review record,
  not the original money-bearing dispute.
- A changed financial outcome uses a separate idempotent compensating action
  with its own support-case reference, approval, ledger entries, and gateway
  state. It never reruns the original resolution operation.
- `free_redo` is disabled until it creates a real linked replacement work order
  with schedule, provider acceptance, customer visibility, and an explicit rule
  for the original held funds.
- `refund_with_warning` writes a canonical provider quality/disciplinary event
  in the same transaction as the resolution and shows that event in Provider
  360.
- Dispute 360 shows settlement state separately from case-decision state:
  pending, completed, retrying, failed/manual attention, or not applicable.
- Customer/provider wording says approved or processing until the financial
  movement has a completed ledger/gateway result.

## Decision required

**Option A — immutable settlement plus linked appeal/compensating action
(recommended).** This preserves audit history and prevents the original dispute
from being used as a second money instruction. Disable the incomplete Reopen,
free-redo, and warning controls until their replacement workflows exist.

**Option B — keep mutable reopen and add a full settlement-reversal engine.**
This requires formally reversing wallet and external gateway movements before a
second adjudication, including partial splits, provider payouts, fees, tax
records, receipts, retry rows, and already-withdrawn provider funds. This is
substantially riskier and is not recommended for launch.

Do not keep the current procedural-only Reopen behavior.

## Work paused

Per `AGENTS.md`, this is a money-path risk and a contradiction between current
documentation and implementation. The settlement/reopen redesign and any
production synchronization are paused. Safe non-money dispute fixes may
continue on the topic branch, but the branch must not merge or deploy until
this decision and the existing E50 production financial review are cleared.
