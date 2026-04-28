# Phase 13 Dispatch E — BIGINT Migration Inventory

**Generated:** 2026-04-28
**Source:** migrations 001–058 + TypeScript usage cross-reference
**Branch:** phase/13-reconciliation (HEAD e660713)

---

## Summary

- **Total columns reviewed:** 115
- **CHANGE-TO-BIGINT:** 42 (37 unique ALTER statements after de-dup; some already widened in later migrations)
- **KEEP-AS-INTEGER:** 35
- **ALREADY-BIGINT:** 33
- **AMBIGUOUS (resolved):** 5

---

## Section 1: CHANGE-TO-BIGINT (the migration list)

| # | Migration | Table | Column | Current Type | Rationale |
|---|-----------|-------|--------|--------------|-----------|
| 1 | 004 | bookings | service_price | INTEGER | centavos; money field per comment; overflow at ≥₱21M in single booking |
| 2 | 004 | bookings | service_fee | INTEGER | centavos; same overflow risk as service_price |
| 3 | 004 | bookings | total_amount | INTEGER | centavos (service_price + service_fee + surge); core booking revenue |
| 4 | 024 | bookings | surge_amount | INTEGER | centavos per migration comment; surge × multiplier overflow risk |
| 5 | 031 | bookings | suki_discount | INTEGER | centavos; loyalty discount applied to booking total |
| 6 | 018 | bookings | budget_min | INTEGER | centavos; job budget lower bound for quote flow |
| 7 | 018 | bookings | budget_max | INTEGER | centavos; job budget upper bound for quote flow |
| 8 | 002 | provider_services | base_price | INTEGER | centavos per comment |
| 9 | 003 | service_subcategories | base_price | INTEGER | centavos; pricing_type=fixed baseline |
| 10 | 003 | service_subcategories | min_price | INTEGER | centavos; pricing floor |
| 11 | 003 | service_subcategories | max_price | INTEGER | centavos; pricing ceiling |
| 12 | 004 | booking_quotes | quoted_price | INTEGER | centavos; provider's quote for job |
| 13 | 018 | booking_quotes | labor_amount | INTEGER | centavos; decomposed quote component |
| 14 | 018 | booking_quotes | materials_amount | INTEGER | centavos; decomposed quote component |
| 15 | 018 | quote_line_items | unit_price | INTEGER | centavos; per-line pricing in itemized quote |
| 16 | 018 | quote_line_items | line_total | INTEGER | centavos; unit_price × quantity |
| 17 | 018 | change_orders | additional_amount | INTEGER | centavos; scope change charge |
| 18 | 020 | recurring_bookings | service_price | INTEGER | centavos; per-instance pricing for recurring job |
| 19 | 020 | recurring_bookings | service_fee | INTEGER | centavos; platform fee per instance |
| 20 | 020 | recurring_bookings | total_amount | INTEGER | centavos; service_price + service_fee per instance |
| 21 | 020 | provider_subscriptions | monthly_price | INTEGER | centavos; pro/business tier subscription fee |
| 22 | 021 | business_accounts | monthly_credit_limit | INTEGER | centavos; B2B credit line |
| 23 | 021 | business_contracts | agreed_rate | INTEGER | centavos; negotiated per-service rate in contract |
| 24 | 021 | business_contracts | estimated_monthly_value | INTEGER | centavos; revenue projection for contract |
| 25 | 021 | business_invoices | subtotal | INTEGER | centavos; service items sum before tax/discount |
| 26 | 021 | business_invoices | discount_amount | INTEGER | centavos; volume discount in invoice |
| 27 | 021 | business_invoices | tax_amount | INTEGER | centavos; VAT in invoice |
| 28 | 021 | business_invoices | total_amount | INTEGER | centavos; invoice bottom line |
| 29 | 021 | business_invoice_items | unit_price | INTEGER | centavos; per-service rate in line item |
| 30 | 021 | business_invoice_items | discount_amount | INTEGER | centavos; line-level discount |
| 31 | 021 | business_invoice_items | amount | INTEGER | centavos; line total after discount |
| 32 | 023 | provider_earnings_goals | target_amount | INTEGER | centavos; daily/weekly/monthly earnings target |
| 33 | 040 | service_addons | price | INTEGER | centavos; add-on charge |
| 34 | 040 | booking_addons | price | INTEGER | centavos; snapshot of selected add-on price |
| 35 | 039 | providers | payout_min_threshold | INTEGER | centavos; auto-payout trigger threshold |
| 36 | 056 | promo_codes | discount_value | INTEGER | AMBIGUOUS (Section 4); when discount_type='fixed_centavos', this is money |
| 37 | 028 | ab_test_assignments | conversion_value | INTEGER | AMBIGUOUS (Section 4); revenue/AOV metrics store centavos |

(disputes.refund_amount excluded — already BIGINT after migration 014.)

