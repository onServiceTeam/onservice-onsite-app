-- Migration 140 — D27 Phase 2: per-category structured intake fields.
--
-- Custom-quote requests currently capture only a free-text description + photos.
-- This lets admins define typed intake questions per subcategory (measurements,
-- color codes, brand, "do you already have the part", choices, etc.) so the
-- customer's job request carries structured detail and providers can quote
-- accurately. Answers are stored as JSONB on the booking; nothing about the
-- existing fixed-price or free-text flows changes (the engine is additive).

CREATE TABLE IF NOT EXISTS subcategory_intake_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subcategory_id UUID NOT NULL REFERENCES service_subcategories(id) ON DELETE CASCADE,
    -- Stable machine key used in the booking.intake_answers JSONB.
    field_key VARCHAR(60) NOT NULL,
    label VARCHAR(120) NOT NULL,
    help_text VARCHAR(200),
    field_type VARCHAR(20) NOT NULL
        CHECK (field_type IN ('number', 'text', 'choice', 'boolean')),
    -- For 'number': unit label shown after the input (e.g. 'sqm', 'm', 'pcs').
    unit VARCHAR(30),
    -- For 'choice': the selectable options as a JSON array of strings.
    options JSONB,
    placeholder VARCHAR(160),
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One field_key per subcategory.
    UNIQUE (subcategory_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_intake_fields_subcat_active
    ON subcategory_intake_fields(subcategory_id, sort_order)
    WHERE is_active = TRUE;

-- Customer's structured answers for a job request, keyed by field_key.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS intake_answers JSONB;
