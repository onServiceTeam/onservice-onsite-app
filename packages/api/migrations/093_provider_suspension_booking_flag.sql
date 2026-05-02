-- Migration 093: Flag in-flight bookings when their provider is
-- suspended, so the escrow release path can refuse to disburse
-- until admin explicitly resolves the case.
--
-- MED-N73 fix.
--
-- Pre-fix: when admin suspended a provider, their in-flight
-- bookings (provider_en_route, provider_arrived, in_progress,
-- completed_by_provider) stayed assigned. The suspended provider
-- could still mark "completed" and trigger escrow release to
-- their (now-suspended) wallet. The customer would have no
-- recourse and admin would learn about it only via complaint.
--
-- Post-fix: admin.service.suspendProvider now sets this column
-- on every in-flight booking row in the same transaction as the
-- status flip. escrow.service.releaseEscrow refuses to disburse
-- when this column is non-null, returning a clear error so admin
-- can either manually refund the customer or revoke the
-- suspension.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS provider_suspended_during_booking_at TIMESTAMPTZ;

-- Partial index: only the rows the escrow path needs to look up.
CREATE INDEX IF NOT EXISTS idx_bookings_provider_suspended_flag
  ON bookings(id)
  WHERE provider_suspended_during_booking_at IS NOT NULL;

COMMENT ON COLUMN bookings.provider_suspended_during_booking_at IS
  'Set by admin.service.suspendProvider when the provider was suspended while this booking was in-flight (provider_en_route, provider_arrived, in_progress, completed_by_provider). escrow.service.releaseEscrow refuses to disburse when this is non-null. Admin must clear it (manual refund or revoke suspension) before escrow can release. MED-N73 fix.';
