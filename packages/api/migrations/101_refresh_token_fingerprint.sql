-- Migration 101: Bind refresh tokens to a device fingerprint + IP.
-- MED-N85 fix.
--
-- Pre-fix: a stolen refresh token from device A worked seamlessly on
-- device B until manually revoked. The /refresh-token route accepted
-- the token in the body and minted new tokens with no provenance check.
--
-- Post-fix: at issuance (verifyOtp + refreshAccessToken + createTokenPair)
-- we capture the device_fingerprint that the mobile client already
-- sends in the body PLUS the source IP. On refresh, the auth service
-- compares the incoming fingerprint to the stored one. On mismatch we
-- ALWAYS log a security_event (auditable forensic trail) and, if the
-- platform setting `refresh_token_strict_fingerprint` is TRUE, we also
-- reject the refresh (forcing the user to re-authenticate via OTP).
--
-- Defaults to NON-strict so we don't lock out legitimate users whose
-- fingerprint changed (app reinstall, OS upgrade resets DeviceInfo
-- ids). Admin can flip the flag to strict after watching the security
-- event log for false-positive volume.
--
-- Both new columns are nullable so existing tokens (issued before this
-- migration) continue to refresh until they expire — they just won't
-- have a stored fingerprint to compare against.

ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS created_ip INET;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_fingerprint
    ON refresh_tokens(device_fingerprint)
    WHERE device_fingerprint IS NOT NULL;

COMMENT ON COLUMN refresh_tokens.device_fingerprint IS
    'Device fingerprint captured at token issuance. NULL for tokens minted before mig 101 (MED-N85). On refresh the service compares incoming vs stored — mismatch is always logged as a security_event; rejection is gated by platform_settings.refresh_token_strict_fingerprint.';
COMMENT ON COLUMN refresh_tokens.created_ip IS
    'Source IP at token issuance. Captured for forensic audit only — not used for refresh-time comparison because mobile clients legitimately roam between cell + wifi.';

-- Add the new security_event type for fingerprint mismatch.
ALTER TABLE security_events DROP CONSTRAINT security_events_event_type_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_event_type_check
    CHECK (event_type IN (
        'otp_lockout', 'ip_blocked', 'ip_unblocked',
        'new_device_login', 'suspicious_activity',
        'admin_login', 'admin_login_failed',
        'account_deactivated', 'captcha_required', 'captcha_failed',
        'payment_amount_mismatch',
        'device_revoked',
        'refresh_token_fingerprint_mismatch'
    ));

COMMENT ON COLUMN security_events.event_type IS
    'Security event type. refresh_token_fingerprint_mismatch added in mig 101 (MED-N85) — refresh attempted with a fingerprint that differs from the one captured at issuance.';

-- Default the strict-fingerprint setting to FALSE so admins can
-- observe the mismatch volume in security_events before flipping it.
INSERT INTO platform_settings (
    category, subcategory, key, label, description,
    value_type, value, default_value,
    display_order, is_active
)
VALUES (
    'security', 'auth',
    'refresh_token_strict_fingerprint',
    'Reject refresh on fingerprint mismatch',
    'When TRUE, refresh-token attempts whose device_fingerprint differs from the one captured at issuance are REJECTED (force OTP re-auth). When FALSE (default), the mismatch is logged as a security_event but the refresh succeeds. MED-N85.',
    'boolean', 'false', 'false',
    200, TRUE
)
ON CONFLICT (key) DO NOTHING;
