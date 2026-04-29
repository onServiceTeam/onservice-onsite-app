-- Migration 070: Admin CSRF tokens
-- Phase 14 Dispatch 01 Bug 1251 fix.
--
-- Backing store for admin-side CSRF tokens. The admin session model after
-- this migration is:
--
-- 1. Admin login issues two HttpOnly cookies (admin_session = access JWT,
--    admin_refresh = refresh token) that JavaScript on admin.onservice.ph
--    cannot read.
-- 2. A third cookie `admin_csrf` (NOT HttpOnly) carries a per-session random
--    value that JS reads and echoes in an `X-CSRF-Token` header on every
--    write request. Server middleware compares the cookie value to the
--    header value. Mismatch = 403.
-- 3. This table records each issued CSRF token with its admin_user_id and
--    expiry so the middleware can verify the token belongs to a real,
--    not-yet-expired session. (Pure double-submit-cookie checks the cookie
--    matches the header but doesn't verify the token was ever issued by
--    us; tying it to an admin_user_id closes that residual gap.)
-- 4. Logout revokes the refresh token AND deletes the CSRF row so any
--    in-flight requests fail closed.
--
-- A daily cleanup job (registered in jobs/workers.ts) deletes rows where
-- expires_at < NOW() - INTERVAL '1 day'.

CREATE TABLE admin_csrf_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_csrf_user ON admin_csrf_tokens(admin_user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_admin_csrf_expires ON admin_csrf_tokens(expires_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE admin_csrf_tokens IS
  'Per-session CSRF tokens for admin web. Issued at login, validated on every write request via X-CSRF-Token header against the admin_csrf cookie. Bug 1251 (Phase 14 Dispatch 01) fix.';
COMMENT ON COLUMN admin_csrf_tokens.token IS
  'Random 32-byte base64url-encoded value. Stored verbatim because the value is also stored client-side as a non-HttpOnly cookie that JS reads.';
COMMENT ON COLUMN admin_csrf_tokens.expires_at IS
  'Same lifetime as the access token (15 min by default). Refreshed when the refresh-token endpoint rotates tokens.';
