-- 004_provider_services.sql — Phase 200
-- Give each demo provider the set of services in their category, so their
-- profile lists bookable services, the customer "book a service" flow works,
-- and the dispatch matcher can actually find them (matching requires an active
-- provider_services row). Pre-fix only one provider had any services, so the
-- others could never be matched or booked. Idempotent via ON CONFLICT.
INSERT INTO provider_services (provider_id, subcategory_id, category_id, base_price, is_active)
SELECT m.provider_id, sc.id, sc.category_id,
       sc.min_price + (sc.max_price - sc.min_price) / 4, TRUE
FROM (VALUES
  ('247ede15-20d5-4154-808b-25c43a1e246f'::uuid, 'aircon'),      -- Jasmine
  ('619a898a-db6b-4038-8c79-59d629e0de3c'::uuid, 'electrical'),  -- Aquino
  ('ceb7431d-88e4-417a-b117-fc0d5e01dfef'::uuid, 'plumbing'),    -- Roberto
  ('0cd9e012-257a-4f02-982b-f2df9e07d2e0'::uuid, 'cleaning'),    -- Elena
  ('e503c40c-7fcc-453b-90b7-bb3fe3a0a731'::uuid, 'carpentry')    -- Ramos
) AS m(provider_id, slug)
JOIN service_categories c ON c.slug = m.slug
JOIN service_subcategories sc ON sc.category_id = c.id AND sc.is_active
ON CONFLICT (provider_id, subcategory_id)
  DO UPDATE SET is_active = TRUE, base_price = EXCLUDED.base_price;
