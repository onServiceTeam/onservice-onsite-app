# Phases 63–75 — Continuation deep audit pass (2026-05-05)

13 more phases of source-level deep auditing, focused on areas the
earlier 38–62 sweep audited shallowly or skipped: auth flows, the
five tab screens, mobile service-layer alignment, Phase 14 R5
component wiring, the provider job detail flow, customer browse
flows, pre-existing API type errors, customer + provider account
management, the customer quote-request flow, provider photo
aggregation, recurring-booking defaults, suki redeem state desync,
customer tip max-amount gating, and admin Platform Settings reset
confirmation.

**This continuation: 21 real bugs found and fixed, 133 cumulative
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
| 70 | Customer account-management — DSR data export download link | 1 |
| 71 | Customer job-request + provider photos | 3 |
| 71b | Customer make-recurring default day | 1 |
| 72 | Provider account-management — DSR data export download link | 1 |
| 73 | Customer suki-pros redeem button UI/state desync | 1 |
| 74 | Customer tip max-amount gating | 1 |
| 75 | Admin SystemSettings reset-to-default confirmation | 1 |
| **Total** | | **21** |

## The 21 bugs

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

### Phase 70 — customer account management (DSR compliance)
- **BUG-PHASE70-01** — Customer "Account & Data" → Recent Exports
  showed only the status pill + date. The `DataExportEntry` returns
  a signed `fileUrl` for the user to download their export, but
  the UI never rendered it. So users saw "completed" with no way
  to access the file — a hard NPC RA 10173 §22 compliance gap (the
  law guarantees the user a means to access their exported personal
  data). Now: a "Download" link opens the signed URL via Linking
  when status is completed, plus an "Expires …" hint.

### Phase 71 — quote flow + provider photos
- **BUG-PHASE71-01** — Customer `booking/job-request.tsx` Location
  showed "No address selected" with no UI to actually pick one.
  The quote-based subcategory flow resets the booking-store address
  (per `setSubcategory`), so a customer landing here from
  `/customer/category/[slug]` for a quote-based service had no
  address and the submit button silently disabled — they were stuck.
  Now the address card is tappable and routes to the address picker.
- **BUG-PHASE71-02** — Customer `job-request.tsx` accepted
  `budgetMin > budgetMax` silently. Now: client-side check + inline
  error message; submit disabled until min ≤ max (or both blank).
- **BUG-PHASE71-03** — Provider `job/[id]/photos.tsx` read
  `existingBefore` / `existingAfter` from the deprecated TEXT[]
  columns from migration 037. Phase E CRIT-102 made
  `provider/job/[id]/complete` upload "after" photos via the
  canonical `/uploads/booking-photo` endpoint (writes ONLY to
  `booking_photos`, not the legacy arrays), so completion-flow
  photos were INVISIBLE on this screen. Now also queries the
  `booking_photos` endpoint and unions+dedupes with the legacy
  arrays — same dual-source pattern as the Phase 56 customer fix.

### Phase 71b — make-recurring default day
- **BUG-PHASE71-04** — Customer `booking/make-recurring.tsx`
  defaulted `preferredDay` to `new Date().getDay()` (today's
  weekday). The user is making a SPECIFIC past booking recurring,
  so the natural default is the day-of-week the original booking
  was scheduled on (Tuesday cleaning → Tuesday recurring, not
  whatever weekday the user happens to view the screen on). Now
  syncs `preferredDay` to the original booking's scheduled weekday
  in a useEffect once the booking loads, while still respecting
  any manual override.

### Phase 72 — provider account-management (DSR compliance)
- **BUG-PHASE72-01** — Provider "Account & Data" → Recent Exports
  had the same NPC RA 10173 §22 compliance gap as BUG-PHASE70-01
  on the customer side. The signed `fileUrl` was returned but
  never rendered. Now: a "Download" link opens the URL via Linking
  when status is completed, plus an "Expires …" hint so the user
  knows the signed URL has a TTL. Both surfaces (customer +
  provider) now NPC-compliant.

### Phase 73 — suki redeem button UI/state desync
- **BUG-PHASE73-01** — Customer `suki-pros.tsx` Redeem button
  visual style used a hardcoded `Number(redeemInput) < 100` check
  while the actual `disabled` prop checked `<
  platformConfig.sukiMinRedeemPoints`. If the config min is set
  to anything other than 100 (e.g., 200 via the platform_settings
  admin), a user typing 150 would see the button visually enabled
  (150 > 100) but tapping it would be a no-op (disabled prop = true
  since 150 < 200). Now both use the same configurable threshold.

### Phase 74 — customer tip max-amount gating
- **BUG-PHASE74-01** — Customer `booking/tip.tsx` Send Tip button
  gated on wallet balance but NOT on max tip (= servicePrice / 100%
  cap). A user entering a custom tip larger than the service price
  saw the button visually enabled, tapped it, then got an alert
  "Tip Too Large". Same UI/state desync pattern as Phase 73 — the
  disabled prop should match the validation. Now: disabled gates on
  tip > maxTip too, plus an inline warning mirroring the wallet-
  insufficient hint.

### Phase 75 — admin Platform Settings reset confirmation
- **BUG-PHASE75-01** — Admin `SystemSettingsPage.tsx` "Reset to
  default" button was a one-click destructive action with no
  confirmation. These settings tune commission rates, escrow
  windows, fee caps — production money knobs that propagate within
  60s of save. A misclick on `commission_rate_elite` (e.g. currently
  9% via admin override, default 12%) silently rolls every elite
  provider to the default rate at their next payout, with only the
  hardcoded reason "Reset to default" recorded in the audit log —
  no context for ops post-mortems. Fix on three fronts: (1) admin
  UI now opens a confirm modal showing current → default values
  with a reason field; (2) `settings.service.ts` resetToDefault
  accepts an optional `reason` and prefixes it with "Reset to
  default:" in the audit row (existing test preserved as fallback
  when no reason supplied); (3) POST `/:key/reset` reads `reason`
  from req.body and passes it through.

## Verification at end of pass

- **101/101** admin Vitest DOM tests pass
- **400 / 491** mobile Jest tests pass (91 todo — same baseline)
- **116/116** API settings-service + settings-routes Jest tests pass
- **`npx tsc --noEmit` clean** for admin, api, and mobile packages
- **11 commits**, all atomic, all with co-author attribution
- **Zero regressions** detected at any phase boundary

## Cumulative since Phase 17

- **133 real bugs found + fixed** total (112 prior + 21 this
  continuation)
- **9 migrations** (none new in 63–75)
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
