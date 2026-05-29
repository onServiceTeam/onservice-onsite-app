-- Phase 200 — Cebu launch catalog tuning.
-- Runs after 001_categories.sql. All prices in centavos (₱ = value / 100).
-- Two things:
--   1. Window-type aircon cleaning to the Metro Cebu market norm (~₱350;
--      Cebu runs well below Manila). UPDATE so existing dev DBs also adjust.
--   2. Fill the Appliance Repair category, which shipped as an empty heading
--      with no bookable sub-services. Appliance repair is a recommended
--      launch service (same technician pool as aircon). INSERT is idempotent.

-- 1. Cebu-accurate window aircon cleaning price.
UPDATE service_subcategories AS s
SET base_price = 35000, min_price = 30000, max_price = 50000, updated_at = NOW()
FROM service_categories c
WHERE s.category_id = c.id AND c.slug = 'aircon' AND s.slug = 'aircon-clean-window';

-- 2. Appliance Repair sub-services (mostly quote-based: diagnose first).
INSERT INTO service_subcategories (category_id, name, slug, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
SELECT c.id, sub.name, sub.slug, sub.pricing_type, sub.base_price, sub.min_price, sub.max_price, sub.duration, sub.display_order
FROM service_categories c
CROSS JOIN (VALUES
  ('Refrigerator Repair', 'ref-repair', 'quote', NULL, 80000, 500000, 90, 1),
  ('Washing Machine Repair', 'washer-repair', 'quote', NULL, 80000, 400000, 90, 2),
  ('TV Repair', 'tv-repair', 'quote', NULL, 60000, 400000, 90, 3),
  ('Microwave / Oven Repair', 'microwave-repair', 'quote', NULL, 60000, 300000, 60, 4),
  ('Appliance Diagnosis / Service Call', 'appliance-diagnosis', 'fixed', 50000, 35000, 80000, 45, 5)
) AS sub(name, slug, pricing_type, base_price, min_price, max_price, duration, display_order)
WHERE c.slug = 'appliance-repair'
ON CONFLICT (category_id, slug) DO NOTHING;
