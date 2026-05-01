-- CRIT-N12 fix — hash OTP codes at write so a DB read does not expose
-- live verification codes.
--
-- Pre-fix: otp_codes.code stored the 6-digit OTP in plaintext. A DB
-- breach (read-only access via SQL injection, leaked snapshot, insider
-- with read access) revealed live OTPs for the entire 5-minute TTL of
-- every active row. Combined with OTP being the only auth gate for
-- non-admin accounts, this was the highest-impact lateral-movement
-- vector after a DB breach.
--
-- Post-fix: otp_codes.code_hash stores a scrypt hash of the OTP +
-- phone (phone-as-salt prevents rainbow-table attacks at scale).
-- Service-layer code at packages/api/src/services/auth.service.ts
-- writes only the hash; verify hashes the incoming code and compares
-- with crypto.timingSafeEqual.
--
-- Rollout: this migration adds the new column nullable. Service code
-- writes only code_hash going forward. The legacy `code` column is
-- left in place so any in-flight rows from before the deploy can still
-- be verified — an old row's `code` is checked first, then the new
-- code_hash path. After 10 minutes (max OTP TTL × 2) every legacy row
-- is expired/used, and a follow-up migration can drop `code`.
--
-- Schema before:
--   otp_codes (id, phone, code TEXT NOT NULL, attempts, is_used,
--              expires_at, created_at, locked_until)
-- Schema after:
--   otp_codes (..., code TEXT NULL,           -- nullable for new rows
--              code_hash TEXT NULL,           -- new
--              ...)

ALTER TABLE otp_codes
  ALTER COLUMN code DROP NOT NULL;

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS code_hash TEXT;

-- Index to keep the SELECT in verifyOtp performant. The hash is
-- 6+ char alphanumeric with separator; btree is fine for equality.
CREATE INDEX IF NOT EXISTS otp_codes_code_hash_lookup
  ON otp_codes (phone, code_hash)
  WHERE is_used = FALSE;

COMMENT ON COLUMN otp_codes.code IS
  'Legacy plaintext OTP. Pre-CRIT-N12. Will be DROPPED in a follow-up migration once rollout is complete.';
COMMENT ON COLUMN otp_codes.code_hash IS
  'CRIT-N12 fix — scrypt hash of OTP code + phone. Format same as auth.service.ts password hash: scrypt:N:r:p:salt:hash';
