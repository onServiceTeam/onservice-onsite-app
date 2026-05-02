# Phase N Batch 7 — dispute.service.ts (1 file, 843 lines)

## File fully read
- packages/api/src/services/dispute.service.ts (843)

## Findings

### MED-N18 — Auto-resolution no_show 5-minute threshold too tight
**Where found:** packages/api/src/services/dispute.service.ts:209-211
```ts
const minutesBetween = (completedMs - scheduledMs) / (1000 * 60);
if (minutesBetween < 5) {
  // Auto-resolve as no_show with full refund
}
```
**Understood:** Provider who marks job complete within 5 min of scheduled time is auto-flagged as no_show. A real provider arriving 2-3 min early and starting work immediately, then marking complete after 4 min of small task (e.g., quick repair), would trigger this auto-refund. Threshold should be wider (e.g., minimum 30 min completion-after-scheduled).
**Fix:** Tune threshold via settingsService. Recommend `minutes_for_no_show_auto_resolution = 30`.

### MED-N19 — Auto-resolved dispute refund call outside transaction
**Where found:** packages/api/src/services/dispute.service.ts:168-174
```ts
if (dispute.status === 'resolved' && dispute.auto_resolved && Number(dispute.refund_amount) > 0) {
  try {
    await escrowService.refundFromEscrow(bookingId, Number(dispute.refund_amount), 'Auto-resolved dispute refund');
  } catch (err) {
    logger.error('Failed to process auto-resolve refund', ...);
  }
}
```
**Understood:** Inside the transaction, dispute is marked 'resolved' and booking.escrow_status='refunded' (auto-resolution branch). Then OUTSIDE the transaction, escrow refund executes. If escrow refund fails, the dispute and booking are already in resolved/refunded state but no money moved. Customer expects refund, doesn't get it. Same anti-pattern as Bug 71 family pre-D06.
**Fix:** Use refundFromEscrowInTransaction inside the same db.transaction. If escrow fails, the dispute resolution rolls back too.

### POSITIVE — Phase 14 D06 fixes verified
- **Bug 84** (escalateDispute, line 603): Single transaction wraps dispute UPDATE + admin_actions INSERT with FOR UPDATE lock. Pre-D06 these were separate.
- **gate-promotion** (assignDispute, line 641): Same single-transaction pattern.
- **Bug 83** (resolveDisputeInTransaction, line 421): Dedicated trx-aware helper. Caller owns transaction + admin_actions audit. Clean separation.

### POSITIVE — Dispute filing safeguards
- Line 87-89: Disputes only accepted for completed bookings.
- Line 91-96: Disputes must be filed within escrowDisputeWindowHours (48h).
- Line 98-104: Refuses second active dispute on same booking.
- Line 113-166: Single transaction wraps disputes INSERT + dispute_evidence INSERT (per-evidence) + bookings status UPDATE + provider notification.

### POSITIVE — Provider response paths
- accept → full refund + booking resolved.
- contest → escalate to tier 2.
- partial_offer → set refund_amount, customer can accept later.

### POSITIVE — Customer accept partial offer
- acceptPartialOffer (line 340): Customer-initiated resolution. Refund + remaining released to provider.

### POSITIVE — Auto-escalate stale disputes
- autoEscalateStaleDisputes (line 772): scheduler job (called every 6h per workers.ts) bumps tier on disputes open >48h with no provider response.

### POSITIVE — Listing sorted by priority
- Line 716-722: ORDER BY status priority (escalated > open > under_review > resolved) then by created_at ASC.

## Cumulative Phase N progress: 7 / 104 files (~7,882 lines)
