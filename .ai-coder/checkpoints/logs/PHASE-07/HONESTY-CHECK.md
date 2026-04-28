# Phase 07 — HONESTY CHECK

Things this phase **does NOT** ship, gaps from the original spec, and
shortcuts the AI coder took. Read this before declaring Phase 07 "done".

## What I claimed vs what I actually did

The Phase 07 plan asked for:
- An admin **Booking Detail** page with all relevant tabs (overview,
  timeline, evidence, money actions, audit trail).
- An admin **Dispute Detail** page with claim/response, evidence,
  history, and a resolution form.
- Backend endpoints to power both pages.

**What shipped:**
- `BookingDetailPage.tsx` (1067 lines, 5 tabs: Overview, Timeline,
  Evidence, Money, Audit) wired at `/bookings/:id`.
- `DisputeDetailPage.tsx` (867 lines: two-column claim/response +
  evidence + history + resolution form) wired at `/disputes/:id`.
- 9 backend exports in `booking-admin.service.ts` (4 reads + 5 writes),
  6 in `dispute-admin.service.ts` (1 read + 5 writes).
- Routes mounted at `/api/v1/admin/bookings` and
  `/api/v1/admin/disputes` — registered in `server.ts` BEFORE the
  generic `/api/v1/admin` mount so `/:id` segments win.
- Migration 054 extends the `admin_actions.action_type` CHECK
  constraint additively for the four new literals
  (`booking_reassigned`, `booking_force_completed`,
  `dispute_message_sent`, `dispute_reopened`).
- BookingsPage / DisputesPage list pages got `<Link>` wraps on their
  ID columns — no other list-page changes.

## Tests written

`packages/api/__tests__/booking-dispute-admin.test.ts` — **50 unit
tests, all PASS**, contributing to the **644/644** jest project total
(Phase 06 baseline 594 → +50 this phase).

**All 50 are hermetic** — they mock `db.query`, `db.transaction`,
`escrow.service`, and `dispute.service`. **No integration test
exercises the real postgres CHECK constraints, the real wallet ledger,
or the real escrow flow this phase.** This is a deliberate scope
choice; the underlying primitives (`escrow.service.ts`,
`dispute.service.resolveDispute`) already have integration tests from
Phase 04. We rely on those.

## Money conservation evidence

The Phase 07 services DO move money, but only by **delegation**:

| Service function          | Delegates to                                  | Money math here? |
| ------------------------- | --------------------------------------------- | ---------------- |
| `manualReleaseEscrow`     | `escrowService.releaseEscrow`                 | NO               |
| `refundBookingEscrow`     | `escrowService.refundFromEscrow`              | NO               |
| `cancelBookingAsAdmin`    | `escrowService.handleCancellation` (if held)  | NO               |
| `adminResolveDispute`     | `disputeService.resolveDispute` (→ escrow)    | NO               |

Every centavo move is performed inside `escrow.service.ts` under its
own `db.transaction` with `SELECT … FOR UPDATE` locks on wallet and
escrow rows. Those invariants are tested in Phase 04 (and in the
mutation-coverage gate for the sacred files). This phase only writes
the matching `admin_actions` row and forwards the result to the
caller. Tests assert the delegation shape (mock invocation arguments)
but **do not re-prove balance_after invariants** — the `gate-5-money`
log carries those forward from prior phases.

`forceCompleteBooking` and `reopenDispute` change state that affects
future money flows but **do not move money themselves** — they are
state transitions, audited separately, and money still requires a
deliberate follow-up call to release/refund.

## Known gaps

### `gps_checkins` and `receipts` always return [] (until tables exist)

`getBookingEvidence` guards both reads behind `to_regclass`. Neither
table is created by any migration today. The Evidence tab will render
empty arrays on every booking, indefinitely, until those tables are
introduced (separate phase, cross-cutting with field/payments work).
See future-bugs #1.

