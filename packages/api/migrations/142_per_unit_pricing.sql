-- D27 Phase 4 — per-unit pricing model (e.g. ₱X per sqm, per room, per panel).
--
-- A per_unit subcategory advertises a transparent rate (unit_price per
-- unit_label) so the customer sees "₱50 / sqm" up front and gets an estimate
-- from the quantity they enter on the intake form (D27 Phase 2). It does NOT
-- auto-charge on a self-reported quantity — the booking still routes through
-- the custom-quote flow where the provider measures and confirms the real
-- amount via quote line items (which already carry quantity × unit × unitPrice).
-- This keeps the money path server-canonical and provider-verified.
--
-- 'hourly' stays deferred (LAUNCH-LIMITATIONS §24) — see
-- .ai-coder/decisions/D27p4-hourly-pricing.md.

-- Amend the pricing_type CHECK to add 'per_unit'. The original inline CHECK
-- (migration 003) is auto-named; find and drop whichever CHECK references
-- pricing_type, then add a named one with the expanded value set.
DO $$
DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'service_subcategories'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%pricing_type%'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE service_subcategories DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE service_subcategories
  ADD CONSTRAINT service_subcategories_pricing_type_check
  CHECK (pricing_type IN ('fixed', 'quote', 'hourly', 'per_unit'));

-- Per-unit rate. unit_price is centavos per unit (e.g. 5000 = ₱50.00 / sqm).
ALTER TABLE service_subcategories ADD COLUMN IF NOT EXISTS unit_label VARCHAR(30);
ALTER TABLE service_subcategories ADD COLUMN IF NOT EXISTS unit_price INTEGER;