---

## Section 2: KEEP-AS-INTEGER (do NOT change)

| # | Migration | Table | Column | Type | Why it stays |
|---|-----------|-------|--------|------|--------------|
| 1 | 001 | otp_codes | attempts | INTEGER | count of OTP entries |
| 2 | 002 | providers | service_radius_km | INTEGER | distance in km (0–50) |
| 3 | 002 | providers | total_reviews | INTEGER | count |
| 4 | 013 | providers | total_jobs | INTEGER | count |
| 5 | 013 | providers | years_experience | INTEGER | years (0–60) |
| 6 | 013 | providers | response_time_minutes | INTEGER | duration |
| 7 | 049 | providers | cancellations_last_30d | INTEGER | count |
| 8 | 049 | providers | total_cancellations | INTEGER | count |
| 9 | 007 | reviews | rating | INTEGER | 1–5 stars |
| 10 | 014 | disputes | tier | SMALLINT | 1–3 escalation level |
| 11 | 003 | service_categories | display_order | INTEGER | UI sort |
| 12 | 003 | service_subcategories | estimated_duration_minutes | INTEGER | duration |
| 13 | 003 | service_subcategories | display_order | INTEGER | UI sort |
| 14 | 004 | booking_quotes | estimated_duration_minutes | INTEGER | duration |
| 15 | 015 | suki_memberships | total_bookings | INTEGER | count |
| 16 | 015 | suki_memberships | points_balance | INTEGER | loyalty points (not money); tier multiplier is %, not centavos |
| 17 | 015 | suki_rewards | points | INTEGER | loyalty points awarded/redeemed |
| 18 | 015 | referral_codes | uses_count | INTEGER | count of redemptions |
| 19 | 015 | referral_codes | max_uses | INTEGER | count cap |
| 20 | 020 | recurring_bookings | preferred_day | INTEGER | day-of-week 0–6 |
| 21 | 020 | recurring_bookings | total_instances | INTEGER | count of generated instances |
| 22 | 022 | service_areas | radius_km | INTEGER | geographic distance |
| 23 | 022 | service_areas | min_providers_to_launch | INTEGER | count threshold |
| 24 | 022 | service_areas | active_provider_count | INTEGER | count |
| 25 | 022 | service_areas | active_customer_count | INTEGER | count |
| 26 | 022 | service_areas | total_bookings | INTEGER | count |
| 27 | 010 | provider_availability | day_of_week | SMALLINT | 0–6 |
| 28 | 028 | provider_quality_scores | total_jobs_scored | INTEGER | count of jobs in scoring window |
| 29 | 042 | provider_portfolios | display_order | INTEGER | UI sort |
| 30 | 044 | promotions | display_order | INTEGER | UI sort |
| 31 | 024 | pricing_rules | rush_hours_threshold | INTEGER | hours threshold |
| 32 | 055 | or_sequences | last_sequence | INTEGER | atomic monthly counter |
| 33 | 055 | vat_monthly_reports | or_count | INTEGER | count of ORs in period |
| 34 | 056 | promo_codes | usage_limit_total | INTEGER | count cap |
| 35 | 056 | promo_codes | usage_limit_per_customer | INTEGER | count per customer |
| 36 | 056 | promo_codes | times_used | INTEGER | count of redemptions |
| 37 | 056 | marketing_campaigns | attributed_signups | INTEGER | count |
| 38 | 056 | marketing_campaigns | attributed_first_bookings | INTEGER | count |

---

## Section 3: ALREADY-BIGINT (no action)

