# Round-2 Forensic Audit — Remediation Summary

**Date:** 2026-06-06
**Master HEAD at handoff:** `8d8391e` (local = GitHub = server all aligned)
**Live staging:** API https://api.onservice.ph (healthy), web app https://app.onservice.ph (entry-5aed2e3f), admin https://admin.onservice.ph

All work below is committed to master, pushed to GitHub, and deployed to the
staging server. Full API suite (262 suites / 2898 tests) and full mobile suite
(158 suites / 664 tests + 91 todo) are green at this HEAD.

## Done (landed + tested + deployed)

| Item | Status | Notes |
|---|---|---|
| **A1** prod guard for ADMIN_DISABLE_2FA | ✅ | `boot-guards.ts` throws at boot if flag set + NODE_ENV=production. 10 tests. Deployed (staging unaffected — it runs NODE_ENV=staging). |
| **A2** mobile error boundary | ✅ | `ErrorBoundary.tsx` wraps the root; themed fallback + "Try again" + Sentry report. 4 real RTL tests. |
| **A3** mount toast renderer | ✅ | `<ToastProvider/>` mounted in `_layout.tsx`. 3 real tests. First live use is the addresses screen (A7). |
| **A4** atomic refunds | ✅ | refund balance check moved INSIDE the txn under `FOR UPDATE` (double-refund rejected). Did NOT add a held→refunded guard — it would break dispute partial refunds (callers own escrow_status). |
| **A5** wallet row-locking | ✅ | `lockWalletsForUpdate()` locks rows in id order (deadlock-free) in all escrow money txns. |
| **A6** KYC protection (verify only) | ✅ PASS | Owner+admin authenticated proxy, permission-checked, short-lived presigned URLs. Live: /uploads/onboarding 404, /kyc routes 401 no-auth. Report: `A6-kyc-protection-verification.md`. |
| **A8** dead folders + TODO triage | ✅ | Deleted empty `src/store/` (both apps). Triage: `A8-todo-triage.md` (only 1 real low-pri TODO). |
| **B2** inline checkout validation | ✅ | "select a payment method" → inline field error; "incomplete booking" → summary toast. No modal alerts. Real render test. |

## Partially done — remaining work for follow-up

### A7 — adopt shared UI kit across mobile screens (BIG: ~96 screens)
**Done (28 screens, tested + live — ~half the app). All named high-traffic targets + notifications, wallet, recurring, reviews, suki (x2), referral, data-rights, search, category browse, provider profile, portfolio, services, certifications, tier-progression, team, customer+provider account-management, provider dashboard:**
- `customer/addresses` — Skeleton + EmptyState + ErrorState + OptimizedList + toast feedback (first live exercise of the A3 toast).
- `(tabs)/bookings` — Skeleton + ErrorState + EmptyState (kept the tuned FlatList + PaginationLoader; OptimizedList would clobber the pagination footer).
- `(tabs)/home` — top-level loading→Skeleton, categories-error→ErrorState.
- `(provider-tabs)/jobs` — ErrorState + SkeletonCard + per-filter EmptyState.
- `(provider-tabs)/earnings` — ErrorState + SkeletonCard + EmptyState (tx list).
- `provider/payouts` — ErrorState + SkeletonCard + EmptyState.
- `customer/booking/[id]` — Skeleton + ErrorState; cancel success/error → toast (confirm stays a ConfirmModal).
- `provider/job/[id]` — Skeleton + ErrorState; status/cancel/maps feedback → toast (action confirm stays an Alert dialog).
- `customer/notifications` + `provider/notifications` — SkeletonCard + ErrorState + EmptyState.
- `(tabs)/wallet` — SkeletonCard + ErrorState + EmptyState (filter-aware).
- `customer/recurring/index` — SkeletonCard + ErrorState + EmptyState (Browse Services CTA).
- `provider/reviews` — SkeletonCard + ErrorState + EmptyState; response feedback → toast.
- `customer/suki-pros` + `provider/suki-customers` — Skeleton/Error/Empty; redeem feedback → toast.
- `customer/referral` — Skeleton/Error; redeem + copy feedback → toast.
- `customer/data-rights` — Alert.alert → toast (form screen, no primary load state).
- `customer/search` — Skeleton/Error; no-results EmptyState (Browse Categories CTA).

- `customer/category/[id]` — Skeleton/Error/Empty (Browse Other Categories CTA).
- `customer/provider/[id]` — Skeleton/Error; not-found EmptyState.
- `provider/portfolio` + `provider/certifications` — Skeleton/Error/Empty; add/update/remove + upload/permission feedback → toast (kept picker chooser + remove/validation dialogs).
- `provider/services` — Skeleton/Empty (Add Your First Service CTA); add/remove → toast.

