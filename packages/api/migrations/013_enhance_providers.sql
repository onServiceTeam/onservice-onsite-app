-- Migration: Enhance providers table with profile fields + fix provider_services
-- Adds columns referenced by provider.service.ts that are missing from the original schema

-- Add missing provider profile columns
ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS years_experience INTEGER CHECK (years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 60)),
    ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS acceptance_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS response_time_minutes INTEGER;

-- Rename columns for consistency with service layer
-- average_rating → rating (used throughout provider.service.ts and review.service.ts)
ALTER TABLE providers RENAME COLUMN average_rating TO rating;

-- total_jobs_completed → total_jobs (used in provider.service.ts ProviderRow)
ALTER TABLE providers RENAME COLUMN total_jobs_completed TO total_jobs;

CREATE INDEX IF NOT EXISTS idx_providers_available ON providers(is_available) WHERE is_available = TRUE;

-- Fix provider_services: make category_id nullable (derived from subcategory on insert)
-- and add unique constraint for ON CONFLICT clause
ALTER TABLE provider_services ALTER COLUMN category_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_services_unique
    ON provider_services(provider_id, subcategory_id);
