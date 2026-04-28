# Phase 07 — Boundary Tests

Boundary behavior for every new exported function across both Phase 07
service files. ✓ = covered by a unit test in
`packages/api/__tests__/booking-dispute-admin.test.ts` (50 tests, all PASS).

## File: packages/api/src/services/booking-admin.service.ts (922 lines)

### getBookingDetail(bookingId: string): Promise<BookingDetail>  — line ~157
- Inputs validated: `bookingId` UUID resolved by route param (no service-side validation).
- Errors thrown: `404 'Booking not found.'` when no row.
- SQL writes: 0. Reads 1–2 queries (booking core + optional customer stats).
- Money side-effect: NO.
- Audit row: NO.
- ✓ valid id → projects nested customer/provider/address/category, money fields coerced from `::text` to Number.
- ✓ missing booking → 404.
- ✓ optional customer stats path skipped when `customer_id` is null.
- BIGINT-ish columns (`lifetime`, `total_jobs`) coerced via Number().

### getBookingTimeline(bookingId: string): Promise<TimelineEvent[]>  — line ~325
- Errors thrown: `404 'Booking not found.'`.
- SQL writes: 0. Reads 2 + 1 best-effort (chat).
- Audit row: NO.
- ✓ assembles synthetic events (booking_created, optional booking_confirmed/job_completed/booking_cancelled) from booking columns.
- ✓ merges admin_actions rows scoped to `target_type='booking'`.
- ✓ chat lookup wrapped in try/catch — failure logged via `logger.info`, NOT thrown (see future-bugs).
- ✓ events sorted ascending by `at`.

### getBookingEvidence(bookingId: string): Promise<BookingEvidence>  — line ~448
- Errors thrown: `404 'Booking not found.'`.
- SQL writes: 0. Reads up to 7 (booking, photos, chat count, 2× to_regclass, 2× conditional table reads).
- Audit row: NO.
- ✓ photos.uploadedBy resolved by comparing `uploaded_by` to `customer_id`; otherwise marked 'provider'.
- ✓ `gps_checkins` and `receipts` queried only if `to_regclass` returns non-null — tables may not exist yet (see future-bugs).
- ✓ chatMessageCount via single `SELECT COUNT(*) JOIN conversations`.

### getBookingDispute(bookingId: string): Promise<BookingDispute | null>  — line ~565
- Errors thrown: NONE (returns null when no dispute exists).
- SQL writes: 0. Reads 1.
- Audit row: NO.
- ✓ returns null when no dispute attached to booking.
- ✓ projects most-recent dispute via `ORDER BY created_at DESC LIMIT 1`.

### manualReleaseEscrow(bookingId, reason, adminUserId): Promise<ManualReleaseResult>  — line ~617  ← SACRED
- Inputs validated: `requireReason(reason, 10)` — trimmed, ≥10 chars.
- Errors thrown: `400 'reason is required.'` / `400 'reason must be at least 10 characters.'`; `500 'Failed to record manual escrow release admin action.'` if INSERT returns no id; plus whatever `escrowService.releaseEscrow` throws (404, 409, etc.).
- SQL writes: 1 in this service (`admin_actions`); escrow.service writes the wallet/escrow rows.
- Money side-effect: YES — DELEGATED to `escrowService.releaseEscrow(bookingId)`. No money math here.
- Audit row: YES, `action_type='manual_escrow_release'` (SQL literal).
- ✓ short / empty / whitespace reason → 400.
- ✓ escrow.releaseEscrow rejection bubbles untouched.
- ✓ admin INSERT failure (no `id` returned) → 500 'Failed to record …'.
- ✓ happy path returns `{ bookingId, releasedAmount, reason, adminActionId }`.

### refundBookingEscrow(bookingId, refundAmount, reason, adminUserId): Promise<RefundResult>  — line ~660  ← SACRED
- Inputs validated:
  - `refundAmount` must be finite, integer, > 0 → else `400 'refundAmount must be a positive integer (centavos).'`
  - `requireReason(reason, 10)`.
- SQL writes: 1 (`admin_actions`); escrow.service handles ledger.
- Money side-effect: YES — DELEGATED to `escrowService.refundFromEscrow(bookingId, refundAmount, reason)`.
- Audit row: YES, `action_type='refund_issued'`.
- ✓ rejects 0, negative, NaN, fractional refundAmount.
- ✓ rejects short reason (<10 chars).
- ✓ admin INSERT failure → 500.