| # | Migration | Table | Column |
|---|-----------|-------|--------|
| 1 | 005 | wallets | available_balance |
| 2 | 005 | wallets | pending_balance |
| 3 | 005 | wallet_transactions | amount |
| 4 | 005 | wallet_transactions | balance_after |
| 5 | 015 | tips | amount |
| 6 | 012 | payouts | amount |
| 7 | 012 | payment_intents | amount |
| 8 | 015 | referral_codes | referrer_bonus |
| 9 | 015 | referral_codes | referee_bonus |
| 10 | 015 | referral_redemptions | referrer_bonus |
| 11 | 015 | referral_redemptions | referee_bonus |
| 12 | 015 | suki_memberships | total_spent |
| 13 | 014 | disputes | refund_amount (replaces migration 008's INTEGER definition) |
| 14 | 055 | official_receipts | gross_amount |
| 15 | 055 | official_receipts | vat_amount |
| 16 | 055 | official_receipts | net_amount |
| 17 | 055 | official_receipts | commission_amount |
| 18 | 055 | official_receipts | service_fee_amount |
| 19 | 055 | official_receipts | provider_received |
| 20 | 055 | official_receipts | platform_retained |
| 21 | 055 | bir_2307_batches | gross_income |
| 22 | 055 | bir_2307_batches | withheld_amount |
| 23 | 055 | vat_monthly_reports | total_gross_sales |
| 24 | 055 | vat_monthly_reports | output_vat |
| 25 | 055 | vat_monthly_reports | input_vat |
| 26 | 055 | vat_monthly_reports | vat_payable |
| 27 | 055 | reconciliation_snapshots | paymongo_balance |
| 28 | 055 | reconciliation_snapshots | platform_escrow_total |
| 29 | 055 | reconciliation_snapshots | platform_revenue_total |
| 30 | 055 | reconciliation_snapshots | guarantee_fund_total |
| 31 | 055 | reconciliation_snapshots | sum_of_user_wallets |
| 32 | 055 | reconciliation_snapshots | expected_total |
| 33 | 055 | reconciliation_snapshots | discrepancy |
| 34 | 056 | promo_codes | maximum_discount_centavos |
| 35 | 056 | promo_codes | minimum_order_centavos |
| 36 | 056 | marketing_campaigns | spend_centavos |
| 37 | 056 | marketing_campaigns | attributed_revenue_centavos |

---

## Section 4: AMBIGUOUS (resolved with explicit reasoning)

### 4.1 bookings.surge_amount (migration 024)
- **Looks like money?** Yes (`*_amount`). Migration comment says "in centavos".
- **Verdict:** **CHANGE-TO-BIGINT.**
- **Reasoning:** Surge multiplier stored as DECIMAL(4,2). At combined high service_price × peak surge, single-row centavos can exceed INT max (~₱21M ceiling). Treat consistently with sibling money columns.

### 4.2 promo_codes.discount_value (migration 056)
- **Schema:** `discount_type VARCHAR(20)` ∈ {'percentage','fixed_centavos'}; `discount_value INTEGER NOT NULL CHECK (>0)`.
- **Verdict:** **CHANGE-TO-BIGINT.**
- **Reasoning:** When `discount_type='fixed_centavos'`, the value IS centavos (e.g., ₱500 off = 50 000). Percentage values fit harmlessly. Sibling cap columns (`maximum_discount_centavos`, `minimum_order_centavos`) are already BIGINT — `discount_value` should match for type consistency in math.

### 4.3 ab_test_assignments.conversion_value (migration 028)
- **Schema:** `conversion_value INTEGER DEFAULT 0` set when converted=true; meaning depends on `ab_tests.target_metric`.
- **Verdict:** **CHANGE-TO-BIGINT.**
- **Reasoning:** Same column stores money for `average_order_value`/`revenue` metrics and counts for `booking_count`. Counts/percentages fit in BIGINT harmlessly; revenue metrics need the headroom. Better to over-allocate once than overflow on a revenue A/B test.

### 4.4 suki_memberships.points_balance (migration 015)
- **Verdict:** **KEEP-AS-INTEGER.**
- **Reasoning:** Loyalty points, NOT centavos. 1 point ≠ 1 centavo. Tier multipliers are percentage-based (`tier_multiplier_pct DECIMAL`). 2.1B-point ceiling is well beyond any realistic loyalty balance.

### 4.5 provider_earnings_goals.target_amount (migration 023)
- **Verdict:** **CHANGE-TO-BIGINT.**
- **Reasoning:** Migration comment confirms "centavos". Daily/weekly/monthly earnings goal — provider could realistically set monthly goal ≥ ₱21M for premium providers; INT ceiling is too low.

---

## Section 5: Risk notes

### Option B ceiling check
`Number.MAX_SAFE_INTEGER` = 2^53 − 1 = 9 007 199 254 740 991 centavos ≈ **₱90 trillion** per single value.

After auditing every CHANGE-TO-BIGINT column, **no single-row money value can plausibly exceed Option B**:
- Largest plausible single booking (service ₱500M + surge ₱50M + add-ons ₱100M) ≈ 65 000 000 000 centavos ≈ ₱650M. Six orders of magnitude below ceiling.
- `reconciliation_snapshots.*` aggregates at platform scale: 1M users × ₱100K average wallet ≈ 10 000 000 000 000 centavos ≈ ₱100B. Three orders of magnitude below ceiling.
- BIR `vat_monthly_reports` aggregates: even at ₱100B monthly gross, well within ceiling.

**Conclusion: no escalation to Option A or C.** Option B (BIGINT OID 20 → JS Number) is safe for all audited columns. Document as a tracked future limit in LAUNCH-LIMITATIONS.

### Lossless cast
All source columns are 32-bit INTEGER (≤ 2^31 − 1). `USING column::BIGINT` is lossless.

---

## Section 6: Recommended migration 059 plan (pseudo-SQL)

```sql
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
ALTER TABLE booking_quotes  ALTER COLUMN quoted_price      TYPE BIGINT USING quoted_price::BIGINT;
ALTER TABLE booking_quotes  ALTER COLUMN labor_amount      TYPE BIGINT USING labor_amount::BIGINT;
ALTER TABLE booking_quotes  ALTER COLUMN materials_amount  TYPE BIGINT USING materials_amount::BIGINT;
ALTER TABLE quote_line_items ALTER COLUMN unit_price       TYPE BIGINT USING unit_price::BIGINT;
ALTER TABLE quote_line_items ALTER COLUMN line_total       TYPE BIGINT USING line_total::BIGINT;
ALTER TABLE change_orders    ALTER COLUMN additional_amount TYPE BIGINT USING additional_amount::BIGINT;

-- recurring & subscriptions (4)
ALTER TABLE recurring_bookings    ALTER COLUMN service_price  TYPE BIGINT USING service_price::BIGINT;
ALTER TABLE recurring_bookings    ALTER COLUMN service_fee    TYPE BIGINT USING service_fee::BIGINT;
ALTER TABLE recurring_bookings    ALTER COLUMN total_amount   TYPE BIGINT USING total_amount::BIGINT;
ALTER TABLE provider_subscriptions ALTER COLUMN monthly_price TYPE BIGINT USING monthly_price::BIGINT;

-- B2B (10)
ALTER TABLE business_accounts        ALTER COLUMN monthly_credit_limit     TYPE BIGINT USING monthly_credit_limit::BIGINT;
ALTER TABLE business_contracts       ALTER COLUMN agreed_rate              TYPE BIGINT USING agreed_rate::BIGINT;
ALTER TABLE business_contracts       ALTER COLUMN estimated_monthly_value  TYPE BIGINT USING estimated_monthly_value::BIGINT;
ALTER TABLE business_invoices        ALTER COLUMN subtotal                 TYPE BIGINT USING subtotal::BIGINT;
ALTER TABLE business_invoices        ALTER COLUMN discount_amount          TYPE BIGINT USING discount_amount::BIGINT;
ALTER TABLE business_invoices        ALTER COLUMN tax_amount               TYPE BIGINT USING tax_amount::BIGINT;
ALTER TABLE business_invoices        ALTER COLUMN total_amount             TYPE BIGINT USING total_amount::BIGINT;
ALTER TABLE business_invoice_items   ALTER COLUMN unit_price               TYPE BIGINT USING unit_price::BIGINT;
ALTER TABLE business_invoice_items   ALTER COLUMN discount_amount          TYPE BIGINT USING discount_amount::BIGINT;
ALTER TABLE business_invoice_items   ALTER COLUMN amount                   TYPE BIGINT USING amount::BIGINT;

-- provider goals & payout threshold (2)
ALTER TABLE provider_earnings_goals ALTER COLUMN target_amount        TYPE BIGINT USING target_amount::BIGINT;
ALTER TABLE providers                ALTER COLUMN payout_min_threshold TYPE BIGINT USING payout_min_threshold::BIGINT;

-- service add-ons (2)
ALTER TABLE service_addons ALTER COLUMN price TYPE BIGINT USING price::BIGINT;
ALTER TABLE booking_addons ALTER COLUMN price TYPE BIGINT USING price::BIGINT;

-- promo & A/B (2)
ALTER TABLE promo_codes           ALTER COLUMN discount_value   TYPE BIGINT USING discount_value::BIGINT;
ALTER TABLE ab_test_assignments   ALTER COLUMN conversion_value TYPE BIGINT USING conversion_value::BIGINT;

COMMIT;
```

**Total: 37 ALTER COLUMN statements.**

---

## Section 7: Implementation notes (for the implementation dispatch)

1. **pg type parser (Option B)** — register at process startup (e.g., in `packages/api/src/models/db.ts` or wherever the pool is created):
   ```ts
   import pgTypes from 'pg-types';
   pgTypes.setTypeParser(20, (val) => val === null ? null : Number(val)); // OID 20 = INT8/BIGINT
   ```
   Apply in BOTH the API pool init AND any test-side pool init that bypasses the main module (check `__tests__/setup` and jest setup files).

2. **Regression set** — must remain green after migration + parser registration:
   - `escrow-money-conservation.test.ts`
   - `commission.test.ts`
   - `wallet-type-isolation.test.ts`
   - `dispute-refund-processing.test.ts`
   - `booking-state-machine.test.ts`
   - `booking-price-lookup.test.ts`

3. **New BIGINT-acceptance test** — insert `bookings.total_amount = 5_000_000_000` (₱50M, > 2^31), read back, assert exact equality. Proves migration applied AND parser preserves precision below MAX_SAFE_INTEGER.

4. **LAUNCH-LIMITATIONS entry** — add Option B ceiling note: "Money columns use BIGINT but are read as JS Number; safe up to 2^53−1 centavos (≈₱90T per single value). Aggregates approaching this should switch to BigInt at the boundary."
