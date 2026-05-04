# Phases 63–69 — Continuation deep audit pass (2026-05-05)

7 more phases of source-level deep auditing, focused on areas the
earlier 38–62 sweep audited shallowly or skipped: auth flows, the
five tab screens, mobile service-layer alignment, Phase 14 R5
component wiring, the provider job detail flow, customer browse
flows, and pre-existing API type errors.

**This continuation: 12 real bugs found and fixed, 124 cumulative
since Phase 17.**

## Phase-by-phase breakdown

| Phase | Scope | Bugs |
|---|---|---|
| 63 | Auth: login, register, otp-verify, customer/booking checkout | 1 |
| 64 | Tabs: customer home, customer profile, provider dashboard, provider jobs, provider earnings | 5 |
| 65 | Service-layer alignment (messaging, suki, tip, rebooking, pricing, booking-photo) | 0 |
| 66 | Phase 14 R5 component wiring (FilterModal, CommissionBreakdown, etc.) | 0 (covered by 64) |
| 67 | Provider job detail (job/[id], checklist, complete) | 3 |
| 68 | Customer browse flows (category, configure, confirm, safety-and-support) | 0 |
| 69 | Pre-existing API type-check errors from Phase 36 | 3 |
| **Total** | | **12** |

## The 12 bugs

### Phase 63 — auth flows
- **BUG-PHASE63-01** — Login + register + checkout had plain-text
  "Terms of Service and Privacy Policy". Users were "agreeing"
  without any way to read what they were agreeing to. Now tappable
  links pushing to `/customer/terms` with `?tab=privacy` deep-link
  support.

### Phase 64 — tab screens
- **BUG-PHASE64-01** — Customer home "Quick Re-book" pushed to the
  booking form with no category context (silent fail when
  subcategoryId was null). Now sets the booking-store category from
  the cached categories list and navigates to the category screen.
- **BUG-PHASE64-02** — Provider dashboard notification bell had no
  unread count badge. Customer side already had one — mirrored that.
- **BUG-PHASE64-03** — Provider Jobs `FilterModal` was rendered with
  no UI element to open it (Phase 14 R5 dead-wire), and even captured
  `advancedFilters` were discarded. Wired a Filter icon trigger and
  applied the filters client-side (the bookings API doesn't accept
  sort/period params).
- **BUG-PHASE64-04** — Earnings `CommissionBreakdown` lines used
  `(1 − commRate)` as the denominator while gross used
  `(1 − commRate − guarRate)`. The displayed lines didn't sum to
  `gross − net`. Now both use the same denominator so the breakdown
  is internally consistent.
- **BUG-PHASE64-05** (CRIT-80 from 2026-05-01 audit) — Profile menu
  "Notification Settings" routed to `Routes.CUSTOMER.SETTINGS =
  '/customer/settings'`, but no such file exists. Repointed to
  `/customer/notification-settings`, which is the actual screen.

### Phase 67 — provider job detail
- **BUG-PHASE67-01** — Provider cancel mutation hardcoded the reason
  "Provider cancelled" without ever asking the provider why. Customer
  side captures reason via inline form; mirrored that pattern on
  provider side so the captured text reaches the server (and the
  customer's booking detail).
- **BUG-PHASE67-02** — Provider checklist `capturePhoto` saved only
  the local `file://` URI, never uploaded. Photos vanished on screen
  unmount; customer's mirror checklist + dispute audit trail saw
  nothing. Now uploads to `/api/v1/uploads/booking-photo` with
  `photoType='checklist'` (the canonical Phase 14 D07 endpoint).
- **BUG-PHASE67-03** — Provider job/complete `CommissionBreakdown`
  rendered with hardcoded `gross=0/amount=0/net=0` + literal `12%`
  pct — pure dead-wire. Now fetches the booking's servicePrice +
  the provider's tier and computes real commission/net.

### Phase 69 — pre-existing API type errors (Phase 36 introduced)
- **BUG-PHASE69-01** — `admin-latent.routes.ts:172/173` — `raw` was
  typed `T | undefined` after a length-zero check; TS couldn't narrow.
  Non-null assertion (the surrounding throw guarantees length > 0).
- **BUG-PHASE69-02** + **03** — `booking-offer.service.ts:173/236` —
  callback was annotated as `PoolClient`, but `db.transaction` wraps
  the client in a narrower shape exposing only `.query`. Removed
  annotation; TS infers correctly. Two call sites, two fixes.

## Verification at end of pass

- **101/101** admin Vitest DOM tests pass
- **400 / 491** mobile Jest tests pass (91 todo — same baseline)
- **`npx tsc --noEmit` clean** for admin, api, and mobile packages
- **3 commits**, all atomic, all with co-author attribution
- **Zero regressions** detected at any phase boundary

## Cumulative since Phase 17

- **124 real bugs found + fixed** total (112 prior + 12 this
  continuation)
- **9 migrations** (none new in 63–69)
- All assertion totals from Phase 62 still apply

## Patterns observed

The same bug families that surfaced in Phases 38–62 keep showing up:

1. **Phase 14 R5 dead-wires** — components imported and rendered
   but never actually triggered or fed real data. Found 2 more
   (FilterModal in jobs.tsx, CommissionBreakdown in
   complete.tsx).
2. **Hardcoded values masquerading as live** — placeholder zeros,
   hardcoded reasons, hardcoded percentages.
3. **Plain-text legal references** — agreement language without
   tappable links to actual documents.
4. **Capture-but-discard** — UI captures user input (filters,
   reasons, photos) that never reaches the server.
5. **Status / value mismatch between screens** — customer side
   captured reason; provider side hardcoded it.
6. **Math inconsistencies** — gross used one denominator, the
   commission lines used another.

## What's still genuinely outstanding

Same as the Phase 62 closeout — the application-level gates per
CLAUDE.md remain unchanged:

1. F#3 + F#4 baseline capture — F#4 done; F#3 blocked on simulator
2. F#10 attorney-reviewed disclaimer wording
3. 12 D14 operational items

Plus the v1.1+ candidates documented in PHASES-38-62-FINAL.md
(surge preview, native pickers, full pagination, etc.). The
"Book this Provider" CTA in `customer/provider/[id].tsx` was
identified as a v1.1+ candidate during Phase 66 — it pushes to
the booking form with `?providerId=` but neither the form nor the
`createBooking` payload accept that parameter. Fixing it properly
requires server changes (adding `requestedProviderId` to the
matching service); flagged but not fixed.

The methodology proved out for a 7-phase continuation: 12 more
real bugs in screens that earlier phases had marked "audited".
The audit recipe should be re-runnable on the same codebase in
6 months and still surface this kind of finding.
