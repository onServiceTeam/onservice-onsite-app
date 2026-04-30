-- Phase 14 Dispatch 05 — Bug 320 + Bug 322 + Bug 417 + Bug 266 + Bug 269.
--
-- (1) Service-area lat/lng/radius/min-providers CHECK constraints.
--     Bug 320 + Bug 322. Defense-in-depth: the Zod validator at
--     packages/api/src/validators/admin/service-area.validator.ts
--     (subtask 12) rejects out-of-bounds at the API layer; this
--     migration is the database backstop in case the validator is
--     ever weakened or bypassed.
--
--     Bounds rationale:
--       - Latitude 4.5..21.5 covers the entire Philippine archipelago
--         (Tawi-Tawi at ~4.4°N, Batanes at ~21.1°N, slight buffer for
--         GPS accuracy).
--       - Longitude 116..127.5 covers it East–West (Palawan ~117°E,
--         Davao Oriental ~126.6°E).
--       - radius_km 1..100 — anything below 1 km is operationally
--         unviable (smaller than a single barangay); anything above
--         100 km is bigger than most cities (Metro Manila is ~50 km
--         wide); operator typo guard.
--       - min_providers_to_launch 1..50 — service area can't launch
--         with 0 providers; >50 is unrealistic for any single area at
--         v1 scale.
--
--     Existing data: the only seeded service-area rows at the time of
--     this migration sit within these bounds. Verify with the smoke
--     test packages/api/__tests__/migrations/074-service-area-bounds.test.ts.
--
-- (2) New platform_settings rows for D05 admin-editable tunables.
--     Per the D02 admin-editable doctrine: any DB-backed configurable
--     thing gets an admin editor in the same dispatch. Each row is
--     surfaced via the existing /admin/settings page (admin reads
--     settings via getSetting* helpers, writes via the existing
--     settings PUT endpoint).
--
--     Rows added:
--       - tip_max_amount_cents (Bug 417) — default ₱5,000.
--         Plan claimed this was already seeded; greps confirmed it
--         was not. The tip validator (subtask 13) reads this.
--       - addon_price_max_cents (Bug 266) — default ₱50,000.
--         Currently hardcoded in the new admin addon validator;
--         this seed lets ops raise it without a code change.
--       - surge_multiplier_min (Bug 269) — default 1.0 (1x).
--       - surge_multiplier_max (Bug 269) — default 5.0 (5x).
--
-- Migration numbering: D05-plan.md spec said 073, but 073_founding_tier.sql
-- was already taken by D03. Per .ai-coder/decisions/D05-spec-vs-schema.md
-- (Ken's Option A, 2026-04-30), all D05 migrations shift +1 from spec.

ALTER TABLE service_areas
  ADD CONSTRAINT center_lat_in_ph CHECK (center_lat BETWEEN 4.5 AND 21.5),
  ADD CONSTRAINT center_lng_in_ph CHECK (center_lng BETWEEN 116 AND 127.5),
  ADD CONSTRAINT radius_km_sane CHECK (radius_km BETWEEN 1 AND 100),
  ADD CONSTRAINT min_providers_sane CHECK (min_providers_to_launch BETWEEN 1 AND 50);

INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, min_value, max_value, unit, display_order)
VALUES
  ('fees',
   'tip_max_amount_cents',
   'Tip Cap',
   'Maximum tip a customer may add to a booking (centavos)',
   'currency',
   '500000',
   '500000',
   10000,
   10000000,
   'centavos',
   6),
  ('fees',
   'addon_price_max_cents',
   'Add-on Price Cap',
   'Maximum admin-creatable add-on price (centavos)',
   'currency',
   '5000000',
   '5000000',
   10000,
   50000000,
   'centavos',
   7),
  ('escrow',
   'surge_multiplier_min',
   'Surge Multiplier Min',
   'Minimum value for any pricing-rule multiplier',
   'number',
   '1.0',
   '1.0',
   1.0,
   5.0,
   'multiplier',
   6),
  ('escrow',
   'surge_multiplier_max',
   'Surge Multiplier Max',
   'Maximum value for any pricing-rule multiplier',
   'number',
   '5.0',
   '5.0',
   1.0,
   5.0,
   'multiplier',
   7)
ON CONFLICT (key) DO NOTHING;
