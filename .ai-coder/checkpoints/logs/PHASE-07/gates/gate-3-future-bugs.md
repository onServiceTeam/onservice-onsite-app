# Phase 07 — Future Bugs

The single bug most likely to surface within 2 weeks of shipping
Booking 360 + Dispute Detail, plus the next-most-likely candidates.

## #1 (most likely): Evidence tab shows empty GPS / receipts forever

**Why:** `getBookingEvidence` guards both `gps_checkins` and `receipts`
table reads behind `SELECT to_regclass('public.<table>')`. Neither
table exists in any migration today (verified by grep). The guard
keeps the endpoint from crashing — but the result is that the Evidence
tab will silently render empty "GPS check-ins" and "Receipts" sections
on every booking, forever, until the tables are created.

**How it surfaces:** Admin opens the Evidence tab on a booking that
*should* have GPS data (perhaps from the field-app rollout) — sees
nothing — files a bug "GPS not showing" — engineering investigates
and discovers the tables were never built.

**Mitigation now:** HONESTY-CHECK documents the always-empty arrays.
Frontend renders an explicit "No GPS check-ins recorded." copy rather
than a misleading "Loading…" state.

**Mitigation later:** Create `gps_checkins` and `receipts` tables
(separate phase — they're cross-cutting with the field/payments
work) and remove the `to_regclass` guards.

---

## #2: `sendDisputeMessage` does not actually deliver the message

The endpoint name implies a notification is sent; the implementation
only writes an `admin_actions` row with `action_type='dispute_message_sent'`
and the message length. There is **no call** to
`notification.service.ts`, no email, no push. An admin may believe
the customer/provider received the message and stop following up.
Fix later: wire `notification.service.send(disputeId, recipient,
message)` inside the same `db.transaction`, with a fallback that
fails the audit row if delivery cannot be queued.

---

## #3: `reopenDispute` does not reverse a prior refund

Documented as premortem incident 3. If a dispute is resolved as
`full_refund` (money already moved to customer wallet) and then
reopened, the wallet credit is NOT clawed back. The current safeguards
are procedural only (super-admin gating + ≥20-char reason). Fix later
inside `reopenDispute`: look up the most recent `dispute_resolved`
admin action; if its `details.refundAmount > 0`, either require an
explicit acknowledgement flag or post a compensating ledger entry via
`escrow.service` before flipping status.

---

## #4: `cancelBookingAsAdmin` escrow refund happens outside the audit transaction

Documented as premortem incident 5. `escrowService.handleCancellation`
is called BEFORE the `db.transaction` opens for booking UPDATE +
`admin_actions` INSERT. If the audit INSERT fails (e.g., a future
action_type rename desyncs from the CHECK constraint), the booking
state rollback leaves a refunded-but-not-cancelled split-brain. Fix
later by threading the transaction client through
`escrowService.handleCancellation`.

---

## #5: No real-time push for booking/dispute status changes

When a super-admin reassigns a provider or resolves a dispute, the
target booking/dispute row in another admin's already-open
BookingsPage / DisputesPage tab does not refresh until react-query's
default staleTime expires. Two admins working in parallel may see
divergent status until a manual refresh. Phase 10 is slated to wire
sockets; until then, fix locally by lowering the list-page staleTime
or adding a "Refreshed N seconds ago" indicator with a manual
refetch button.

---

## #6: `priorityScore = totalAmount * ageHours` overflows on stale disputes

`getDisputeFullDetail` computes `priorityScore` in JS as
`totalAmount * Math.max(ageHours, 0)`. For a ₱100,000 booking
(10,000,000 centavos) sitting open for 1 year (~8760 hours), the
product is 8.76e10 — fine for JS Number, but if it's later persisted
into a 32-bit `INTEGER` column (current schema does not store it,
but a future view might) it overflows silently. Cosmetic if it stays
client-side. Fix later by clamping the upper bound or persisting as
BIGINT.
