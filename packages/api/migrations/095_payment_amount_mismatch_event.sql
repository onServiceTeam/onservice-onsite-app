-- Migration 095: Add 'payment_amount_mismatch' to the security_events
-- event_type CHECK constraint.
-- MED-N155 fix.
--
-- Pre-fix: webhook.routes.ts payment.amount mismatch path only logged
-- via logger.error and broke the switch. PayMongo sending a different
-- amount than expected is a potential payment-tampering signal — fraud
-- could go unnoticed because nothing surfaced to the admin alerts
-- dashboard or to Sentry.
--
-- Post-fix: webhook.routes.ts logs a security_events row with
-- event_type='payment_amount_mismatch' and captures the deviation to
-- Sentry. Admin Compliance dashboard can list these for review.

ALTER TABLE security_events DROP CONSTRAINT security_events_event_type_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_event_type_check
  CHECK (event_type IN (
    'otp_lockout', 'ip_blocked', 'ip_unblocked',
    'new_device_login', 'suspicious_activity',
    'admin_login', 'admin_login_failed',
    'account_deactivated', 'captcha_required', 'captcha_failed',
    'payment_amount_mismatch'
  ));

COMMENT ON COLUMN security_events.event_type IS
  'Security event type. payment_amount_mismatch added in mig 095 (MED-N155) — webhook reported a different amount than the recorded payment intent. Potential tampering signal.';
