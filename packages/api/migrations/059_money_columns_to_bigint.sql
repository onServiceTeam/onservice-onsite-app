-- Phase 13 Dispatch E — widen all money (centavos) columns from INTEGER to BIGINT.
--
-- Rationale: INTEGER ceiling = 2^31 - 1 centavos ≈ ₱21.4M. Several columns
-- (booking total_amount, B2B invoice subtotal, monthly_credit_limit,
-- recurring booking aggregate, provider earnings goals) can plausibly exceed
-- this in production at platform scale. BIGINT (2^63 - 1) gives ~₱90T headroom.
--
-- The 37 ALTER statements below are the canonical list per:
--   .ai-coder/checkpoints/logs/PHASE-13/dispatch-E/bigint-inventory.md §6
--
-- All source columns are 32-bit INTEGER; the USING column::BIGINT cast is
-- lossless. Column DEFAULTs are integer literal `0` which auto-cast to BIGINT;
-- no explicit re-statement of defaults is required.
--
-- Companion runtime change: pg-types OID 20 parser registered in
--   packages/api/src/config/database.config.ts
-- to coerce BIGINT → JS Number (Option B; see LAUNCH-LIMITATIONS §15).

BEGIN;

-- bookings (7)
ALTER TABLE bookings ALTER COLUMN service_price   TYPE BIGINT USING service_price::BIGINT;
ALTER TABLE bookings ALTER COLUMN service_fee     TYPE BIGINT USING service_fee::BIGINT;
ALTER TABLE bookings ALTER COLUMN total_amount    TYPE BIGINT USING total_amount::BIGINT;
ALTER TABLE bookings ALTER COLUMN surge_amount    TYPE BIGINT USING surge_amount::BIGINT;
ALTER TABLE bookings ALTER COLUMN suki_discount   TYPE BIGINT USING suki_discount::BIGINT;
ALTER TABLE bookings ALTER COLUMN budget_min      TYPE BIGINT USING budget_min::BIGINT;
ALTER TABLE bookings ALTER COLUMN budget_max      TYPE BIGINT USING budget_max::BIGINT;

-- service catalog (4)
ALTER TABLE provider_services      ALTER COLUMN base_price TYPE BIGINT USING base_price::BIGINT;
ALTER TABLE service_subcategories  ALTER COLUMN base_price TYPE BIGINT USING base_price::BIGINT;
ALTER TABLE service_subcategories  ALTER COLUMN min_price  TYPE BIGINT USING min_price::BIGINT;
ALTER TABLE service_subcategories  ALTER COLUMN max_price  TYPE BIGINT USING max_price::BIGINT;

-- quoting & change orders (6)
ALTER TABLE booking_quotes   ALTER COLUMN quoted_price       TYPE BIGINT USING quoted_price::BIGINT;
ALTER TABLE booking_quotes   ALTER COLUMN labor_amount       TYPE BIGINT USING labor_amount::BIGINT;
ALTER TABLE booking_quotes   ALTER COLUMN materials_amount   TYPE BIGINT USING materials_amount::BIGINT;
ALTER TABLE quote_line_items ALTER COLUMN unit_price         TYPE BIGINT USING unit_price::BIGINT;
ALTER TABLE quote_line_items ALTER COLUMN line_total         TYPE BIGINT USING line_total::BIGINT;
ALTER TABLE change_orders    ALTER COLUMN additional_amount  TYPE BIGINT USING additional_amount::BIGINT;

-- recurring & subscriptions (4)
ALTER TABLE recurring_bookings     ALTER COLUMN service_price  TYPE BIGINT USING service_price::BIGINT;
ALTER TABLE recurring_bookings     ALTER COLUMN service_fee    TYPE BIGINT USING service_fee::BIGINT;
ALTER TABLE recurring_bookings     ALTER COLUMN total_amount   TYPE BIGINT USING total_amount::BIGINT;
ALTER TABLE provider_subscriptions ALTER COLUMN monthly_price  TYPE BIGINT USING monthly_price::BIGINT;

-- B2B (10)
ALTER TABLE business_accounts      ALTER COLUMN monthly_credit_limit    TYPE BIGINT USING monthly_credit_limit::BIGINT;
ALTER TABLE business_contracts     ALTER COLUMN agreed_rate             TYPE BIGINT USING agreed_rate::BIGINT;
ALTER TABLE business_contracts     ALTER COLUMN estimated_monthly_value TYPE BIGINT USING estimated_monthly_value::BIGINT;
ALTER TABLE business_invoices      ALTER COLUMN subtotal                TYPE BIGINT USING subtotal::BIGINT;
ALTER TABLE business_invoices      ALTER COLUMN discount_amount         TYPE BIGINT USING discount_amount::BIGINT;
ALTER TABLE business_invoices      ALTER COLUMN tax_amount              TYPE BIGINT USING tax_amount::BIGINT;
ALTER TABLE business_invoices      ALTER COLUMN total_amount            TYPE BIGINT USING total_amount::BIGINT;
ALTER TABLE business_invoice_items ALTER COLUMN unit_price              TYPE BIGINT USING unit_price::BIGINT;
ALTER TABLE business_invoice_items ALTER COLUMN discount_amount         TYPE BIGINT USING discount_amount::BIGINT;
ALTER TABLE business_invoice_items ALTER COLUMN amount                  TYPE BIGINT USING amount::BIGINT;

-- provider goals & payout threshold (2)
ALTER TABLE provider_earnings_goals ALTER COLUMN target_amount        TYPE BIGINT USING target_amount::BIGINT;
ALTER TABLE providers               ALTER COLUMN payout_min_threshold TYPE BIGINT USING payout_min_threshold::BIGINT;

-- service add-ons (2)
ALTER TABLE service_addons ALTER COLUMN price TYPE BIGINT USING price::BIGINT;
ALTER TABLE booking_addons ALTER COLUMN price TYPE BIGINT USING price::BIGINT;

-- promo & A/B (2)
-- NOTE: promo_codes.discount_value is polymorphic on discount_type
-- ('percentage' vs 'fixed_centavos'); ab_test_assignments.conversion_value is
-- polymorphic on ab_tests.target_metric. BIGINT widening is conservative-correct
-- for both. Future schema split tracked in LAUNCH-LIMITATIONS §14.
ALTER TABLE promo_codes         ALTER COLUMN discount_value   TYPE BIGINT USING discount_value::BIGINT;
ALTER TABLE ab_test_assignments ALTER COLUMN conversion_value TYPE BIGINT USING conversion_value::BIGINT;

COMMIT;
