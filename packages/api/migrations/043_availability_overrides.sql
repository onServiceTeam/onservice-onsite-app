-- Provider date-specific availability overrides
-- Supports US-P008: block specific dates/times, vacation mode

CREATE TABLE IF NOT EXISTS provider_availability_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT FALSE,
    start_time TIME,
    end_time TIME,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_availability_overrides_lookup
    ON provider_availability_overrides (provider_id, override_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_availability_overrides_unique
    ON provider_availability_overrides (provider_id, override_date)
    WHERE start_time IS NULL AND end_time IS NULL;
