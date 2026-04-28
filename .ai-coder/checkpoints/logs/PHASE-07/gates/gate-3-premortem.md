# Phase 07 — Pre-Mortem

Five plausible incident scenarios for Booking 360 + Dispute Detail in
production.

## 1. Double-refund via concurrent admin clicks on /escrow/refund

**Scenario:** Two super-admins (or one super-admin double-clicking a slow
button) issue `POST /api/v1/admin/bookings/:id/escrow/refund` with
`amount: 50000` (₱500.00) within milliseconds of each other. Without
protection, both requests would call `escrowService.refundFromEscrow`,
each debiting escrow and crediting the customer wallet — customer
receives ₱1000.00 instead of ₱500.00.

**Detection:** Two `admin_actions` rows with
`action_type='refund_issued'` and identical `target_id` within a few
seconds, plus two paired wallet ledger rows in `wallet_transactions`.
A daily watch on `SELECT target_id, COUNT(*)
FROM admin_actions WHERE action_type='refund_issued'
AND created_at >= NOW() - INTERVAL '1 day' GROUP BY 1 HAVING COUNT(*)>1`
catches this within 24h.

**Mitigation now:** `escrowService.refundFromEscrow` runs inside a
`db.transaction` with `SELECT … FOR UPDATE` on the escrow + wallet rows
(verified by Phase 04 escrow tests, not duplicated here). The second
caller blocks on the first, then sees an updated escrow_status / amount
and either succeeds or throws based on remaining balance. Either way,
**total money out cannot exceed escrow held**.

**Future hardening:** add a per-booking idempotency token on the route
so the UI's accidental double-submit is rejected at the express layer
before even reaching the service.

## 2. Wrong action_type literal causes CHECK-constraint violation in production

**Scenario:** A future contributor renames `'booking_reassigned'` → 
`'provider_reassigned'` in `booking-admin.service.ts` but forgets to
update migration 054's CHECK list. Local tests pass (mocks don't
validate against pg's CHECK). On production, the first
`/reassign` call throws a `23514 admin_actions_action_type_check`
violation; the entire `db.transaction` rolls back; the booking's
provider_id stays on the old provider; the admin sees an opaque 500
and may retry, compounding confusion.

**Detection:** Production logs surface the unique pg error code
`23514` with constraint name `admin_actions_action_type_check`.
A weekly grep over error logs catches this. Long-term, integration
tests (see future-bugs / HONESTY-CHECK) running against a real
postgres would catch it pre-merge.

**Mitigation now:**
- `action_type` values are written as SQL **literals** in every INSERT
  (not `$N` parameters), making the constraint dependency obvious at
  every call site. A grep for the literal across the repo finds every
  caller.
- Migration 054 is additive-only and explicitly lists every literal
  this phase introduces (`booking_reassigned`,
  `booking_force_completed`, `dispute_message_sent`,
  `dispute_reopened`).
- Boundary tests assert the literal is present in the INSERT SQL, so
  silent renames trip the test suite.

**Future hardening:** wire a typecheck-time const union derived from
the migration so the TS compiler refuses unknown literals.

## 3. reopenDispute leaves a refund un-reversed

**Scenario:** A super-admin resolves a dispute as `full_refund`
(₱2000 returned to the customer wallet via `escrow.service`). Hours
later, after appeal review, the same super-admin reopens the dispute
via `POST /api/v1/admin/disputes/:id/reopen`. The dispute row flips
back to `under_review`, but the ₱2000 already credited to the customer
wallet is **not** clawed back. If the dispute is then re-resolved as
`no_refund`, the customer keeps ₱2000 they should not have.

**Detection:** Manual review of the dispute history is the only
detection today. The `admin_actions` audit chain (`dispute_resolved`
→ `dispute_reopened` → optional second `dispute_resolved`) makes this
visible to a careful reviewer but does not block the second resolve.

**Mitigation now:** `reopenDispute` requires a strict reason ≥ 20
chars and is super-admin-only. The premortem itself is documentation
that reviewers must check. HONESTY-CHECK calls out the gap explicitly
so it cannot be claimed as solved.

**Future hardening:** in `reopenDispute`, look up the most recent
`dispute_resolved` admin_action; if its details.refundAmount > 0,
either (a) require an additional explicit "I have already manually
reversed the wallet credit" checkbox, or (b) automatically post a
compensating wallet adjustment via `escrow.service` before flipping
status. Tracked in future-bugs as the highest-priority cleanup.

## 4. forceCompleteBooking interpreted as "release the money now"

**Scenario:** An admin sees a stuck booking, hits "Force complete",
and assumes escrow has been released. The endpoint actually only
transitions `bookings.status → 'confirmed'` and `confirmed_at → NOW()`
— escrow_status is unchanged. Provider does not get paid until a
separate `escrow/release` call. Provider complains; admin re-issues
force-complete (which throws `409 already in confirmed`); admin
escalates to engineering thinking money is lost.

**Detection:** Provider support ticket. The audit chain shows a
`booking_force_completed` row but no `manual_escrow_release` for the
same `target_id`, which is the visible symptom.

**Mitigation now:** the paper trace explicitly documents that
`forceCompleteBooking` does NOT call `releaseEscrow`. The frontend
Money tab presents Release and Force-Complete as two separate
buttons in the same card with adjacent copy — not chained.
HONESTY-CHECK captures the design choice.

**Future hardening:** add an inline tooltip to the Force-Complete
button: "This does NOT release escrow; use Release Escrow next." Or
introduce a wizard mode that prompts to release immediately after
force-complete.

## 5. cancelBookingAsAdmin partial-rollback split-brain

**Scenario:** `cancelBookingAsAdmin` calls
`escrowService.handleCancellation` BEFORE entering its own
`db.transaction` to UPDATE bookings + INSERT admin_actions. If the
INSERT into admin_actions fails (e.g., new action_type literal not in
the CHECK list — see incident 2), the booking UPDATE rolls back but
the escrow refund has already settled. Result: customer wallet has
the refund, but `bookings.status` is still active, so the booking
appears un-cancelled in admin lists. A second admin sees the active
booking and may re-cancel, attempting another refund on already-
released escrow → escrow.service throws.

**Detection:** Booking shows status='in_progress' but its escrow
shows refunded; or a `wallet_transactions` row of type='refund'
exists with no matching `booking_cancelled` admin_actions row for
the same booking_id within 1 second.

**Mitigation now:** the refund is itself audited by
`escrow.service.ts` (Phase 04 invariants), so reconciliation is
possible from that side. Customer money is never lost — only the
booking-state row may be stale. The test
"`cancelBookingAsAdmin` rolls back booking update if admin_actions
INSERT fails" asserts the rollback semantics (partial-state is
visible only when the transaction boundary is crossed mid-flow).

**Future hardening:** Move `escrowService.handleCancellation` INSIDE
the same `db.transaction` as the bookings UPDATE + admin_actions
INSERT, so any audit failure triggers a single atomic rollback.
This requires `escrow.service.handleCancellation` to accept an
external client; tracked in future-bugs.
