-- 098_device_revoked_event.sql — extend security_events.event_type CHECK
-- to include 'device_revoked'.
--
-- MED-N63 fix.
--
-- Pre-fix: security.service.ts revokeDevice() only DELETEd the
-- device_fingerprints row; nothing was written to the security_events
-- audit trail. If an attacker hijacked a session and revoked the
-- legitimate user's device to lock them out, the admin compliance
-- dashboard had no record of which device was revoked, when, from
-- which IP, by which session.
--
-- Post-fix: revokeDevice runs DELETE + INSERT INTO security_events in
-- a single transaction. The new event_type 'device_revoked' carries
-- the device fingerprint, last-known IP, and metadata about the
-- revoked device (name, platform, trusted status).
--
-- This migration extends the CHECK constraint. Builds on migration
-- 095 (payment_amount_mismatch).

ALTER TABLE security_events DROP CONSTRAINT security_events_event_type_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_event_type_check
  CHECK (event_type IN (
    'otp_lockout', 'ip_blocked', 'ip_unblocked',
    'new_device_login', 'suspicious_activity',
    'admin_login', 'admin_login_failed',
    'account_deactivated', 'captcha_required', 'captcha_failed',
    'payment_amount_mismatch',
    'device_revoked'
  ));

COMMENT ON COLUMN security_events.event_type IS
  'Security event type. device_revoked added in mig 098 (MED-N63) for the audit trail when a user (or attacker) revokes a device fingerprint.';
