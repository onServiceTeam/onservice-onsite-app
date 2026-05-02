-- Migration 097: Add `tin` (BIR Tax Identification Number) to providers.
-- MED-N20 fix.
--
-- Pre-fix: bir-2307.service rendered "[Provider TIN — pending]" on
-- every PDF because the providers table had no `tin` column. The
-- BIR 2307 form is the payee's evidence of creditable withholding
-- tax — without their TIN on the form, the payee can't link the
-- withheld amount to their own BIR records, defeating the form's
-- purpose. NPC RA 10173 §11 also requires structured PII storage
-- of identity documents like TIN.
--
-- Post-fix:
--   1. Add nullable `tin` TEXT column (existing providers won't
--      have one; admin / provider can fill in later via profile UI).
--   2. CHECK constraint enforces the canonical PH BIR TIN format:
--      9 digits + 3 hyphenated suffix segments (e.g.,
--      123-456-789-000). The 4th segment is the branch code (000
--      for individuals, 001+ for branches).
--   3. Partial unique index — TINs should be unique among populated
--      values; nulls are allowed (multiple providers without TIN OK).

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS tin TEXT
  CHECK (tin IS NULL OR tin ~ '^[0-9]{3}-[0-9]{3}-[0-9]{3}-[0-9]{3,5}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_tin
  ON providers(tin)
  WHERE tin IS NOT NULL;

COMMENT ON COLUMN providers.tin IS
  'Provider BIR Tax Identification Number in canonical 999-999-999-NNN format (NNN = branch code, typically 000 for sole proprietor). Required for BIR 2307 form generation. Nullable until provider supplies it; admin alerts on missing TIN at first BIR 2307 batch generation. MED-N20 fix.';