### reassignBookingProvider(bookingId, newProviderId, reason, adminUserId): Promise<ReassignResult>  — line ~711
- Inputs validated: `requireReason(reason, 5)`; newProviderId required at route layer.
- Errors thrown: `404 'Booking not found.'`; `409 'Cannot reassign booking in status "<status>".'` (when status ∈ TERMINAL_REASSIGN_BLOCKED set: `completed_by_provider`, `confirmed`, `cancelled_by_*`, `paid_out`, `payout_ready`); `404 'New provider not found.'`; `409 'New provider is not active.'`; `500 'Failed to record reassign admin action.'`.
- SQL writes: 2 inside one `db.transaction`: UPDATE bookings, INSERT admin_actions.
- Money side-effect: NO (escrow remains held under same booking).
- Audit row: YES, `action_type='booking_reassigned'`.
- ✓ blocks reassign on terminal/payout statuses.
- ✓ blocks reassign to inactive provider.
- ✓ short reason → 400.
- ✓ details JSON includes `oldProviderId` + `newProviderId`.

### cancelBookingAsAdmin(bookingId, reason, adminUserId, hoursUntilScheduled?, providerArrived?, customerNoShow?): Promise<CancelResult>  — line ~789  ← conditional SACRED
- Inputs validated: `requireReason(reason, 10)`.
- Errors thrown: `404 'Booking not found.'`; `409 'Booking is already cancelled (status: <status>).'` when status ∈ TERMINAL_CANCELLED.
- SQL writes: 2 inside `db.transaction` (UPDATE bookings, INSERT admin_actions). Plus delegated `handleCancellation` writes to wallet/escrow.
- Money side-effect: YES IF `escrow_status === 'held'` → DELEGATED to `escrowService.handleCancellation(bookingId, hours, arrived, noShow)`. Otherwise refundAmount = 0, no money move.
- Audit row: YES, `action_type='booking_cancelled'`. details JSON: `{hoursUntilScheduled, providerArrived, customerNoShow, refundAmount}`.
- ✓ rejects double-cancel.
- ✓ refund happens BEFORE booking UPDATE (rollback risk noted in HONESTY-CHECK).

### forceCompleteBooking(bookingId, reason, adminUserId): Promise<ForceCompleteResult>  — line ~862
- Inputs validated: `requireReason(reason, 20)` — strictest threshold.
- Errors thrown: `404 'Booking not found.'`; `409 'Cannot force-complete booking in status "<status>".'` when status ∉ FORCE_COMPLETE_ALLOWED `{in_progress, completed_by_provider}`.
- SQL writes: 2 inside `db.transaction` (UPDATE bookings status='confirmed' + confirmed_at=NOW(), INSERT admin_actions).
- Money side-effect: NO (does NOT call releaseEscrow). Sets booking up for the standard release pipeline.
- Audit row: YES, `action_type='booking_force_completed'`.
- ✓ rejects status outside in_progress / completed_by_provider.
- ✓ short reason (<20 chars) → 400.

## File: packages/api/src/services/dispute-admin.service.ts (712 lines)

### getDisputeFullDetail(disputeId: string): Promise<DisputeFullDetail>  — line ~242
- Errors thrown: `404 'Dispute not found.'`.
- SQL writes: 0. Reads 1 + 3 parallel.
- Audit row: NO.
- ✓ projects booking + customer + provider with 90-day stats and pattern classification.
- ✓ priorityScore = totalAmount × max(ageHours, 0).
- ✓ customerPattern: total≥3 AND favored/total≥0.5 → AT_RISK; total≥2 → REVIEW_REQUIRED; else OK.
- ✓ providerPattern: total≥5 AND lost/total≥0.5 → AT_RISK; total≥3 → REVIEW_REQUIRED; else OK.
- ✓ evidence.uploadedBy resolved by comparing `uploaded_by` to customer_id / provider_user_id.

### adminAssignDispute(disputeId, assigneeAdminId, adminUserId): Promise<AssignResult>  — line ~439
- Inputs validated: `assigneeAdminId` non-empty trimmed → else `400 'assigneeAdminId is required.'`
- Errors thrown: above + whatever `disputeService.assignDispute` throws + `500 'Failed to record dispute assign admin action.'`
- SQL writes: 1 (`admin_actions`); dispute.service updates dispute row.
- Money side-effect: NO.
- Audit row: YES, `action_type='dispute_assigned'`. details: `{assigneeAdminId}`.
- ✓ rejects empty/whitespace assigneeAdminId.

