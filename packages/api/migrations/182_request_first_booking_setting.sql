-- Migration 182: request-first booking switch (D38, Ken 2026-10-13).
--
-- Ken's human-audit notes: two jobs under the same service rarely cost the
-- same, so every service starts with the customer describing the job and a
-- provider sends the price. This row is the admin switch for that flow.
--
--   true  (default): the customer app sends every service to "describe your
--         job".
--   false: the fixed-price catalog flow is restored in the app. Only quote,
--         per_unit and unpriced services open the request form, exactly as
--         the app routed them before D38.
--
-- Either way POST /api/v1/bookings/job-request accepts a request for any
-- active service (fixed, quote, per_unit, hourly), as the server did before
-- D38, so an app still holding the old config value is never refused.
--
-- Published to the apps as `requestFirstBooking` in GET /api/v1/config
-- (settingsService.getClientConfig). Stored as 'true' /
-- 'false' (value_type boolean is validated on every admin save). It sits in
-- the 'provider' category next to the quote settings (quote_expiry_hours is
-- display_order 4, max_quotes_per_booking is 5). SETTING_DEFAULTS in
-- settings.service.ts carries the same key and default, so the boot-time
-- drift check stays clean.
--
-- Additive only. ON CONFLICT DO NOTHING keeps an operator's chosen value if
-- the row already exists. No catalog or booking data is rewritten.

INSERT INTO platform_settings (
    category, subcategory, key, label, description,
    value_type, value, default_value,
    display_order, is_active
)
VALUES
    (
        'provider', 'quotes',
        'request_first_booking',
        'Request-first booking',
        'When on, every service starts with the customer describing the job and a provider sends the price (D38). Turn off to restore the fixed-price catalog flow.',
        'boolean',
        'true',
        'true',
        6, TRUE
    )
ON CONFLICT (key) DO NOTHING;
