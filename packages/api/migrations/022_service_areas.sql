-- Phase 5: Geographic Expansion — Multi-Municipality Support
-- Manages which cities/municipalities the platform operates in
-- Supports launch planning, provider density tracking, and customer waitlists

CREATE TABLE service_areas (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL,
    zip_codes TEXT[] NOT NULL DEFAULT '{}',

    center_lat DECIMAL(10,8) NOT NULL,
    center_lng DECIMAL(11,8) NOT NULL,
    radius_km INTEGER NOT NULL DEFAULT 15,

    status VARCHAR(20) NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired')),

    launch_date DATE,
    launched_at TIMESTAMPTZ,

    min_providers_to_launch INTEGER NOT NULL DEFAULT 5,
    active_provider_count INTEGER NOT NULL DEFAULT 0,
    active_customer_count INTEGER NOT NULL DEFAULT 0,
    total_bookings INTEGER NOT NULL DEFAULT 0,

    settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_areas_status ON service_areas(status) WHERE status IN ('active', 'soft_launch');
CREATE INDEX idx_service_areas_slug ON service_areas(slug);
CREATE INDEX idx_service_areas_location ON service_areas(center_lat, center_lng);
CREATE INDEX idx_service_areas_city ON service_areas(city, province);

-- Waitlist for customers in areas not yet served
CREATE TABLE area_waitlist (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    barangay VARCHAR(100),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    service_area_id UUID REFERENCES service_areas(id),
    notified BOOLEAN NOT NULL DEFAULT FALSE,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(phone, city)
);

CREATE INDEX idx_area_waitlist_city ON area_waitlist(city, province);
CREATE INDEX idx_area_waitlist_service_area ON area_waitlist(service_area_id) WHERE service_area_id IS NOT NULL;
CREATE INDEX idx_area_waitlist_notified ON area_waitlist(notified) WHERE notified = FALSE;

-- Link providers to the service areas they operate in
CREATE TABLE provider_service_areas (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    service_area_id UUID NOT NULL REFERENCES service_areas(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, service_area_id)
);

CREATE INDEX idx_provider_service_areas_provider ON provider_service_areas(provider_id);
CREATE INDEX idx_provider_service_areas_area ON provider_service_areas(service_area_id);
