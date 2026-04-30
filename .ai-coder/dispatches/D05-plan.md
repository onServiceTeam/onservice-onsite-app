# Dispatch 05 — Money Trust Closure — Plan (HANDOFF DOC)

Branch: `phase/14-d05-money-trust-closure`
Started from: master @ `808208f` (post D03+D04 merges)
Source spec: `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md` §"Dispatch 05" (lines 10–1228)
Related: `.ai-coder/CURRENT-DISPATCH` has the numbered subtask list. THIS doc has the lifted technical detail.

---

## Standing instructions (read before any code)

**This is money-handling code.** Every fix in D05 is a confirmed money-loss vulnerability where a determined client (customer, provider, or admin) can pay the wrong amount. The architectural remedy is uniform: **client sends IDs and quantities only; server computes price authoritatively from DB.** No exceptions. No "just this once" escape hatches.

1. **Tests run against actual computed values, not mocked returns.** Use real seeded subcategories/addons/promos in test setup. If you mock `resolvePricing`, you're not testing the bug fix — you're testing your mock.
2. **Validators must reject edge cases.** For every numeric input, the test matrix includes: `0`, `-1`, `0.5` (when integer required), `NaN`, `Infinity`, `-Infinity`, `Number.MAX_SAFE_INTEGER + 1`, scientific notation strings (`'1e10'`), leading-zero strings (`'00100'`), hex strings (`'0xff'`), currency-mixing (e.g., dollar value where centavos expected). Explicitly assert each is rejected.
3. **Honesty check at end of dispatch must include 3 attack scenarios manually traced.** For each: "if a customer submitted X, what would the server compute and charge." Pick from the bug list (e.g., Bug 176: tampered addon price; Bug 208: tampered recurring servicePrice; Bug 261: tampered promo discount). Walk the code path step-by-step, citing line numbers, ending at the persisted DB value.
4. **D02 admin-editable doctrine applies to any new configurable thing.** D05 introduces surge multipliers, promo rules, pricing rule scopes — all should be admin-editable via existing `platform_settings` rows or admin pages. NOT hardcoded in `platform.config.ts`. If a value would be operator-tunable post-launch, build the admin editor in this dispatch (per the D02 standing instruction in user memory).
5. **No client-trusted money path may survive.** If you find a code path where money came from `req.body` and was used without DB lookup, fix it even if not in the bug list. The `a-cross-source-no-client-money` gate catches these; treat its output as authoritative.
6. **`.strict()` on every write-side Zod schema.** Unknown keys must throw, not silently drop. This makes the failure mode visible and prevents tampering by accumulation (where unknown fields slip through and downstream code uses them).

---

## Bug list (12 entries — Gate B parses this section)

