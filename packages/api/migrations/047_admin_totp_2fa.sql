-- Migration 047: Add TOTP 2FA columns for admin accounts
-- Enables Google Authenticator / Authy TOTP-based two-factor authentication

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quick lookup of 2FA-enabled admin users
CREATE INDEX IF NOT EXISTS idx_users_totp_enabled
  ON users (id) WHERE totp_enabled = TRUE AND role IN ('admin', 'super_admin');
