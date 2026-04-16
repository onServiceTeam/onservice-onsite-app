-- Migration: Add quick-select tags and private note to reviews (UX-012, UX-015)
-- tags: array of quick-tap feedback chips (e.g. 'professional', 'punctual', 'great_value')
-- private_note: platform-only private feedback, never shown publicly

ALTER TABLE reviews
    ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN private_note TEXT;

COMMENT ON COLUMN reviews.tags IS 'Quick-select positive feedback tags chosen by customer (e.g. professional, punctual, great_value, friendly, clean)';
COMMENT ON COLUMN reviews.private_note IS 'Private feedback to platform — never displayed publicly to provider or other customers';