- Bug 175 — `servicePrice` accepted from client in booking validator (max not enforced) — `packages/api/src/validators/booking.validator.ts:17` — test: `packages/api/__tests__/validators/booking.validator.test.ts:bug-175-no-servicePrice`
- Bug 176 — Booking addons trust client-supplied prices (CRITICAL) — `packages/api/src/validators/booking.validator.ts:20-24` — test: `packages/api/__tests__/services/booking/pricing.service.test.ts:bug-176-server-canonical-addons`
- Bug 208 — Recurring booking trusts `servicePrice` from client — `packages/api/src/routes/recurring.ts:41,71` + `packages/api/src/services/recurring.service.ts:65,95-107` — test: `packages/api/__tests__/services/recurring.test.ts:bug-208-server-resolves`
- Bug 261 — Promo creation/redemption trusts client `discountValue` — `packages/api/src/routes/admin/promos.ts:88,93-96` + mobile `apps/mobile/app/customer/booking/checkout.tsx` — test: `packages/api/__tests__/services/booking/promo.service.test.ts:bug-261-server-resolves-promo`
- Bug 266 — Admin addon price has no upper bound — `apps/admin/src/pages/CatalogPage.tsx` addon modal + `packages/api/src/validators/admin/catalog.validator.ts` — test: `packages/api/__tests__/validators/admin/catalog.validator.test.ts:bug-266-addon-bounds`
- Bug 269 — `platformSurgeShare` not validated 0..1 — `apps/admin/src/pages/PricingRulesPage.tsx:84` + `packages/api/src/validators/admin/pricing-rules.validator.ts` — test: `packages/api/__tests__/validators/admin/pricing-rules.validator.test.ts:bug-269-share-bounds`
- Bug 320 — Service area lat/lng not bounds-checked — `packages/api/src/validators/admin/service-area.validator.ts` + migration 073 — test: `packages/api/__tests__/validators/admin/service-area.validator.test.ts:bug-320-ph-bounds`
- Bug 322 — Service area radius/min-providers unbounded (combined with 320) — same files as Bug 320 — test: same file `:bug-322-radius-min-providers`
- Bug 417 — Tip cap is service price (100%), exceeds validator max — `apps/mobile/app/customer/booking/tip.tsx` + `packages/api/src/validators/tip.validator.ts` + new `packages/api/src/routes/public/settings.ts` (`/tip-limits`) — test: `packages/api/__tests__/validators/tip.validator.test.ts:bug-417-tip-max`
- Bug 1132 — Type-level removal `CreateRecurringParams.servicePrice` — `shared/types/recurring.ts` (encompassed by Bug 208 fix; closeout writes the encompassment paragraph)
- Bug 1219 — Provider change-order amount client-trusted — `apps/mobile/app/provider/job/[id]/change-order.tsx` + `packages/api/src/services/change-orders.service.ts` + new `packages/api/src/validators/change-order.validator.ts` — test: `packages/api/__tests__/services/change-orders.test.ts:bug-1219-server-resolves`
- Bug 1230 — Provider service price overrides bypass system min/max — `apps/mobile/app/provider/services.tsx` + `packages/api/src/validators/provider/services.validator.ts` + `packages/api/src/services/provider-services.service.ts` + new endpoint `/catalog/subcategories/:id/bounds` — test: `packages/api/__tests__/services/provider-services.test.ts:bug-1230-subcat-bounds`

---

## New service files (4)

### 1. `packages/api/src/services/booking/pricing.service.ts`

**Responsibility:** the SINGLE source of canonical pricing for a booking. Every code path that records money calls this (or its variant). Client-side preview (`POST /booking/preview`) calls this without persisting.

**Public function signatures:**
```ts
export interface ParsedBookingRequest {
  userId: string;
  serviceCategoryId: string;
  subcategoryId: string;
  addons: Array<{ addonId: string; quantity: number }>;
  scheduledAt: string;
  addressId: string;
  promoCode?: string;
}

export interface ResolvedPricing {
  servicePriceCents: number;
  addonsCents: number;
  surgeAmountCents: number;
  surgeRuleApplied: string | null;
  promoDiscountCents: number;
  serviceFeeCents: number;
  totalAmountCents: number;
  breakdown: Array<{ label: string; amountCents: number }>;
}

export async function resolvePricing(input: ParsedBookingRequest): Promise<ResolvedPricing>;
```

**Validators consumed:** `createBookingSchema` from `packages/api/src/validators/booking.validator.ts` (parsed result is the input shape).

**DB tables read:**
- `subcategories` — base price, min/max bounds, pricing_type
- `addons` — price_cents, subcategory_id, is_active
- (delegated to other services) `pricing_rules` (via surge.service), `promo_codes` + `promo_redemptions` (via promo.service), `platform_settings` (via fee.service / settings.service)

**DB tables written:** none. Pricing is read-only resolution. Persistence is the caller's responsibility.

**Bugs closed:** Bug 175, Bug 176 (the architectural pattern). Indirectly enables every other bug fix that uses pricing.

**Test cases (in `packages/api/__tests__/services/booking/pricing.service.test.ts`):**
1. `bug-176-server-canonical-addons` — seed subcat ₱500 + addon ₱500. Call with `addons:[{addonId, quantity:1}]`. Assert `result.addonsCents === 50000`.
2. `bug-176-rejects-unknown-addonId` — call with random UUID. Assert `rejects.toThrow(/addon_not_found/)`.
3. `bug-176-rejects-cross-subcat-addon` — seed addon for SUBCAT_A, call with SUBCAT_B. Assert `rejects.toThrow(/addon_subcategory_mismatch/)`.
4. `bug-176-multiplies-quantity` — call with `quantity:3`. Assert `addonsCents === 150000`.
5. `bug-175-uses-quote-amount` — for quote-based subcat, the service throws `quote_required` requiring the from-quote.service path.
6. `surge-applied-from-rule` — seed surge rule 1.5×; assert `surgeAmountCents` is the delta.
7. `promo-applied` — seed promo code; assert `promoDiscountCents` reflects DB resolution.
8. `service-fee-from-settings` — change `service_fee_rate` setting; assert `serviceFeeCents` reflects new rate.
9. `total-equals-sum-of-components` — `expect(totalAmountCents).toBe(service + addons + surge - promo + fee)`.
10. `rejects-zero-or-negative-total` — pump in numbers that sum to 0; assert `rejects.toThrow(/pricing_resolution_invalid/)`.
11. **Edge cases (per standing instruction §2):** quantity = 0, quantity = NaN, quantity = 1e10, addonId not a UUID — each rejected with specific error.

