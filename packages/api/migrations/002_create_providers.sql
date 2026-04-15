-- Migration: Create providers table
-- Tier-based commission rates defined in platform.config.ts

CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tier VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (tier IN ('new', 'verified', 'pro', 'elite')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'suspended', 'deactivated')),
    nbi_clearance_url TEXT,
    nbi_expiry_date DATE,
    nbi_expiry_notified BOOLEAN NOT NULL DEFAULT FALSE,
    service_radius_km INTEGER NOT NULL DEFAULT 10,
    average_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    total_jobs_completed INTEGER NOT NULL DEFAULT 0,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    city VARCHAR(100),
    province VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_providers_user ON providers(user_id);
CREATE INDEX idx_providers_tier ON providers(tier);
CREATE INDEX idx_providers_status ON providers(status);
CREATE INDEX idx_providers_location ON providers(latitude, longitude);
CREATE INDEX idx_providers_rating ON providers(average_rating DESC);

-- Provider service areas (many-to-many with categories)
CREATE TABLE provider_services (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    category_id UUID NOT NULL,
    subcategory_id UUID,
    base_price INTEGER,       -- in centavos (₱)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_services_provider ON provider_services(provider_id);
CREATE INDEX idx_provider_services_category ON provider_services(category_id);