### adminResolveDispute(disputeId, input: AdminResolveInput, adminUserId): Promise<AdminResolveResult>  — line ~478  ← SACRED
- Inputs validated:
  - `requireText(input.decisionNotes, 'decisionNotes', 20)` — trimmed, ≥20 chars.
  - if `resolutionType === 'partial_refund'`: `refundPercent` must be finite, > 0, ≤ 100 → else `400 'refundPercent must be in (0, 100] for partial_refund.'`
  - resolutionType union enforced at route layer.
- Errors thrown: above + whatever `disputeService.resolveDispute` throws + `500 'Failed to record dispute resolve admin action.'`
- SQL writes: 1 (`admin_actions`); dispute.service handles dispute UPDATE + escrow.service handles money.
- Money side-effect: YES — DELEGATED to `disputeService.resolveDispute` (which calls escrow.service).
- Audit row: YES, `action_type='dispute_resolved'`. details: `{resolutionType, refundPercent, refundAmount}`. `reason` column = decisionNotes.
- ✓ short decisionNotes → 400.
- ✓ partial_refund without valid percent → 400.
- ✓ rejects refundPercent ≤ 0 / > 100 / non-finite.

### adminEscalateDispute(disputeId, reason, adminUserId): Promise<EscalateResult>  — line ~546
- Inputs validated: `requireText(reason, 'reason', 10)`.
- Errors thrown: above + whatever `disputeService.escalateDispute` throws + `500 'Failed to record dispute escalate admin action.'`
- SQL writes: 1.
- Money side-effect: NO.
- Audit row: YES, `action_type='dispute_escalated'`. details: `{newTier}`.
- ✓ short reason → 400.

### sendDisputeMessage(disputeId, recipient: 'customer'|'provider'|'both', message, adminUserId): Promise<MessageResult>  — line ~597
- Inputs validated:
  - message trimmed length ∈ [5, 2000] → else `400 'message must be between 5 and 2000 characters.'`
  - recipient enum enforced at route layer.
- Errors thrown: above + `404 'Dispute not found.'` + `500 'Failed to record dispute message admin action.'`
- SQL writes: 1 inside `db.transaction` (INSERT admin_actions). NO message delivery — see HONESTY-CHECK.
- Money side-effect: NO.
- Audit row: YES, `action_type='dispute_message_sent'`. details: `{recipient, messageLength}`. `reason` column = first 500 chars of message.
- ✓ rejects too-short / too-long message.
- ✓ rejects unknown dispute.

### reopenDispute(disputeId, reason, adminUserId): Promise<ReopenResult>  — line ~663
- Inputs validated: `requireText(reason, 'reason', 20)` — strictest threshold.
- Errors thrown: above + `404 'Dispute not found.'` + `409 'Cannot reopen dispute in status "<status>".'` when status ∉ REOPENABLE_STATUSES `{resolved, closed}` + `500 'Failed to record dispute reopen admin action.'`.
- SQL writes: 2 inside `db.transaction` (UPDATE disputes status='under_review', resolved_at=NULL, resolved_by=NULL; INSERT admin_actions).
- Money side-effect: NO — reopen does NOT reverse a prior refund (see HONESTY-CHECK + premortem).
- Audit row: YES, `action_type='dispute_reopened'`. details: `{previousStatus}`.
- ✓ rejects reopen on non-resolved/closed status.
- ✓ short reason → 400.

## Cross-cutting invariants asserted across the suite

- ✓ Every mutating function's INSERT into `admin_actions` writes `action_type` as a SQL literal (not a parameter), matching the new CHECK in migration 054.
- ✓ Every mutating function returns an `adminActionId` and tests assert it is propagated.
- ✓ Money-moving functions (`manualReleaseEscrow`, `refundBookingEscrow`, `cancelBookingAsAdmin`, `adminResolveDispute`) NEVER perform arithmetic locally — tests assert `escrowService.*` / `disputeService.resolveDispute` is invoked with the expected arguments.
- ✓ Test file: `packages/api/__tests__/booking-dispute-admin.test.ts` — 50 tests, hermetic mocks of `db` + `escrow.service` + `dispute.service`. All PASS. Project total: **644** (was 594 in Phase 06; +50 this phase).
