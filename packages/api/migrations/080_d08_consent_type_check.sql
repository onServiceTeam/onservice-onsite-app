-- Phase 14 Dispatch 08 — Bug 117.
-- Add CHECK constraint to consent_records.consent_type to prevent typos.
-- Existing migration 057 intentionally omitted CHECK for "flexibility";
-- result: typos like 'priacy_policy' silently passed.

BEGIN;

-- Defensive: fix any existing typos before adding the constraint.
UPDATE consent_records
   SET consent_type = 'privacy_policy'
 WHERE consent_type IN ('priacy_policy', 'privecy_policy', 'privacy-policy');

UPDATE consent_records
   SET consent_type = 'terms_of_service'
 WHERE consent_type IN ('tos', 'terms-of-service', 'terms_service');

UPDATE consent_records
   SET consent_type = 'marketing_consent'
 WHERE consent_type IN ('marketing', 'marketing-consent');

ALTER TABLE consent_records
    ADD CONSTRAINT consent_records_type_valid CHECK (
        consent_type IN (
            'privacy_policy',
            'terms_of_service',
            'marketing_consent',
            'ic_agreement',
            'cookie_policy',
            'data_processing',
            'biometric_consent'
        )
    );

COMMENT ON CONSTRAINT consent_records_type_valid ON consent_records IS
    'Adding new types: 1) audit existing rows for typos 2) DROP CONSTRAINT 3) ALTER ADD with new value 4) re-ADD CONSTRAINT.';

COMMIT;
