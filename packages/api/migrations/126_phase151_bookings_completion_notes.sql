-- Phase 151 — bookings.completion_notes
--
-- Pre-fix: the mobile provider job-completion screen
-- (apps/mobile/app/provider/job/[id]/complete.tsx) had a "Notes
-- (optional)" textarea that submitted as `notes` in the PATCH
-- /bookings/:id/status body. The validator (updateBookingStatusSchema)
-- doesn't declare `notes`, so Zod silently stripped it before the
-- service handler ever saw it. The service signature
-- transitionBookingStatus(bookingId, userId, role, newStatus,
-- cancellationReason) has no notes parameter either. Net effect:
-- providers' completion notes have been silently dropped since the
-- feature was built — the textarea was theatrical.
--
-- Same root cause as MED-N85 device-fingerprint (Phase 127): a field
-- the client sends that the validator doesn't declare gets stripped
-- silently. Phase 127 fixed N85 by declaring the field in the
-- validator. Phase 151 fixes this one the same way, plus persists
-- the notes to a new nullable column so they actually go somewhere.
--
-- Why a nullable column add is safe:
--   - No existing rows need a backfill.
--   - No existing reads reference completion_notes.
--   - No existing writes break.
-- Per CLAUDE.md, a nullable ADD COLUMN does not trip the
-- production-data-risk hard stop.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completion_notes TEXT;

COMMENT ON COLUMN bookings.completion_notes IS
  'Provider-supplied notes captured at job completion (status=''completed_by_provider'').
   Populated by transitionBookingStatus when the mobile completion
   flow includes a non-empty notes string. Surfaces in admin
   BookingDetailPage Timeline tab + provides dispute-defense audit
   trail. Phase 151 fix.';
