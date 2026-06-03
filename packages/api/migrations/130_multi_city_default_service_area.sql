-- Multi-city support — mark exactly one service area as the app's default.
--
-- The platform is city-agnostic: cities live in service_areas and are managed
-- in the admin "Service Areas" page. The mobile apps need to know which area
-- to center the map on and default address/service-area pickers to BEFORE the
-- user has picked a location. Rather than hardcode Cebu coordinates in the
-- client (the old behavior), the client reads the default area from the API.
--
-- Exactly one area can be the default at a time (enforced by the partial
-- unique index). Admins switch the default from the Service Areas page.
-- Seeded to Cebu City (the current launch market); falls back to the earliest
-- active area if the cebu-city slug is absent, so this is safe on any dataset.

ALTER TABLE service_areas
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one default area.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_areas_one_default
    ON service_areas (is_default) WHERE is_default = TRUE;

-- Seed the default exactly once: prefer cebu-city, else the earliest active
-- area, and only if no default is already set.
UPDATE service_areas
SET is_default = TRUE
WHERE id = (
    SELECT id FROM service_areas
    ORDER BY
        (slug = 'cebu-city') DESC,
        (status IN ('active', 'soft_launch')) DESC,
        created_at ASC
    LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM service_areas WHERE is_default = TRUE);
