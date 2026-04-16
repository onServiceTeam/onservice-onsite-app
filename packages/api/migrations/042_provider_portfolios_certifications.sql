-- Provider portfolio photos and certifications tables
-- Supports US-C008 (customer-facing) and US-P003 (provider profile setup)

CREATE TABLE IF NOT EXISTS provider_portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT,
    category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_portfolios_provider
    ON provider_portfolios (provider_id, is_active, display_order);

CREATE TABLE IF NOT EXISTS provider_certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    issuing_body TEXT NOT NULL DEFAULT 'TESDA',
    certificate_number TEXT,
    certificate_url TEXT,
    issued_date DATE,
    expiry_date DATE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_certifications_provider
    ON provider_certifications (provider_id, is_active);
