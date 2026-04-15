-- Migration: Enhance reviews with subcategory ratings + provider response (FR-150/151)

ALTER TABLE reviews
    ADD COLUMN quality_rating SMALLINT CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
    ADD COLUMN punctuality_rating SMALLINT CHECK (punctuality_rating IS NULL OR (punctuality_rating >= 1 AND punctuality_rating <= 5)),
    ADD COLUMN professionalism_rating SMALLINT CHECK (professionalism_rating IS NULL OR (professionalism_rating >= 1 AND professionalism_rating <= 5)),
    ADD COLUMN communication_rating SMALLINT CHECK (communication_rating IS NULL OR (communication_rating >= 1 AND communication_rating <= 5)),
    ADD COLUMN value_rating SMALLINT CHECK (value_rating IS NULL OR (value_rating >= 1 AND value_rating <= 5)),
    ADD COLUMN provider_response TEXT,
    ADD COLUMN provider_response_at TIMESTAMPTZ,
    ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT FALSE;
