-- Phase 200 — Metro Cebu launch market.
--
-- onService launches in Metro Cebu (Central Visayas, Region VII). These four
-- cities are the launch service areas. Seeded as 'active' so the local/demo
-- environment can take bookings across the metro. In production the admin
-- sets real status (recruiting -> soft_launch -> active) per city as provider
-- supply comes online. Idempotent via the unique slug.

INSERT INTO service_areas (name, slug, city, province, region, center_lat, center_lng, radius_km, status, min_providers_to_launch)
VALUES
  ('Cebu City',  'cebu-city',  'Cebu City',  'Cebu', 'Central Visayas', 10.31570000, 123.88540000, 15, 'active', 5),
  ('Mandaue',    'mandaue',    'Mandaue',    'Cebu', 'Central Visayas', 10.32360000, 123.92230000, 12, 'active', 5),
  ('Lapu-Lapu',  'lapu-lapu',  'Lapu-Lapu',  'Cebu', 'Central Visayas', 10.31030000, 123.94940000, 12, 'active', 5),
  ('Talisay',    'talisay',    'Talisay',    'Cebu', 'Central Visayas', 10.24470000, 123.84940000, 12, 'soft_launch', 5)
ON CONFLICT (slug) DO NOTHING;
