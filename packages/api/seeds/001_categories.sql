-- Seed: Service categories and subcategories
-- Philippine home services market — all prices in centavos (₱)

INSERT INTO service_categories (name, slug, description, display_order) VALUES
  ('Cleaning', 'cleaning', 'Professional home and office cleaning services', 1),
  ('Plumbing', 'plumbing', 'Pipe repair, installation, and maintenance', 2),
  ('Electrical', 'electrical', 'Wiring, repair, and electrical installations', 3),
  ('Aircon Services', 'aircon', 'Aircon cleaning, repair, and installation', 4),
  ('Carpentry', 'carpentry', 'Furniture repair, cabinets, and woodwork', 5),
  ('Painting', 'painting', 'Interior and exterior house painting', 6),
  ('Pest Control', 'pest-control', 'Termite treatment, general pest control', 7),
  ('Appliance Repair', 'appliance-repair', 'Washing machine, ref, TV, and appliance repair', 8),
  ('Roofing', 'roofing', 'Roof repair, waterproofing, and installation', 9),
  ('Landscaping', 'landscaping', 'Garden maintenance, lawn care, and landscaping', 10)
ON CONFLICT (slug) DO NOTHING;

-- Cleaning subcategories
INSERT INTO service_subcategories (category_id, name, slug, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
SELECT c.id, sub.name, sub.slug, sub.pricing_type, sub.base_price, sub.min_price, sub.max_price, sub.duration, sub.display_order
FROM service_categories c
CROSS JOIN (VALUES
  ('General Cleaning', 'general-cleaning', 'fixed', 150000, 100000, 300000, 180, 1),
  ('Deep Cleaning', 'deep-cleaning', 'fixed', 300000, 200000, 500000, 360, 2),
  ('Move-in/Move-out Cleaning', 'move-cleaning', 'quote', NULL, 250000, 800000, 480, 3),
  ('Office Cleaning', 'office-cleaning', 'quote', NULL, 200000, 1000000, 240, 4),
  ('Post-Construction Cleaning', 'post-construction', 'quote', NULL, 500000, 2000000, 480, 5)
) AS sub(name, slug, pricing_type, base_price, min_price, max_price, duration, display_order)
WHERE c.slug = 'cleaning'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Plumbing subcategories
INSERT INTO service_subcategories (category_id, name, slug, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
SELECT c.id, sub.name, sub.slug, sub.pricing_type, sub.base_price, sub.min_price, sub.max_price, sub.duration, sub.display_order
FROM service_categories c
CROSS JOIN (VALUES
  ('Faucet Repair', 'faucet-repair', 'fixed', 50000, 30000, 100000, 60, 1),
  ('Pipe Repair', 'pipe-repair', 'fixed', 80000, 50000, 200000, 90, 2),
  ('Toilet Repair', 'toilet-repair', 'fixed', 60000, 40000, 150000, 60, 3),
  ('Water Heater Install', 'water-heater', 'fixed', 150000, 100000, 300000, 120, 4),
  ('Septic Tank Service', 'septic-tank', 'quote', NULL, 300000, 1000000, 240, 5)
) AS sub(name, slug, pricing_type, base_price, min_price, max_price, duration, display_order)
WHERE c.slug = 'plumbing'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Electrical subcategories
INSERT INTO service_subcategories (category_id, name, slug, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
SELECT c.id, sub.name, sub.slug, sub.pricing_type, sub.base_price, sub.min_price, sub.max_price, sub.duration, sub.display_order
FROM service_categories c
CROSS JOIN (VALUES
  ('Outlet/Switch Repair', 'outlet-repair', 'fixed', 40000, 25000, 80000, 45, 1),
  ('Lighting Installation', 'lighting-install', 'fixed', 60000, 30000, 150000, 60, 2),
  ('Breaker Box Repair', 'breaker-repair', 'fixed', 100000, 60000, 250000, 90, 3),
  ('Full House Rewiring', 'rewiring', 'quote', NULL, 500000, 5000000, 480, 4),
  ('Generator Installation', 'generator', 'quote', NULL, 300000, 2000000, 240, 5)
) AS sub(name, slug, pricing_type, base_price, min_price, max_price, duration, display_order)
WHERE c.slug = 'electrical'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Aircon subcategories
INSERT INTO service_subcategories (category_id, name, slug, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
SELECT c.id, sub.name, sub.slug, sub.pricing_type, sub.base_price, sub.min_price, sub.max_price, sub.duration, sub.display_order
FROM service_categories c
CROSS JOIN (VALUES
  ('Aircon Cleaning (Window)', 'aircon-clean-window', 'fixed', 45000, 35000, 60000, 60, 1),
  ('Aircon Cleaning (Split)', 'aircon-clean-split', 'fixed', 65000, 50000, 80000, 90, 2),
  ('Aircon Repair', 'aircon-repair', 'quote', NULL, 80000, 500000, 120, 3),
  ('Aircon Installation', 'aircon-install', 'fixed', 250000, 150000, 500000, 180, 4),
  ('Freon Recharge', 'freon-recharge', 'fixed', 150000, 100000, 300000, 60, 5)
) AS sub(name, slug, pricing_type, base_price, min_price, max_price, duration, display_order)
WHERE c.slug = 'aircon'
ON CONFLICT (category_id, slug) DO NOTHING;

-- Carpentry subcategories
INSERT INTO service_subcategories (category_id, name, slug, pricing_type, base_price, min_price, max_price, estimated_duration_minutes, display_order)
SELECT c.id, sub.name, sub.slug, sub.pricing_type, sub.base_price, sub.min_price, sub.max_price, sub.duration, sub.display_order
FROM service_categories c
CROSS JOIN (VALUES
  ('Door Repair', 'door-repair', 'fixed', 80000, 50000, 200000, 90, 1),
  ('Cabinet Making', 'cabinet-making', 'quote', NULL, 500000, 5000000, 480, 2),
  ('Furniture Assembly', 'furniture-assembly', 'fixed', 60000, 40000, 150000, 120, 3),
  ('Shelf Installation', 'shelf-install', 'fixed', 50000, 30000, 100000, 60, 4)
) AS sub(name, slug, pricing_type, base_price, min_price, max_price, duration, display_order)
WHERE c.slug = 'carpentry'
ON CONFLICT (category_id, slug) DO NOTHING;
