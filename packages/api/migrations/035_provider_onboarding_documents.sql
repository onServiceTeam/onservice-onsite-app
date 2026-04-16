-- Migration: Add provider onboarding document columns
-- Required for HIGH-003 (provider application flow)

ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS government_id_front_url TEXT,
    ADD COLUMN IF NOT EXISTS government_id_back_url TEXT,
    ADD COLUMN IF NOT EXISTS selfie_url TEXT,
    ADD COLUMN IF NOT EXISTS ic_agreement_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Also ensure 'rejected' is a valid status (migration 029 may have added it)
-- The CHECK constraint from migration 002 needs to be replaced to include 'rejected'
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_status_check;
ALTER TABLE providers ADD CONSTRAINT providers_status_check
    CHECK (status IN ('pending', 'approved', 'suspended', 'deactivated', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_providers_status_pending ON providers(status) WHERE status = 'pending';