---

### 2. `packages/api/src/services/booking/promo.service.ts`

**Responsibility:** validate a promo code against the `promo_codes` table, enforce eligibility (validity window, min order, max redemptions, per-user limit, max-discount cap, expiry), and return the server-canonical discount amount in centavos.

**Public function signatures:**
```ts
export async function resolvePromo(input: {
  code: string;
  subtotalCents: number;
  userId: string;
}): Promise<number>;  // returns the server-validated discount amount in centavos
```

**Validators consumed:** none directly (called by `resolvePricing`); the `code` field originates from `createBookingSchema.promoCode`.

**DB tables read:**
- `promo_codes` — code, discount_type, discount_value, valid_from, valid_until, is_active, minimum_order_cents, max_discount_cents, max_redemptions, per_user_limit, applies_to_categories
- `promo_redemptions` — count by `promo_code_id`, count by `(promo_code_id, user_id)`

**DB tables written:** none in `resolvePromo`. The booking-creation path writes `promo_redemptions` after the booking commits (in the same transaction — D06 territory).

**Bugs closed:** Bug 261 (server-canonical promo resolution).

**Errors thrown:**
- `promo_invalid` (404) — code not found, expired, inactive
- `promo_min_order_not_met` (400)
- `promo_exhausted` (400) — global redemption limit hit
- `promo_user_limit` (400) — per-user limit hit
- `promo_category_excluded` (400) — promo restricted to other categories

