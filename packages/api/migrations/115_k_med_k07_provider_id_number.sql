-- Phase K MED-K07 fix — capture providers.government_id_number during
-- onboarding. Pre-fix: the providers table tracked the government ID
-- IMAGE (government_id_front_url + government_id_back_url) but not
-- the ID number itself. Admins reviewing applications had to OCR the
-- image to verify against NBI rolls / SSS / etc. This column lets the
-- provider type the number once during onboarding and the admin
-- review tooling shows it next to the image.
--
-- Optional + free-text by design. Different ID types have different
-- formats (passport: alphanumeric 9 chars; UMID: 12 digits; PRC:
-- variable). Validating shape per ID type is admin-side responsibility.

BEGIN;

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS government_id_number TEXT;

-- Same K07 audit context covers nbi_expiry_date — that column already
-- exists since migration 002, so no DDL change needed for it. The
-- mobile + validator layers added in this same fix wave allow the
-- column to be populated at application time instead of admin-backfill
-- time.

COMMIT;
