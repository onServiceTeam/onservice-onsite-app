-- Seed: Test users and providers with Philippine data
-- All phone numbers use +63 format, addresses are real Philippine locations

-- Test customers
INSERT INTO users (phone, first_name, last_name, email, role, is_verified) VALUES
  ('+639171234567', 'Maria', 'Santos', 'maria.santos@test.ph', 'customer', TRUE),
  ('+639181234567', 'Juan', 'Dela Cruz', 'juan.delacruz@test.ph', 'customer', TRUE),
  ('+639191234567', 'Anna', 'Reyes', 'anna.reyes@test.ph', 'customer', TRUE),
  ('+639201234567', 'Paolo', 'Garcia', 'paolo.garcia@test.ph', 'customer', TRUE),
  ('+639211234567', 'Rica', 'Mercado', 'rica.mercado@test.ph', 'customer', TRUE)
ON CONFLICT (phone) DO NOTHING;

-- Test providers (create user accounts first)
INSERT INTO users (phone, first_name, last_name, email, role, is_verified) VALUES
  ('+639221234567', 'Roberto', 'Villanueva', 'roberto.v@test.ph', 'provider', TRUE),
  ('+639231234567', 'Elena', 'Fernandez', 'elena.f@test.ph', 'provider', TRUE),
  ('+639241234567', 'Mark', 'Aquino', 'mark.a@test.ph', 'provider', TRUE),
  ('+639251234567', 'Jasmine', 'Cruz', 'jasmine.c@test.ph', 'provider', TRUE),
  ('+639261234567', 'Dennis', 'Ramos', 'dennis.r@test.ph', 'provider', TRUE)
ON CONFLICT (phone) DO NOTHING;

-- Admin user
INSERT INTO users (phone, first_name, last_name, email, role, is_verified) VALUES
  ('+639271234567', 'Admin', 'OnService', 'admin@onservice.ph', 'admin', TRUE),
  ('+639281234567', 'Super', 'Admin', 'superadmin@onservice.ph', 'super_admin', TRUE)
ON CONFLICT (phone) DO NOTHING;

-- Provider profiles (linked to provider user accounts)
INSERT INTO providers (user_id, business_name, description, tier, status, service_radius_km, rating, total_reviews, total_jobs, latitude, longitude, city, province)
SELECT u.id, p.business_name, p.description, p.tier, p.status, p.radius, p.rating, p.reviews, p.jobs, p.lat, p.lng, p.city, p.province
FROM users u
CROSS JOIN (VALUES
  -- Phase 200 — demo providers relocated to Metro Cebu (the launch market) so
  -- a Cebu booking matches them and auto-dispatch works in the live test.
  ('+639221234567', 'Roberto''s Plumbing Services', 'Licensed plumber with 10+ years experience in Metro Cebu. Specializing in residential plumbing.', 'verified', 'approved', 15, 4.80, 47, 52, 10.3157, 123.8854, 'Cebu City', 'Cebu'),
  ('+639231234567', 'Elena''s Cleaning Co.', 'Professional cleaning service team. Deep cleaning, move-in/out, and regular maintenance.', 'pro', 'approved', 20, 4.92, 128, 135, 10.3236, 123.9223, 'Mandaue', 'Cebu'),
  ('+639241234567', 'Aquino Electrical Works', 'Master electrician. Commercial and residential wiring, repair, and installation.', 'verified', 'approved', 25, 4.65, 33, 38, 10.3103, 123.9494, 'Lapu-Lapu', 'Cebu'),
  ('+639251234567', 'Jasmine Aircon Services', 'Certified aircon technician. All brands — split type, window, and central systems.', 'new', 'approved', 10, 4.50, 12, 15, 10.3270, 123.9060, 'Cebu City', 'Cebu'),
  ('+639261234567', 'Ramos Carpentry & Woodworks', 'Custom furniture, cabinets, and home repair. Quality craftsmanship guaranteed.', 'elite', 'approved', 30, 4.95, 210, 225, 10.2447, 123.8494, 'Talisay', 'Cebu')
) AS p(phone, business_name, description, tier, status, radius, rating, reviews, jobs, lat, lng, city, province)
WHERE u.phone = p.phone
ON CONFLICT (user_id) DO NOTHING;

-- Create wallets for all users (conflict target uses partial unique index on user_id)
INSERT INTO wallets (user_id, type)
SELECT id, 'customer' FROM users WHERE role = 'customer'
ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO NOTHING;

INSERT INTO wallets (user_id, type)
SELECT id, 'provider' FROM users WHERE role = 'provider'
ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO NOTHING;
