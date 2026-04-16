-- Migration 040: Service add-ons / configurator options
-- Supports fixed-price add-ons for any subcategory (US-C010, §3.1 #8)

CREATE TABLE IF NOT EXISTS service_addons (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subcategory_id  UUID NOT NULL REFERENCES service_subcategories(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT DEFAULT '',
    price           INTEGER NOT NULL DEFAULT 0,       -- centavos
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_addons_subcategory ON service_addons(subcategory_id);

-- Track which add-ons a customer selected for a booking
CREATE TABLE IF NOT EXISTS booking_addons (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    addon_id    UUID NOT NULL REFERENCES service_addons(id) ON DELETE SET NULL,
    name        VARCHAR(150) NOT NULL,
    price       INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_addons_booking ON booking_addons(booking_id);

-- Seed sample add-ons for common services
INSERT INTO service_addons (subcategory_id, name, description, price, display_order)
SELECT sc.id, 'Extra Bathroom', 'Clean one additional bathroom', 15000, 1
FROM service_subcategories sc WHERE sc.slug = 'general-cleaning' AND sc.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO service_addons (subcategory_id, name, description, price, display_order)
SELECT sc.id, 'Deep Clean Kitchen', 'Thorough degrease and sanitize kitchen', 25000, 2
FROM service_subcategories sc WHERE sc.slug = 'general-cleaning' AND sc.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO service_addons (subcategory_id, name, description, price, display_order)
SELECT sc.id, 'Window Cleaning (per room)', 'Interior window cleaning per room', 10000, 3
FROM service_subcategories sc WHERE sc.slug = 'general-cleaning' AND sc.is_active = TRUE
ON CONFLICT DO NOTHING;
