# D13 — A/B testing and promo redemption decisions

Decision date: 2026-04-30
Decided by: Ken (per standing autonomous-mode authorization for marginal-scope deferrals; aligns with D04 Option A D04 precedent — features that look complete but aren't get pulled, not shipped half-done)

## Bug 44 — Promo codes
Choice: **Pull for v1.0**
Reason: No marketing campaigns planned for v1.0. Adding redemption
without first running real campaigns means we'll ship code that's
exercised only by tests, not by customers. v1.1 wires when first
campaign is ready.
Implementation: hide promo input from `apps/mobile/app/customer/booking/checkout.tsx`. Add admin banner on Marketing → Promo Codes tab explaining unwired state. Add LAUNCH-LIMITATIONS §30.

## Bug 45 — A/B testing
Choice: **Pull for v1.0**
Reason: Same logic as promo. Without real experiments running, the
assignment infrastructure is dead code. v1.1 wires when first
experiment is designed (e.g., onboarding flow A/B).
Implementation: hide A/B Tests admin tab from `apps/admin/src/pages/AnalyticsPage.tsx`. Add LAUNCH-LIMITATIONS §31.

## Mechanism

Server-side `platform_settings` rows with keys:
- `feature_flag.promo_redemption_enabled` (default `false`)
- `feature_flag.ab_testing_enabled` (default `false`)

Client (mobile + admin) reads via `useFeatureFlags()` hook. v1.1 toggles via admin dashboard once redemption + A/B assignment services are wired.

This matches the D04 Option A Option A pattern from D04 — pull the feature visually but keep the database tables / admin CRUD in place so v1.1 doesn't have to recreate them.
