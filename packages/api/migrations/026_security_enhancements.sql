-- Phase 5 Medium Issues 91-110: Security Enhancements
-- OTP abuse protection, device fingerprinting, IP blocking, security event audit

-- 1. Login attempt tracking — escalating lockout for OTP abuse
CREATE TABLE login_attempts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    phone VARCHAR(15) NOT NULL,
    ip_address INET NOT NULL,
    attempt_type VARCHAR(20) NOT NULL CHECK (attempt_type IN ('otp_send', 'otp_verify', 'admin_login')),
    success BOOLEAN NOT NULL DEFAULT FALSE,
    device_fingerprint VARCHAR(128),
    user_agent TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_phone ON login_attempts(phone, created_at DESC);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, created_at DESC);
CREATE INDEX idx_login_attempts_type ON login_attempts(attempt_type, created_at DESC)
    WHERE success = FALSE;

-- 2. Device fingerprints — track known devices per user for fraud detection
CREATE TABLE device_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint VARCHAR(128) NOT NULL,
    device_name VARCHAR(255),
    platform VARCHAR(20) CHECK (platform IN ('ios', 'android', 'web')),
    is_trusted BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, fingerprint)
);

CREATE INDEX idx_device_fp_user ON device_fingerprints(user_id);
CREATE INDEX idx_device_fp_fingerprint ON device_fingerprints(fingerprint);

-- 3. IP block list — admin-managed blocked IPs/ranges
CREATE TABLE blocked_ips (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    ip_address INET NOT NULL,
    reason TEXT NOT NULL,
    blocked_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_blocked_ips_address ON blocked_ips(ip_address) WHERE is_active = TRUE;

-- 4. Security events — audit trail for security-relevant actions
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'otp_lockout', 'ip_blocked', 'ip_unblocked',
        'new_device_login', 'suspicious_activity',
        'admin_login', 'admin_login_failed',
        'account_deactivated', 'captcha_required', 'captcha_failed'
    )),
    ip_address INET,
    device_fingerprint VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX idx_security_events_ip ON security_events(ip_address, created_at DESC);
