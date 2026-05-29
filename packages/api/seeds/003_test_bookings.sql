-- Seed: Test bookings with various statuses
-- All prices in centavos, Philippine addresses, Philippine time

-- Active booking: General Cleaning in Makati (confirmed/paid)
INSERT INTO bookings (
  customer_id, provider_id, category_id, subcategory_id,
  booking_type, status, escrow_status,
  service_price, service_fee, total_amount,
  description, address, barangay, city, province,
  latitude, longitude, scheduled_at
)
SELECT
  c.id, p.id, cat.id, sub.id,
  'fixed_price', 'paid', 'held',
  150000, 7500, 157500,
  'Regular cleaning for 3-bedroom condo unit. Please bring own supplies.',
  'Maguikay, near A.S. Fortuna St', 'Maguikay', 'Mandaue', 'Cebu',
  10.3236, 123.9223, NOW() + INTERVAL '2 days'
FROM users c, providers p, service_categories cat, service_subcategories sub
WHERE c.phone = '+639171234567'
  AND p.user_id = (SELECT id FROM users WHERE phone = '+639231234567')
  AND cat.slug = 'cleaning'
  AND sub.slug = 'general-cleaning'
LIMIT 1;

-- Quote-based booking: Cabinet making in QC (requested)
INSERT INTO bookings (
  customer_id, category_id, subcategory_id,
  booking_type, status,
  service_price, service_fee, total_amount,
  description, address, barangay, city, province,
  latitude, longitude, scheduled_at
)
SELECT
  c.id, cat.id, sub.id,
  'quote_based', 'requested',
  0, 0, 0,
  'Need custom kitchen cabinets for newly renovated kitchen. L-shaped layout, approximately 4 meters total.',
  'Banilad, near Gov. M. Cuenco Ave', 'Banilad', 'Cebu City', 'Cebu',
  10.3380, 123.9120, NOW() + INTERVAL '7 days'
FROM users c, service_categories cat, service_subcategories sub
WHERE c.phone = '+639181234567'
  AND cat.slug = 'carpentry'
  AND sub.slug = 'cabinet-making'
LIMIT 1;

-- Completed booking: Plumbing in Cebu City (completed, awaiting confirmation)
INSERT INTO bookings (
  customer_id, provider_id, category_id, subcategory_id,
  booking_type, status, escrow_status,
  service_price, service_fee, total_amount,
  description, address, barangay, city, province,
  latitude, longitude, scheduled_at, completed_at
)
SELECT
  c.id, p.id, cat.id, sub.id,
  'fixed_price', 'completed_by_provider', 'held',
  50000, 2500, 52500,
  'Leaking faucet in kitchen. Dripping for 2 days.',
  'Lahug, near Cebu IT Park', 'Lahug', 'Cebu City', 'Cebu',
  10.3270, 123.9060, NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 hours'
FROM users c, providers p, service_categories cat, service_subcategories sub
WHERE c.phone = '+639191234567'
  AND p.user_id = (SELECT id FROM users WHERE phone = '+639221234567')
  AND cat.slug = 'plumbing'
  AND sub.slug = 'faucet-repair'
LIMIT 1;

-- Cancelled booking
INSERT INTO bookings (
  customer_id, category_id,
  booking_type, status,
  service_price, service_fee, total_amount,
  description, address, barangay, city, province,
  scheduled_at, cancelled_at, cancellation_reason
)
SELECT
  c.id, cat.id,
  'fixed_price', 'cancelled_by_customer',
  65000, 3250, 68250,
  'Aircon cleaning for 2 split-type units.',
  'Pajo, near Mactan Newtown', 'Pajo', 'Lapu-Lapu', 'Cebu',
  NOW() + INTERVAL '3 days', NOW() - INTERVAL '6 hours',
  'Schedule conflict — will rebook next week.'
FROM users c, service_categories cat
WHERE c.phone = '+639201234567'
  AND cat.slug = 'aircon'
LIMIT 1;
