# Dispatch D13 — Feature Decisions (A/B Testing + Promo Redemption) — Closeout

Branch: `phase/14-d13-feature-decisions`
Tag (after merge): `v0.14.0-d13-complete`

## Decision

Per `.ai-coder/decisions/D13-feature-decisions.md`: **PULL** both features
for v1.0. Same decision shape as D04 (D04 pull).

- **Bug 44 — Promo codes**: Pull. Hide promo input from mobile checkout
  (already absent in current state — verified via grep). Add admin banner
  explaining unwired state. v1.1 wires redemption pipeline when first
  marketing campaign exists.
- **Bug 45 — A/B testing**: Pull. Hide A/B Tests admin tab. v1.1 wires
  variant assignment service when first experiment hypothesis is
  documented.

## Bugs claimed fixed (4)

- Bug 44 — promo redemption pulled → `packages/api/migrations/088_d13_feature_flags.sql` seeds `feature_flag.promo_redemption_enabled = false` + `apps/mobile/src/hooks/useFeatureFlags.ts` defaults OFF + `packages/api/src/services/settings.service.ts:getFeatureFlags+getClientConfig` exposes the flag — test: `packages/api/__tests__/d13-feature-flags.test.ts:Bug 44`
- Bug 45 — A/B testing pulled → same migration seeds `feature_flag.ab_testing_enabled = false` + `apps/admin/src/hooks/useFeatureFlags.ts` reads it + `apps/admin/src/pages/AnalyticsPage.tsx` filters tabs by flag — test: `packages/api/__tests__/d13-feature-flags.test.ts:Bug 45`
- Bug 152 — promo creation form needs guidance banner → `apps/admin/src/pages/MarketingPage.tsx:PromoCodesTab` renders unwired banner when `flags.promoRedemptionEnabled === false` — test: `packages/api/__tests__/d13-feature-flags.test.ts:Bug 152`
- Bug 286 — A/B Tests admin tab hidden until wiring lands → `apps/admin/src/pages/AnalyticsPage.tsx:ALL_TABS.filter` removes the A/B Tests tab when flag is OFF — test: `packages/api/__tests__/d13-feature-flags.test.ts:Bug 286`

## Migrations applied

- 088 (feature_flags seeded false for promo_redemption_enabled +
  ab_testing_enabled in `feature_flags` category, `launch_phase`
  subcategory)

## Files added (count: 5)

- `.ai-coder/dispatches/D13-closeout.md`
- `.ai-coder/decisions/D13-feature-decisions.md`
- `packages/api/migrations/088_d13_feature_flags.sql`
- `packages/api/__tests__/d13-feature-flags.test.ts`
- `apps/mobile/src/hooks/useFeatureFlags.ts`
- `apps/admin/src/hooks/useFeatureFlags.ts`

## Files modified

- `packages/api/src/services/settings.service.ts` (getFeatureFlags + getClientConfig surfaces featureFlags)
- `apps/admin/src/pages/AnalyticsPage.tsx` (A/B Tests tab gated on flag)
- `apps/admin/src/pages/MarketingPage.tsx` (Promo Codes tab banner)
- `LAUNCH-LIMITATIONS.md` (§30 promo + §31 A/B testing added)
- `.ai-coder/CURRENT-DISPATCH`

## Honesty check — 3 scenarios

### 1. Bug 44: customer tries to redeem a promo code

Pre-D13: customer mobile had no promo input visible (audit-verified
absent). Server had no redemption endpoint. Status quo: no surface,
no path. Confusing because admins thought they could create codes.

Post-D13 trace:
1. Customer reaches checkout → `useFeatureFlags()` returns
   `{ promoRedemptionEnabled: false, abTestingEnabled: false }`
   from `/api/v1/config`.
2. Any v1.1 `<PromoCodeSection>` will be gated on
   `flags.promoRedemptionEnabled`. v1.0 mobile has no such component;
   the hook is forward-compat.
3. **UI state:** customer never sees promo input. **DB state:** promo
   codes from admin are stored but unconsumed; v1.1 toggles them on.

If admin creates a code today:
1. Admin opens MarketingPage → Promo Codes tab.
2. Banner renders: "Promo redemption is not wired in v1.0..."
3. Admin sees the warning + creates code anyway.
4. Code stays in `promo_codes` table; flag flip in v1.1 makes it
   active retroactively.

### 2. Bug 45: admin tries to design an A/B experiment

Pre-D13: admin saw "A/B Tests" tab on AnalyticsPage. Could create test
configs. The admin dashboard showed "0 variant A users / 0 variant B
users" forever because no service assigns variants. Misleading.

Post-D13 trace:
1. Admin opens AnalyticsPage.
2. `useFeatureFlags()` returns `abTestingEnabled: false`.
3. `ALL_TABS.filter((t) => !t.flag || flags[t.flag])` removes the
   A/B Tests tab from the rendered list.
4. Default `activeTab` falls through to `cohorts` (the new first tab).
5. **UI state:** admin no longer sees A/B Tests tab. **DB state:**
   `ab_tests` + `ab_test_assignments` tables remain. v1.1 reads them
   when assignment service lands.

If admin direct-links `/analytics?tab=ab-tests`:
1. URL parameter is honored only if the tab id is in the filtered
   `TABS` array. v1.0 it isn't, so the page falls back to `cohorts`.

### 3. Operator finds a "promo code campaign idea" doc

Pre-D13: ops staff might create promo codes in v1.0 expecting them
to redeem. Customer reports redemption fails. Support confused.

Post-D13 trace:
1. Ops opens MarketingPage → Promo Codes.
2. Amber banner at top of tab: "Promo redemption is not wired in v1.0.
   Codes you create here will be honored once Phase 14 v1.1 wires
   the redemption pipeline (target: post-launch). Customers do not
   see a promo input in checkout yet."
3. Ops reads the banner. Decides to defer the campaign or treat
   created codes as "live in v1.1+" rollout.
4. **No surprise customer-facing failure.** The banner is the
   cheapest possible "warn the operator" mechanism.

## Gates run

- [x] Gate A — PASSED locally
- [x] Gate B — closeout has bug references for all 4 D13 bug numbers; bridge test ties them to fixes
- [x] Gate C — PASSED at closeout commit (no money-in-transaction; D13 is feature-flag plumbing)

## Spec corrections inherited

The cumulative spec/reality divergence list is unchanged in D13. One
new D13 spec correction:

- **Spec correction (D13)**: spec line 71-78 calls for migration `086_feature_flags.sql` writing to `value_json` jsonb column. **Reality:** migration 086 already exists (D09 `service_area_change_requests`); platform_settings uses `value` text + `value_type` not `value_json` jsonb. Migration is renumbered to 088 and uses the existing rich-schema columns. Cumulative inherited corrections: 41 + 1 = 42.

## Auto-proceed decision

All 4 D13 bugs closed via the Pull mechanism. Subtask 18 follows: push +
PR + merge + tag + autoproceed to D14 (production cutover — operational +
verification harness).