Also added `SectionList` + `Animated.spring` stubs to the shared react-native test mock (they were missing), which un-blocked several previously-todo screen tests.

Tests: real render tests for `customer/addresses` and `(provider-tabs)/jobs` kit states; real render tests replaced the PHASE170/177/173 source-regex empty-state tests (bookings/wallet/recurring). Each batch ran the full mobile suite green (159 suites).

**Remaining A7 (~50 screens, long tail, lower-traffic):** settings, profile, onboarding steps (documents/selfie/service-area), chat, search, category browse, suki lists, provider profile/services/portfolio/certifications/availability/calendar/schedule/team/tier-progression/dashboard, customer account-management/referral/data-rights/wallet-topup, staff screens, and the booking sub-flows (pay/configure/tip/confirm/dispute/quotes/etc.). Same recipe as the 13 done. Note: many of these use ActivityIndicator only as a localized action/submit spinner (not a full-screen load), so for those the A7 change is just swapping any error/empty branches + success/error alerts → toast, not necessarily a Skeleton.

**Remaining:** the rest of the ~96 screens. **Recipe per screen (use the 3 done as templates):**
1. `import { SkeletonCard/Skeleton, EmptyState, ErrorState, OptimizedList } from '@/components/ui'` and `import { showToast } from '@/lib/toast'`.
2. bare `<ActivityIndicator>` loading → `<SkeletonCard/>`s (or `<Skeleton/>` bars).
3. "no data" branch → `<EmptyState title/description/actionLabel/onAction>`.
4. error/catch branch → `<ErrorState message onRetry>`; transient → `showRetryableToast(msg, retryFn)`.
5. `Alert.alert('Saved'|'Success'|'Updated'|'Removed'|…)` → `showToast(msg, 'success')`; error alerts → `showToast(msg, 'error')`.
6. naive long list (`FlatList`/`ScrollView`+`.map`) → `<OptimizedList>`. **Caveat:** if the list already has a custom footer/pagination loader, keep the FlatList (OptimizedList sets its own ListFooterComponent).
7. Keep critical confirmations (Log out?, Cancel booking?, payment-failure, delete) as modals/ConfirmModal.
8. Add a real render test per screen asserting the new states (see `__tests__/screens/customer-addresses-a7.test.tsx`).

Highest-value next screens (audit's list): `customer/booking/[id]` (detail), provider `(provider-tabs)/jobs`, provider `job/[id]`, `(provider-tabs)/earnings`, provider `payouts`. NOTE: `customer/payment-methods` is a static info screen (no data states) — not an A7 target.

### B1 — accessibility pass (BIG: ~96 screens) — NOT STARTED
Add `accessibilityLabel` + `accessibilityRole` to interactive elements; icon-only
buttons get an action label ("Send message", not "icon"). The shared kit
components (EmptyState/ErrorState/Toast/Button/StatusBadge) already carry a11y
props, so A7 adoption lifts coverage for free on every list/empty/error view —
do B1 after A7 to avoid re-touching screens. Work in ~10-screen batches; report
before/after coverage.

### B3 — home.tsx complexity / first-load — partially addressed
- (b) first paint not blocked on all 7 queries — **already true** (full-screen gate is only on `categoriesQuery`; other sections render as data arrives).
- (c) no VirtualizedList-in-ScrollView warning — **already true** (root is a vertical FlatList; inner promo/suki/recent lists are horizontal carousels — the RN-blessed pattern).
- (a) extract the 912-line file into named section components — **DEFERRED.** Pure maintainability (no bug). Risky to rush a rewrite of the most-used screen; recommend a dedicated session: extract `HomeHeader`, `ActiveBookingsSection`, `PromosCarousel`, `SukiSection`, `RecentBookingsSection` into `src/components/home/` (new folder — needs Ken's OK per CLAUDE.md), threading props + moving styles, with the existing home render test as the regression guard.

## Needs Ken / out of my scope
- **F#10 legal disclaimer wording** (the `safety-and-support.tsx` TODO) — interim wording is live + CI-guarded; final wording needs an attorney. Already tracked in `.ai-coder/decisions/D14r-10-legal-disclaimer.md`. Not a code fix.
- **C1 production posture:** the A1 guard now *forces* the decision — before any real production deploy, `ADMIN_DISABLE_2FA` must be unset (restores TOTP) or SMS/email admin 2FA built (your stated preference). The staging box keeps the flag on for testing.
