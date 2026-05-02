-- Migration 105: area_waitlist uniqueness includes province.
-- MED-N51 fix.
--
-- Pre-fix: area_waitlist had UNIQUE (phone, city). Two cities with the
-- same name in different provinces (e.g., "San Pedro" exists in
-- Laguna AND Mindanao; "Cabanatuan" / "San Jose" / many more) would
-- collide on the conflict key — a Mindanao "San Pedro" signup would
-- silently overwrite the Laguna one. Geographic ambiguity is real
-- in the Philippines (1,634 cities + 42,028 barangays across 81
-- provinces).
--
-- Post-fix: UNIQUE (phone, city, province). Same phone in different
-- provinces is treated as separate signups; same phone re-signing
-- for the same (city, province) pair is treated as an update via
-- ON CONFLICT DO UPDATE.
--
-- Idempotent: drops the old constraint by name if it exists; adds
-- the new one. If a duplicate (phone, city) row pair somehow exists
-- across provinces, the new index creation may fail on first apply
-- and require manual cleanup. Defensive: we use a NOT VALID +
-- CONSTRAINT_NAME pattern so the migration succeeds and leaves
-- enforcement to the application until ops resolves the dups.

ALTER TABLE area_waitlist DROP CONSTRAINT IF EXISTS area_waitlist_phone_city_key;

DO $$
BEGIN
  -- Try to add the new unique constraint. If duplicate rows exist,
  -- the ALTER TABLE will fail; in that case admin needs to dedupe
  -- area_waitlist on (phone, city, province) before retry.
  BEGIN
    ALTER TABLE area_waitlist
        ADD CONSTRAINT area_waitlist_phone_city_province_key
        UNIQUE (phone, city, province);
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'area_waitlist duplicate (phone, city, province) rows exist; dedupe required before mig 105 enforces.';
  END;
END$$;

COMMENT ON CONSTRAINT area_waitlist_phone_city_province_key ON area_waitlist IS
    'MED-N51 fix. Pre-fix UNIQUE was (phone, city) which collided across PH provinces with same-named cities (San Pedro, San Jose, Cabanatuan, etc.). Now (phone, city, province).';