**Test cases (in `packages/api/__tests__/services/booking/promo.service.test.ts`):**
1. `bug-261-server-resolves-promo` — seed `SAVE10` (10% off, no min). Call. Assert returns `subtotal/10` (rounded down).
2. `rejects-unknown-code` — assert `rejects.toThrow(/promo_invalid/)`.
3. `enforces-min-order` — seed promo with min ₱500. Call with `subtotal: 30000` (₱300). Assert rejection.
4. `honors-per-user-limit` — seed `perUserLimit:1`. Insert prior redemption row. Assert rejection.
5. `caps-percent-at-max-discount-cents` — seed 50% promo, max ₱100. Call with subtotal ₱1000. Assert returns ₱100 (the cap), not ₱500.
6. `caps-discount-at-subtotal` — seed fixed ₱200 promo. Call with subtotal ₱100. Assert returns ₱100 (can't exceed subtotal).
7. `rejects-expired` — seed promo with `valid_until` in past. Assert rejection.
8. `rejects-not-yet-active` — `valid_from` in future. Assert rejection.
9. `rejects-deactivated` — `is_active: false`. Assert rejection.
10. **Edge cases:** code with whitespace, code in lowercase (admins create UPPERCASE only — does the lookup normalize? confirm via test), code longer than 32 chars, code with special chars not in regex.

---

### 3. `packages/api/src/services/booking/surge.service.ts`

**Responsibility:** look up active pricing rules for the given (`serviceCategoryId`, `scheduledAt`, `addressId`) tuple, return the matched rule (highest priority) or null.

**Public function signatures:**
```ts
export interface SurgeRule {
  id: string;
  multiplier: number;
  platformSurgeShare: number;
  ruleName: string;
}

export async function resolveSurgeRule(input: {
  serviceCategoryId: string;
  scheduledAt: string;
  addressId: string;
}): Promise<SurgeRule | null>;
```

**Validators consumed:** none directly.

**DB tables read:**
- `pricing_rules` — id, multiplier, platform_surge_share, scope (service_category_ids JSONB, service_area_ids JSONB), schedule (starts_at, ends_at, days_of_week JSONB), priority, is_active
- `service_areas` — id, center_lat, center_lng, radius_km (for matching `addressId` to a service area; or via existing helper)
- (probably) `addresses` — to resolve the address's lat/lng

**DB tables written:** none.

**Bugs closed:** indirectly closes the surge component of the pricing flow. Bug 269 directly is the validator (separate file), but this service is the runtime consumer.

**Test cases (in `packages/api/__tests__/services/booking/surge.service.test.ts`):**
1. `returns-null-when-no-rule-matches` — no seeded rules. Assert `null`.
2. `matches-by-service-category` — seed rule scoped to CAT_A. Call for CAT_A. Assert match. Call for CAT_B. Assert `null`.
3. `matches-by-time-window` — seed rule active 18:00–22:00. Call at 19:00. Match. Call at 23:00. `null`.
4. `matches-by-day-of-week` — seed rule for `daysOfWeek:[5,6]` (Fri/Sat). Call on Saturday. Match. Call on Wednesday. `null`.
5. `respects-priority` — seed two overlapping rules, priority 100 and 50. Assert higher-priority wins.
6. `ignores-inactive-rules` — `is_active:false`. Assert `null`.
7. `respects-service-area-scope` — rule scoped to AREA_A. Address in AREA_A → match. Address in AREA_B → `null`.

---

### 4. `packages/api/src/services/booking/from-quote.service.ts`

**Responsibility:** create a booking from an accepted provider quote. Used when subcategory has `pricing_type === 'quote'`. Quote's `amount_cents` is the canonical price; client may not override.

**Public function signatures:**
```ts
export async function createBookingFromQuote(quoteId: string, customerId: string): Promise<{
  bookingId: string;
  pricing: ResolvedPricing;
}>;
```

**Validators consumed:** `acceptQuoteSchema` (new — small schema with just `quoteId: z.string().uuid()`).

**DB tables read:**
- `provider_quotes` — id, customer_id, provider_id, subcategory_id, amount_cents, expires_at, status

**DB tables written:**
- `bookings` (insert) — service_price_cents from quote, total_amount_cents computed
- `provider_quotes` (update) — status → 'accepted'
- (in transaction with D06) `notifications`, `audit_log`

**Bugs closed:** Bug 175 (the quote-path that previously trusted `servicePrice` now uses `quote.amount_cents`).

**Errors thrown:**
- `quote_invalid` (404) — quote not found, expired, not in 'sent' status
- `quote_not_for_user` (403) — `customer_id` mismatch
- `quote_subcategory_pricing_mismatch` (400) — quote belongs to a non-quote subcategory (defensive)

**Test cases (in `packages/api/__tests__/services/booking/from-quote.service.test.ts`):**
1. `bug-175-uses-quote-amount-not-client` — seed quote ₱2000. Create booking. Assert `bookings.total_amount_cents` reflects ₱2000 + fees, never `req.body.servicePrice`.
2. `rejects-expired-quote` — `expires_at` in past. Assert rejection.
3. `rejects-other-customer-quote` — customer_id mismatch. Assert 403.
4. `rejects-already-accepted-quote` — `status: 'accepted'`. Assert rejection (no double-booking from one quote).
5. `transitions-quote-status-to-accepted` — confirm the quote's status updates inside the same transaction as the booking insert.

---

## Migration 073 — service-area CHECK constraints (exact SQL)

Path: `packages/api/migrations/073_service_area_bounds_check.sql`

```sql
-- Phase 14 Dispatch 05 — Bug 320 + Bug 322 fix.
-- Service-area lat/lng/radius/min-providers are now constrained to sane
-- Philippine geographic bounds at the database level. Defense-in-depth:
-- the Zod validator at packages/api/src/validators/admin/service-area.validator.ts
-- rejects out-of-bounds at the API layer; this migration is the database
-- backstop in case the validator is ever weakened or bypassed.
--
-- Bounds rationale:
--   - Latitude 4.5..21.5 covers the entire Philippine archipelago
--     (Tawi-Tawi at ~4.4°N, Batanes at ~21.1°N, slight buffer for accuracy).
--   - Longitude 116..127.5 covers it East–West (Palawan ~117°E,
--     Davao Oriental ~126.6°E).
--   - radius_km 1..100 — anything below 1 km is operationally unviable
--     (smaller than a single barangay); anything above 100 km is bigger
--     than most cities (Metro Manila is ~50 km wide); operator typo guard.
--   - min_providers_to_launch 1..50 — service area can't launch with 0
--     providers; >50 is unrealistic for any single area at v1 scale.
--
-- Existing data: the only seeded service-area row at the time of this
-- migration is Boracay (lat 11.9694, lng 121.9272, radius ~10 km).
-- That row passes all four constraints. Verify with the smoke test
-- packages/api/__tests__/migrations/073-service-area-bounds.test.ts.

ALTER TABLE service_areas
  ADD CONSTRAINT center_lat_in_ph CHECK (center_lat BETWEEN 4.5 AND 21.5),
  ADD CONSTRAINT center_lng_in_ph CHECK (center_lng BETWEEN 116 AND 127.5),
  ADD CONSTRAINT radius_km_sane CHECK (radius_km BETWEEN 1 AND 100),
  ADD CONSTRAINT min_providers_sane CHECK (min_providers_to_launch BETWEEN 1 AND 50);
```

**Migration test signature** (`packages/api/__tests__/migrations/073-service-area-bounds.test.ts`):

1. **Migration applies cleanly** — after running migrations, `\d service_areas` shows the four constraints.
2. **Existing Boracay row passes** — `SELECT * FROM service_areas WHERE slug='boracay'` returns the row (no constraint violation on existing data).
3. **INSERT with lat=200 rejected** — `INSERT ... (center_lat=200, ...)` throws `check_violation` referencing `center_lat_in_ph`.
4. **INSERT with lng=-500 rejected** — same shape, references `center_lng_in_ph`.
5. **INSERT with radius_km=200 rejected** — `radius_km_sane`.
6. **INSERT with min_providers_to_launch=0 rejected** — `min_providers_sane`.
7. **Down migration** — drop the four constraints; INSERTs with bad values now succeed (proves the constraints were the only safeguard at DB level).

---

## Gate promotion (LAST subtask, ordering matters)

`scripts/gates/MODES.json` change — promote `gate_a_fragments.a-cross-source-no-client-money` from REPORT to BLOCKING:

```diff
 "a-cross-source-no-client-money": {
-  "mode": "REPORT",
+  "mode": "BLOCKING",
   "owning_dispatch": "D05",
-  "promoted_in": null,
-  "rationale": "Bug 175/176/208/261 — server validators accept money fields. Owned by D05 (Money trust closure). Promotes to BLOCKING after D05."
+  "promoted_in": "D05",
+  "rationale": "Promoted to BLOCKING in D05 — every server validator now uses the server-canonical pricing pattern. Any future PR that introduces a `servicePrice: z.number()` (or similar money-from-client) in a Zod validator fails this gate. Allowed exceptions are explicit (e.g., adminWalletAdjustmentSchema, createAddonSchema) and listed in the gate's grep -v exclusion list."
 }
```

`scripts/gates/EXPECTED-FAILURES.md` — move `a-cross-source-no-client-money.sh` from "expected to fail" to "now passing." Move the timeline-summary D05 row to past tense.

**ORDERING NOTE (CRITICAL):**
- This MUST be subtask 16, AFTER all bug-fix subtasks land.
- Reason: promoting the gate to BLOCKING while the validators still have `servicePrice: z.number()` etc. means the dispatch's own PR fails Gate A, and `enforce_admins=true` blocks the merge.
- Verify before promoting: `bash scripts/gates/a-cross-source-no-client-money.sh` exits 0 locally on this branch.

---

## Cross-cutting concerns

### Files D02 admin-editor work also touched (rebase-risk-flag)

D05 touches admin pages: `apps/admin/src/pages/CatalogPage.tsx` (Bug 266), `apps/admin/src/pages/PricingRulesPage.tsx` (Bug 269), `apps/admin/src/pages/PromosPage.tsx` (Bug 261). Check each against D02's diff (`git log --oneline 0e6258d..6959349 -- apps/admin/src/pages/`) to see if D02 touched them. Likely overlap on `CatalogPage.tsx` (D02 Part 1 cancellation policy admin-editor) — confirm the addon modal area is untouched. If conflict, resolve by integrating both: the cancellation-policy editor is a separate section from the addon modal, so they should coexist.

`apps/mobile/app/customer/booking/checkout.tsx` was touched by D04 (SiguradoShield trademark strip) AND will be touched again in D05 (promo input rewiring + escrow line preserved from D04). Read the current state from master before editing.

`apps/mobile/app/customer/help.tsx` and `terms.tsx` were touched by D02 (cancellation policy live-fetch) AND D04 (SiguradoShield FAQ removal + section 6 retitle). D05 may NOT need to touch them — Bug 261 promo input is in `checkout.tsx`, not help/terms. Verify.

`packages/api/src/routes/admin/promos.ts` — D05 rewrites the create endpoint to use the new validator. If D02 touched this file (it didn't per memory but verify), reconcile.

### New configurable things — admin-editable per D02 doctrine

D05 introduces these tunables. Each should be admin-editable via existing `platform_settings` rows (with admin UI in `/admin/settings`):

- `tip_max_amount_cents` (Bug 417) — already in defaults at ₱5,000. Add seed row to migration 050-style if not present (a NEW migration if 050 is sealed). Surface in admin settings page if not already.
- `addon_price_max_cents` (Bug 266) — currently hardcoded at ₱50,000 in the new validator. Add a setting row `addon_price_max_cents` defaulting to `5_000_000`; the validator reads it via `getSettingNumber`.
- Pricing rule `multiplier` bounds (Bug 269) — currently `1.0..5.0` in the validator. Add settings `surge_multiplier_min` (default `1.0`), `surge_multiplier_max` (default `5.0`); validator reads them.
- Pricing rule `platformSurgeShare` (Bug 269) — `0..1` is mathematical, not a tunable. Hardcode in validator with comment.
- Service-area bounds (Bug 320/322) — PH geographic bounds are physical constants, not tunable. Hardcode + DB CHECK constraint.
- Provider service price min/max (Bug 1230) — already keyed off `subcategories.min_price_cents` / `max_price_cents` columns; admin-editable via the catalog admin page (D02 may have already wired this).

Adding the 3 new tunables (`addon_price_max_cents`, `surge_multiplier_min`, `surge_multiplier_max`) should be done in a new migration 074 (or fold into the existing migration 073 file as a UNIQUE-keyed section if your convention prefers one migration per dispatch — look at how D02 handled migration 072 for the cancellation policy seed rows).

### File-rename gotcha

After D04, the customer safety screen lives at `apps/mobile/app/customer/safety-and-support.tsx`, not `safety.tsx`. The Routes registry already points to `/customer/safety-and-support`. D05 doesn't touch the safety screen but verify any test setup that references the safety route is consistent.

---

## Definition of Done (D05 closeout passes Gate B + audit chain)

1. All 12 bugs above have a closing commit with `Bug NNNN` in the message AND a test in `packages/api/__tests__/` (or `apps/mobile/__tests__/`) that references the bug number.
2. The 4 new service files exist with their test files; tests run against real seeded DB rows (not mocks).
3. Migration 073 is applied; the migration test passes.
4. Gate `a-cross-source-no-client-money` is BLOCKING in MODES.json AND passing locally on this branch.
5. All 5 gates pass on the open PR: A, B, C, D, E + gates-summary.
6. Honesty check at end of closeout includes 3 attack scenarios manually traced (per standing instruction §3).
7. The 3 new admin-editable settings (`addon_price_max_cents`, `surge_multiplier_min`, `surge_multiplier_max`) are seeded via migration AND surfaced in the admin settings page.
8. `LAUNCH-LIMITATIONS.md` gets a §24 entry documenting the gate promotion + the new admin-editable settings.

---

## Notes for fresh session

- D03 + D04 are merged. Branch protection is restored. Self-merge pattern (atomic relax-merge-restore) is documented; `/tmp/relax.json` and `/tmp/restore.json` may not exist in the fresh session — recreate from `D01-final-closeout.md` if needed.
- D05 own gates may take time to design well. Don't rush. The pricing.service is the architectural pattern; building it carefully pays off across 5 of the 12 bugs.
- If the spec is ambiguous on a small detail (e.g., what error code to use), use the closest existing pattern in the codebase. Do not improvise architecture.
- The 5 hard stops still apply (verify-master non-zero ×3 attempts, architectural decision, money/compliance risk, production data risk, spec contradiction). The gate promotion ordering is the most likely place to halt.
- Open the D05 PR titled `Dispatch 05 — Money trust closure (8 client-money bugs + new gate promotion)`.
