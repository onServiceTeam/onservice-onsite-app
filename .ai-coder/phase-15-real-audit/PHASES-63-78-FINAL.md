# Phases 63–78 — Continuation deep audit pass (2026-05-05)

16 more phases of source-level deep auditing, focused on areas the
earlier 38–62 sweep audited shallowly or skipped: auth flows, the
five tab screens, mobile service-layer alignment, Phase 14 R5
component wiring, the provider job detail flow, customer browse
flows, pre-existing API type errors, customer + provider account
management, the customer quote-request flow, provider photo
aggregation, recurring-booking defaults, suki redeem state desync,
customer tip max-amount gating, admin Platform Settings reset
confirmation, customer booking-detail photos gate, provider
Navigate-to-Job customer-name display, admin DispatchConsole
cancel reason min length, and a sweep of 22 stale API tests
across 8 suites that had drifted out of sync with code changes
landed in Phases 26-29.

**This continuation: 24 real bugs found and fixed + 22 stale
tests repaired, 136 cumulative bugs since Phase 17.**

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
| 76 | Customer booking-detail photos gate (legacy-only check) | 1 |
| 77 | Provider Navigate-to-Job customer-name display | 1 |
| 77b | Admin DispatchConsole cancel reason min length | 1 |
| 78 | API test repair: 22 stale tests across 8 suites | (test fixes, not source bugs) |
| **Total** | | **24 bugs + 22 test fixes** |

## The 24 bugs

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

### Phase 76 — customer booking-detail photos gate
- **BUG-PHASE76-01** — Customer `booking/[id].tsx` `hasPhotos`
  flag (gates the "View Job Photos" button) only checked the
  deprecated TEXT[] arrays from migration 037. Phase E CRIT-102
  made provider completion + Phase 67-02 made provider checklist
  upload via the canonical `/uploads/booking-photo` endpoint
  (writes ONLY to `booking_photos`, not the legacy arrays). So a
  customer whose provider used the new flow saw NO entry point to
  their job photos. Same dual-source pattern as Phase 71-03 and
  Phase 56 — now also queries `listBookingPhotos` and ORs the
  count into `hasPhotos`.

### Phase 77 — provider Navigate-to-Job customer-name display
- **BUG-PHASE77-01** — Provider `provider/job/[id]/navigate.tsx`
  read `booking?.providerName` first ("legacy alias" comment) and
  fell back to a non-existent `customerName` via type assertion.
  But `providerName` on a /bookings/:id response is the PROVIDER's
  own name (the API joins providers→users to compute it). So the
  provider on Navigate-to-Job saw THEIR OWN name labeled as the
  customer contact. Worse: the booking returned no `customerName`
  at all because getBookingById and listBookings only joined
  providers/users for the provider side; users by customer_id was
  never joined. Fix: API getBookingById + listBookings JOIN users
  cu ON cu.id = b.customer_id and select customer_name;
  formatBookingResponse maps it; mobile Booking interface adds
  customerName?; navigate.tsx reads booking?.customerName directly.

### Phase 77b — admin DispatchConsole cancel reason min length
- **BUG-PHASE77-02** — Admin DispatchConsole cancel-booking dialog
  client-side validated reason ≥ 5 characters, but the server's
  cancelBookingAsAdmin (booking-admin.service.ts:839) requires
  ≥ 10 via `requireReason(reason, 10)`. A 6-9 char reason passed
  the client check, hit the server, and bounced with a generic
  400. Now: client matches server's 10-char floor so the dialog
  catches it with a clear toast before the round-trip.

### Phase 78 — API stale-test repair (no source bugs)
22 tests across 8 suites had drifted out of sync with source
changes landed in Phases 26-29. Source code was correct; the
mocks/assertions needed to be updated to reflect the new behavior.
Source files were NOT touched — only test files updated:

- `booking-dispute-admin.test.ts` (2): cancelBookingAsAdmin now
  SELECTs service_fee before the trx (BUG-PHASE26-01) for the
  post-commit PayMongo refund. Tests primed an extra mock.
- `escrow-async-integration.test.ts` (10): handleCancellation
  same service_fee SELECT. One assertion expected processRefund
  to never be called post MED-N27, but BUG-PHASE26-01 reintroduced
  a post-commit call (different code path). Stale assertion
  removed; substantive MED-N27 check (final UPDATE inside trx)
  preserved.
- `compliance-admin.test.ts` (4): VALID_CONSENT_TYPES tightened
  to migration-080 set. `marketing_email` → `marketing_consent`,
  `tos_acceptance` → `terms_of_service`.
- `catalog-business-helpers-med-n37-n38-n39-n40.test.ts` (1):
  Phase 28-02 changed users soft-delete from `deleted_at IS NULL`
  to `is_active = TRUE`. Pattern updated.
- `med-n100-n101-n103-n104-n105.test.ts` (1): BUG-PHASE26-02
  replaced `bq.is_active = TRUE` with `bq.status = 'accepted'`
  (migration 018). Pattern updated and slice widened from 2000
  → 3500 chars to capture the COALESCE line.
- `med-n134-n135-n136-n137.test.ts` (1): BUG-PHASE29-01 changed
  the existence check from `SELECT COUNT(*) FOR UPDATE` to
  `SELECT id ... LIMIT 1 FOR UPDATE`. Mocks return rows shape;
  assertion updated.
- `med-n27-n43-n44-n45-n61-n65-n70-n76-n162.test.ts` (2):
  handleCancellation regex required `db.transaction` immediately
  after the opener; BUG-PHASE26-01's pre-trx SELECT broke that.
  Relaxed to "somewhere in the function" while still anchoring
  to the function decl. Line-count threshold raised 50 → 120.
- `breach-log.service.test.ts` (1): hardcoded date
  `2026-04-30T08:00:00Z` became >72h in the past after 2026-05-04;
  enrichSla returned 0 and the `> 0` assertion failed. Use
  `new Date()` so the test stays valid as wall-clock advances.

## Verification at end of pass

- **101/101** admin Vitest DOM tests pass
- **400 / 491** mobile Jest tests pass (91 todo — same baseline)
- **2498 / 2498** API Jest tests pass (Phase 78 repaired 22 stale
  tests across 8 suites — see commit "fix: Phase 78 — repair 22
  stale API tests across 8 suites" for the breakdown)
- **`npx tsc --noEmit` clean** for admin, api, and mobile packages
- **15 commits**, all atomic, all with co-author attribution
- **Zero regressions** detected at any phase boundary

## Cumulative since Phase 17

- **136 real bugs found + fixed** total (112 prior + 24 this
  continuation)
- **9 migrations** (none new in 63–77)
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