### `sendDisputeMessage` is **audit-only** — no actual delivery

The endpoint name suggests a message is delivered; the implementation
writes ONLY an `admin_actions` row with
`action_type='dispute_message_sent'` and the message length. There is
**no call** to `notification.service.ts`. Customer/provider receive
nothing. Frontend should NOT promise delivery. See future-bugs #2.
Wiring delivery is left for a follow-up that owns the notification
template surface.

### `reopenDispute` does not reverse a prior refund

If a dispute was resolved as `full_refund` and is then reopened, the
wallet credit already issued is NOT clawed back. Procedural safeguards
only (super-admin gating + ≥20-char reason). See premortem #3 and
future-bugs #3.

### `cancelBookingAsAdmin` escrow refund crosses the audit transaction boundary

`escrowService.handleCancellation` is called BEFORE this service opens
its own `db.transaction` for the booking UPDATE + audit INSERT. A
failure of the audit INSERT therefore leaves a refunded-but-not-
cancelled split-brain. Money is not lost (the refund itself is
audited by escrow.service), but state is inconsistent. See premortem
#5 and future-bugs #4.

### No integration test of the resolve-dispute → wallet flow this phase

The 50 unit tests prove the delegation shape and the audit row, but
do NOT exercise the full path through dispute.service → escrow.service
→ wallet ledger against a real postgres. We rely on Phase 04's
integration coverage for that path. If `dispute.service.resolveDispute`
is changed in a way that breaks money conservation, this phase's tests
will not catch it — Phase 04's will.

## SQL literal vs parameter for `action_type`

Every INSERT into `admin_actions` writes the `action_type` value as a
**SQL literal** inside the SQL string (e.g.,
`action_type, target_type, ... VALUES ($1, 'manual_escrow_release',
'booking', $2, ...)`), not via `$N` parameter substitution.

**Why:** the value is a constant tied to the
`admin_actions_action_type_check` CHECK constraint defined in
migration 054. Using a literal makes the constraint dependency
obvious at every call site (a grep for the literal finds every place
the constraint matters), and unit tests assert the literal appears in
the SQL string — accidental parameterisation or a typo in the literal
would fail loudly. This mirrors Phase 06's `'customer_credited'`
encoding choice for the same reason.

## Spec items deferred / not shipped

| Item                                                  | Status        | Why |
| ----------------------------------------------------- | ------------- | --- |
| Real GPS check-in display                             | **deferred**  | `gps_checkins` table not yet created. |
| Real receipts display                                 | **deferred**  | `receipts` table not yet created. |
| In-app delivery for dispute messages                  | **deferred**  | `notification.service.ts` integration is its own scope. |
| Refund clawback on dispute reopen                     | **deferred**  | Requires compensating ledger design — premortem #3. |
| Atomic cancel (escrow + booking + audit in 1 txn)     | **deferred**  | Requires `escrow.service.handleCancellation` to accept an external client. |
| Real-time push of status changes to other admins      | **Phase 10**  | Sockets infrastructure not in scope here. |
| Integration tests against real postgres for new flows | **deferred**  | Phase 04 covers the underlying money primitives. |

## Migration count

Phase 07 ships **one** migration: `054_booking_admin_action_types.sql`
(17 lines). It is **additive only** — drops and re-creates the
`admin_actions_action_type_check` CHECK constraint with the original
literals plus four new ones (`booking_reassigned`,
`booking_force_completed`, `dispute_message_sent`,
`dispute_reopened`). No data writes; no schema-breaking changes; no
new tables.

## Sacred-file touches (TD-005)

This phase **does not write** to any sacred file directly. It writes
to `admin_actions` (audit, not sacred-money) and DELEGATES every
money write to `escrow.service.ts` / `dispute.service.ts`. Mutation
coverage on those underlying services is carried by their own gates
(established in earlier phases) and rerun by `verify-master`'s
mutation gate against the sacred-file allowlist.
