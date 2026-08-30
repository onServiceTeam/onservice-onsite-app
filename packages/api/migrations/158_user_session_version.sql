-- Migration 158: canonical account session generation.
--
-- Existing JWTs did not carry database-backed revocation state. A role change
-- or account deactivation could therefore leave an already-issued access token
-- usable until expiry. Version 1 is backward-compatible with tokens minted
-- before this migration; security-sensitive account transitions increment the
-- value so every older token fails canonical account-state validation.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_session_version_check;

ALTER TABLE users
  ADD CONSTRAINT users_session_version_check
  CHECK (session_version >= 1);

COMMENT ON COLUMN users.session_version IS
  'Monotonic session generation embedded in JWTs. Increment to invalidate every previously issued access, refresh, pre-auth, and socket credential for the account.';

COMMIT;
