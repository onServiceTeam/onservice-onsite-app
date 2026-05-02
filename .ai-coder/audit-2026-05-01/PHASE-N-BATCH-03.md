# Phase N Batch 3 — booking-admin.service.ts (1 file, 1,143 lines)

## File fully read
- packages/api/src/services/booking-admin.service.ts (1,143)

## Findings

### MED-N08 — getBookingEvidence references non-existent gps_checkins + receipts tables
**Where found:** packages/api/src/services/booking-admin.service.ts:506-554
```ts
const gpsExists = await db.query<{ tbl: string | null }>(
  `SELECT to_regclass('public.gps_checkins')::text AS tbl`,
);
if (gpsExists.rows[0]?.tbl) { ... }
```
**Understood:** Service performs runtime `to_regclass` checks for `gps_checkins` and `receipts` tables, only querying them if they exist. Phase J migrations show no gps_checkins or receipts table — so these queries always skip. The Booking Detail evidence tab therefore never displays GPS check-ins or receipts. The "best-effort" pattern hides the missing-table reality from operators. Either implement the tables (Phase J shows booking_photos for photos and booking_signatures for signatures, but no GPS or receipt tables), or remove the dead code paths.
**Fix:** Either create gps_checkins/receipts migrations OR delete the stub code and update the BookingEvidence type to drop those fields. Honest UI > "best-effort" silent skip.

### MED-N09 — getBookingEvidence reads `booking_images` table; migration 079 created `booking_photos`
**Where found:** packages/api/src/services/booking-admin.service.ts:469-479
```ts
const photosResult = await db.query<...>(
  `SELECT id, image_url, image_type, uploaded_by, created_at
     FROM booking_images
    WHERE booking_id = $1
    ORDER BY created_at ASC`,
  [bookingId],
);
```
**Understood:** Migration 079 (Phase J read) creates `booking_photos` (with `storage_url`, `photo_type`, `uploaded_by_role` columns). This service reads `booking_images` (with `image_url`, `image_type`, `uploaded_by` columns) — a DIFFERENT table that wasn't in any Phase J migration. Either:
- (a) `booking_images` is a legacy table created in a pre-audit migration that exists but wasn't reached by Phase J/G grep — service still reads from old structure while new migration 079 lives elsewhere; OR
- (b) Service references a non-existent table and crashes at runtime when the admin opens Booking Detail.

**Phase O verification:** grep migration 037+079 vs `booking_images` references. If `booking_images` truly exists, this is yet ANOTHER photo storage location (alongside the TEXT[] arrays from CRIT-K05 and the booking_photos table from 079) — three storage paths for booking photos.

**Fix:** Confirm canonical table. Update service to read from canonical (booking_photos per migration 079). Backfill any data from booking_images if it exists.

### MED-N10 — forceCompleteBooking sets status to 'confirmed' but doesn't release escrow
**Where found:** packages/api/src/services/booking-admin.service.ts:956-1011
```ts
await client.query(
  `UPDATE bookings SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1`,
  [bookingId],
);
```
**Understood:** Force-complete sets status to 'confirmed' but doesn't trigger escrow release. The autoConfirmBookings scheduler job (workers.ts:44) only picks up bookings where `completed_at < NOW() - 24h`. If the admin force-completes a booking that was just marked completed_by_provider, the scheduler waits another 24h before releasing escrow. Provider gets paid 24h late after an admin took explicit action.
**Fix:** After force-complete status update, call `escrowService.releaseEscrowInTransaction(client, bookingId)` followed by status='payout_ready'. Audit row already records previousStatus.

### POSITIVE — Phase 14 D06 transactional discipline (Bugs 69, 70, 71 verified)
- manualReleaseEscrow (line 612): single transaction wraps escrowService.releaseEscrowInTransaction + admin_actions INSERT. Pre-D06 these were separate; if audit failed, money moved without trail.
- refundBookingEscrow (line 690): same pattern. Single tx for escrow refund + audit insert. Gateway refund (paymentService.processRefund) intentionally post-commit (idempotent gateway calls).
- cancelBookingAsAdmin (line 854): single tx for escrow handling + booking status + audit. Pre-D06 these were 3 separate db.query.

### POSITIVE — Reason validation
- requireReason (line 159) trims whitespace, requires min length. manualReleaseEscrow=10, refund=10, reassign=5, cancel=10, forceComplete=20.

### POSITIVE — TERMINAL_REASSIGN_BLOCKED set
- Line 138-146 — prevents reassigning bookings in cancellation/payout/completed terminal states.

### POSITIVE — getBookingTimeline aggregates events
- Booking lifecycle events + admin_actions (with admin name) + chat first/last. Sorted by ISO date string (lexical = chronological for ISO 8601).

### POSITIVE — Comments document gate-c-allowed patterns
- Line 658, 749, 1114 — explicit "post-commit" comments. The architecture intentionally separates money/audit (transactional) from gateway/notification side effects (best-effort).

## Cumulative Phase N progress: 3 / 104 files (~4,071 lines)
