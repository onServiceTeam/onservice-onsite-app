-- 003_demo_history.sql — Phase 200
-- Realistic historical bookings + reviews so the provider Jobs/Reviews screens
-- and dashboard stats are POPULATED and CONSISTENT (pre-fix the providers had
-- seeded rating/total_jobs/total_reviews columns but ZERO actual bookings or
-- reviews, so the dashboard said "135 jobs / 4.9 stars" while the Jobs and
-- Reviews tabs were empty). This generates real rows, then recomputes the
-- provider stat columns FROM those rows so the numbers match what the screens
-- show. Idempotent: it deletes its own '[demo]' rows first, so it can be re-run.
DO $$
DECLARE
  provs uuid[] := ARRAY[
    '247ede15-20d5-4154-808b-25c43a1e246f',  -- Jasmine Aircon
    '619a898a-db6b-4038-8c79-59d629e0de3c',  -- Aquino Electrical
    'ceb7431d-88e4-417a-b117-fc0d5e01dfef',  -- Roberto Plumbing
    '0cd9e012-257a-4f02-982b-f2df9e07d2e0',  -- Elena Cleaning
    'e503c40c-7fcc-453b-90b7-bb3fe3a0a731'   -- Ramos Carpentry
  ]::uuid[];
  cats uuid[] := ARRAY[
    '0d3aeba1-431d-4dbd-8f78-7610012d3870',  -- aircon
    '62aab12c-bf4b-4932-992f-2b30b9fc2b1b',  -- electrical
    '96d8a66f-3c32-4b7d-b4a9-68c3602dba38',  -- plumbing
    'c8582d19-a64f-4a5e-8a41-24b284622685',  -- cleaning
    '8627b146-4e58-44da-84e0-8693cb84b631'   -- carpentry
  ]::uuid[];
  prices int[] := ARRAY[200000, 180000, 160000, 150000, 250000];  -- centavos
  ncomp  int[] := ARRAY[12, 18, 22, 30, 28];                       -- completed jobs each
  custs uuid[] := ARRAY[
    '1ba65743-9763-43f4-9b9d-b1aa63fa4c36',  -- Maria
    '93da3d8c-e55f-461d-8fc4-ccb9d184da7f',  -- Juan
    '4c92966b-ac33-4b07-8906-0c4c0d1beb37',  -- Anna
    '2ee96e4a-eec5-4754-a4a5-788e04c11305',  -- Paolo
    '912e58a6-bd40-4331-a6af-c1d01be17379'   -- Rica
  ]::uuid[];
  comments text[] := ARRAY[
    'On time, professional, and did a thorough job. Highly recommended.',
    'Great work and very polite. Will book again.',
    'Solved the problem quickly and cleaned up after. Thank you!',
    'Good service overall, arrived a little late but the work was excellent.',
    'Friendly and skilled. Fair price for the quality.'
  ];
  i int; j int; bid uuid; cust uuid; r int; sp int; sf int; daysago int;
BEGIN
  DELETE FROM reviews WHERE comment LIKE '[demo]%';
  DELETE FROM bookings WHERE description LIKE '[demo]%';

  FOR i IN 1..array_length(provs,1) LOOP
    -- Completed (paid_out) jobs with reviews
    FOR j IN 1..ncomp[i] LOOP
      cust := custs[1 + (j % array_length(custs,1))];
      sp := prices[i] + (j % 3) * 25000;
      sf := round(sp * 0.10);
      daysago := j * 4 + i * 3;
      INSERT INTO bookings(
        customer_id, provider_id, category_id, booking_type, status, escrow_status,
        service_price, service_fee, total_amount, description,
        address, barangay, city, province,
        scheduled_at, completed_at, confirmed_at, created_at, updated_at)
      VALUES (
        cust, provs[i], cats[i], 'fixed_price', 'paid_out', 'released',
        sp, sf, sp + sf, '[demo] completed job',
        'Station 1, White Beach', 'Balabag', 'Malay', 'Aklan',
        now() - (daysago || ' days')::interval,
        now() - (daysago || ' days')::interval,
        now() - (daysago || ' days')::interval,
        now() - ((daysago + 1) || ' days')::interval,
        now() - (daysago || ' days')::interval)
      RETURNING id INTO bid;

      -- ~85% leave a review; ratings skew high with the occasional 4 / 3.
      IF (j % 7) <> 0 THEN
        r := CASE WHEN (j % 11) = 0 THEN 3 WHEN (j % 4) = 0 THEN 4 ELSE 5 END;
        INSERT INTO reviews(
          booking_id, reviewer_id, provider_id, rating, comment,
          is_visible, is_flagged, tags, created_at, updated_at)
        VALUES (
          bid, cust, provs[i], r,
          '[demo] ' || comments[1 + (j % array_length(comments,1))],
          true, false,
          CASE WHEN r >= 5 THEN ARRAY['punctual','professional']::text[]
               WHEN r = 4 THEN ARRAY['professional']::text[]
               ELSE ARRAY[]::text[] END,
          now() - (daysago || ' days')::interval,
          now() - (daysago || ' days')::interval);
      END IF;
    END LOOP;

    -- One job in progress today (Active tab)
    INSERT INTO bookings(
      customer_id, provider_id, category_id, booking_type, status, escrow_status,
      service_price, service_fee, total_amount, description,
      address, barangay, city, province,
      scheduled_at, created_at, updated_at)
    VALUES (
      custs[1 + (i % array_length(custs,1))], provs[i], cats[i], 'fixed_price', 'in_progress', 'held',
      prices[i], round(prices[i]*0.10), prices[i] + round(prices[i]*0.10), '[demo] in-progress job',
      'Station 2, White Beach', 'Balabag', 'Malay', 'Aklan',
      now(), now() - interval '2 hours', now());

    -- One upcoming paid job (Active tab)
    INSERT INTO bookings(
      customer_id, provider_id, category_id, booking_type, status, escrow_status,
      service_price, service_fee, total_amount, description,
      address, barangay, city, province,
      scheduled_at, created_at, updated_at)
    VALUES (
      custs[1 + ((i+2) % array_length(custs,1))], provs[i], cats[i], 'fixed_price', 'paid', 'held',
      prices[i], round(prices[i]*0.10), prices[i] + round(prices[i]*0.10), '[demo] upcoming job',
      'Station 3, White Beach', 'Balabag', 'Malay', 'Aklan',
      now() + interval '2 days', now() - interval '1 day', now());
  END LOOP;

  -- Recompute provider stat columns FROM the real rows so the dashboard,
  -- Jobs tab, and Reviews screen all agree.
  UPDATE providers p SET
    total_jobs = (SELECT count(*) FROM bookings b
                    WHERE b.provider_id = p.id
                      AND b.status IN ('confirmed','payout_ready','paid_out')),
    total_reviews = (SELECT count(*) FROM reviews rv WHERE rv.provider_id = p.id),
    rating = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM reviews rv WHERE rv.provider_id = p.id), 0),
    -- Realistic accept rate for the dashboard stat (the live reliability used by
    -- dispatch is computed separately from booking_offers history).
    acceptance_rate = 0.92,
    updated_at = now()
  WHERE p.id = ANY(provs);
END $$;
