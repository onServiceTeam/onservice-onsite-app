-- Phase 200 — auto-dispatch toggle.
--
-- When ON, a newly created fixed-price booking is immediately offered to the
-- best-ranked eligible (vetted, in-area) provider via the offer-cascade
-- engine (booking-offer.service), so jobs do not sit waiting for a provider
-- to notice and quote. When OFF, dispatch is manual (the customer or an admin
-- starts the offer cycle from the booking). Read by getSettingBoolean, so the
-- stored value must be 'true' / 'false'. Lives in the 'dispatch' category so
-- it appears next to the map settings on the admin Settings page.

INSERT INTO platform_settings (
    category, subcategory, key, label, description,
    value_type, value, default_value,
    display_order, is_active
)
VALUES
    (
        'dispatch', 'matching',
        'auto_dispatch_enabled',
        'Auto-dispatch new bookings',
        'When ON, a new fixed-price booking is automatically offered to the best-matched available provider in the service area (sequential offers with a timeout, falling through to the next provider). When OFF, dispatch is started manually from the booking. Quote-based job requests always use the quote flow regardless of this setting.',
        'boolean',
        'true',
        'true',
        110, TRUE
    )
ON CONFLICT (key) DO NOTHING;
