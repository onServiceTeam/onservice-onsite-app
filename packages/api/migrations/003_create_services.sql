-- Migration: Create service categories and subcategories
-- All prices in centavos (₱500 = 50000)

CREATE TABLE service_categories (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    icon_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_slug ON service_categories(slug);
CREATE INDEX idx_categories_order ON service_categories(display_order);

CREATE TABLE service_subcategories (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'fixed'
        CHECK (pricing_type IN ('fixed', 'quote', 'hourly')),
    base_price INTEGER,                   -- in centavos
    min_price INTEGER,                    -- in centavos
    max_price INTEGER,                    -- in centavos
    estimated_duration_minutes INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(category_id, slug)
);

CREATE INDEX idx_subcategories_category ON service_subcategories(category_id);
CREATE INDEX idx_subcategories_slug ON service_subcategories(slug);
