-- Phase 200 — Dispatch console map tile configuration.
--
-- The dispatch console renders a Leaflet map of live bookings + online
-- providers. The map tile source is now admin-configurable so an operator
-- can point it at a production tile provider (MapTiler / Mapbox / Stadia)
-- without a code change. Defaults to OpenStreetMap, which needs no API key
-- and works out of the box.
--
-- These are NOT marked is_sensitive: a web-map tile token is a *publishable*
-- client credential (it ships to the browser by design and is locked down
-- by HTTP-referrer / domain restrictions at the provider). Marking it
-- sensitive would make formatSetting redact it to bullets, and the admin
-- map could no longer read it to build the tile URL.
--
-- map_tile_url may contain the literal placeholder {apiKey}; when
-- map_tile_api_key is non-empty the admin app substitutes it in. OSM's
-- default URL has no placeholder, so the key is simply ignored until set.

INSERT INTO platform_settings (
    category, subcategory, key, label, description,
    value_type, value, default_value,
    display_order, is_active
)
VALUES
    (
        'dispatch', 'map',
        'map_tile_url',
        'Map tile URL template',
        'Leaflet XYZ tile URL template for the dispatch map. Supports {s}{z}{x}{y} and an optional {apiKey} placeholder. Default is OpenStreetMap (no key needed). For production tiles paste your provider URL, e.g. https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key={apiKey}',
        'string',
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        100, TRUE
    ),
    (
        'dispatch', 'map',
        'map_tile_attribution',
        'Map attribution',
        'Attribution HTML shown in the corner of the dispatch map. Must credit your tile provider per their license.',
        'string',
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        101, TRUE
    ),
    (
        'dispatch', 'map',
        'map_tile_api_key',
        'Map tile API key',
        'Optional publishable tile-provider API key. Substituted into the {apiKey} placeholder in the tile URL. Leave blank for OpenStreetMap. This is a client-side (publishable) token, not a server secret — restrict it by domain at your provider.',
        'string',
        '',
        '',
        102, TRUE
    )
ON CONFLICT (key) DO NOTHING;
