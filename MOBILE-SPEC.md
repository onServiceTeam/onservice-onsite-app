# MOBILE-SPEC — Customer + Provider Apps

This document is the screen-by-screen reference for both apps. Total screens: 122 (83 currently built + 39 from Phase 09).

The codebase uses Expo SDK 55 / RN 0.83. iOS, Android, and Expo Web (for tablet/desktop browsing) all from one codebase.

---

## Customer App — 60 screens total

### Auth (4 screens)
- `auth/register.tsx` — phone + name + ToS acceptance
- `auth/otp-verify.tsx` — OTP input
- `auth/login.tsx` — phone + OTP login
- `index.tsx` — splash / loading

### Onboarding (1 screen)
- `onboarding.tsx` — 3-slide carousel for first-time users

### Tab navigation (5 tabs)
- `(tabs)/home.tsx` — service category grid + active booking card + promos
- `(tabs)/bookings.tsx` — list of bookings with filters
- `(tabs)/wallet.tsx` — balance, transactions, top-up
- `(tabs)/profile.tsx` — settings, preferences, help

### Search & Discovery (3 screens)
- `customer/search.tsx` — text search across services
- `customer/category/[id].tsx` — subcategory list within a category
- `customer/provider/[id].tsx` — public provider profile

### Booking flow (12 screens)
- `customer/booking/configure.tsx` — service options/add-ons selection
- `customer/booking/form.tsx` — fixed-price booking form
- `customer/booking/job-request.tsx` — custom-quote request form
- `customer/booking/quotes.tsx` — quote comparison view
- `customer/booking/confirm.tsx` — final confirmation before payment
- `customer/booking/checkout.tsx` — payment screen
- `customer/booking/[id].tsx` — booking detail (post-confirmation)
- `customer/booking/tracker.tsx` — provider en route tracker (live map)
- `customer/booking/photos.tsx` — view booking photos
- `customer/booking/complete.tsx` — completion confirmation
- `customer/booking/review.tsx` — rate + review provider
- `customer/booking/tip.tsx` — optional tip
- `customer/booking/dispute.tsx` — file dispute
- `customer/booking/change-order.tsx` — approve/decline change order
- `customer/booking/make-recurring.tsx` — convert booking to recurring
- `customer/booking/payment-failed.tsx` (Phase 09a) — clear payment error UI

### Recurring (3 screens)
- `customer/recurring/index.tsx` — list of recurring schedules
- `customer/recurring/[id].tsx` — schedule detail + edit + pause/resume
- (home_care_plan_selection in Phase 09c)

### Address & Location (3 screens)
- `customer/addresses.tsx` — list of saved addresses with CRUD
- `customer/address-picker.tsx` — map-based picker with autocomplete

### Account & Profile (8 screens)
- `customer/account-management.tsx` — account-level settings
- `customer/notifications.tsx` — notification feed (in-app)
- `customer/notification-settings.tsx` — granular per-channel preferences
- `customer/payment-methods.tsx` — saved GCash/Maya/cards CRUD
- `customer/wallet-topup.tsx` — top up wallet balance
- `customer/referral.tsx` — referral program (give credit + earn)
- `customer/safety.tsx` — SiguradoShield trust screen (Phase 09a)
- `customer/terms.tsx` — Terms & Privacy + granular consent (Phase 09a)
- `customer/help.tsx` — help center → Phase 09a builds full help_center

### Communication (1 screen)
- `customer/chat/[id].tsx` — chat with provider

### Customer-facing (2 screens)
- `customer/suki-pros.tsx` — list of providers customer has Suki relationship with
- (live_chat_support in Phase 09d)

### Stitch screens to build (Phase 09 batches)

Already covered above are screens whose files exist. The 39 missing screens fall in two buckets:

**Bucket A — Files exist but content is thin or wrong (verify and rebuild):**
- safety.tsx → make full SiguradoShield screen (Phase 09a)
- terms.tsx → granular consent (Phase 09a)
- help.tsx → full help center (Phase 09a)
- addresses.tsx → verify CRUD (Phase 09a)
- payment-methods.tsx → verify CRUD (Phase 09c)
- wallet-topup.tsx → verify (Phase 09c)
- recurring/index.tsx → verify CRUD (Phase 09c)
- referral.tsx → verify full tracking (Phase 09c)
- notification-settings.tsx → verify granular (Phase 09d)

**Bucket B — Truly new files:**
- customer/booking/payment-failed.tsx (Phase 09a)
- customer/booking/photos.tsx exists; before-after view component (Phase 09b)
- customer/identity-verification.tsx (Phase 09a, but provider side)
- urgency_selector component used in booking flow (Phase 09c)
- home_care_plan_selection screen (Phase 09c)
- live_chat_support screen (Phase 09d)
- empty states across all list screens (Phase 09d)

---

## Provider App — 30 screens total

### Auth (shared with customer)

### Onboarding (7 screens)
- `provider-onboarding/role-select.tsx` — choose customer or provider
- `provider-onboarding/categories.tsx` — select service categories
- `provider-onboarding/service-area.tsx` — set service area on map
- `provider-onboarding/documents.tsx` — upload government ID + NBI
- `provider-onboarding/selfie.tsx` — selfie capture for ID verification
- `provider-onboarding/terms.tsx` — provider agreement
- `provider-onboarding/review-pending.tsx` — vetting status
- (background_check_status, identity_verification in Phase 09a)

### Tab navigation (4 tabs)
- `(provider-tabs)/dashboard.tsx` — today's jobs, online toggle, stats
- `(provider-tabs)/jobs.tsx` — job queue + history
- `(provider-tabs)/earnings.tsx` — earnings dashboard
- `(provider-tabs)/provider-profile.tsx` — profile, settings, account

### Job execution (8 screens)
- `provider/job/[id].tsx` — job detail (accept/decline)
- `provider/job/[id]/checklist.tsx` — service checklist (Phase 09b builds full version)
- `provider/job/[id]/photos.tsx` — photo capture
- `provider/job/[id]/quote.tsx` — quote builder for custom jobs
- `provider/job/[id]/change-order.tsx` — submit change order to customer
- `provider/job/active.tsx` — currently active job tracker
- (mark_job_completed and work_summary in Phase 09b)
- (navigation_to_job in Phase 09b)

### Schedule (3 screens)
- `provider/schedule.tsx` — calendar view of upcoming jobs
- `provider/calendar.tsx` — extended calendar
- `provider/availability.tsx` — set working hours and availability

### Earnings & Payouts (3 screens)
- `provider/payouts.tsx` — payout history
- `provider/payout-settings.tsx` — bank/GCash/Maya account
- `provider/withdraw.tsx` — initiate withdrawal

### Profile & Services (6 screens)
- `provider/services.tsx` — manage offered services
- `provider/portfolio.tsx` — work portfolio (before/after photos)
- `provider/certifications.tsx` — TESDA / PRC / other certs
- `provider/reviews.tsx` — reviews received
- `provider/tier-progression.tsx` — current tier + next tier requirements
- `provider/suki-customers.tsx` — list of customers in Suki relationship

### Communication (1 screen)
- `provider/chat/[id].tsx` — chat with customer

### Other (4 screens)
- `provider/notifications.tsx` — notification feed
- `provider/help.tsx` — help center (provider version)
- `provider/settings.tsx` — provider-specific settings
- `provider/account-management.tsx` — account-level

### Stitch screens to build (Phase 09 batches)

**Phase 09a launch-critical (provider-side):**
- identity_verification → provider-onboarding/identity-verification.tsx
- background_check_status → provider-onboarding/background-check-status.tsx
- document_upload component used by onboarding/documents.tsx

**Phase 09b job execution:**
- service_checklist (full spec'd version)
- before_after_photos comparison
- mark_job_completed
- work_summary
- navigation_to_job (deep link to Maps/Waze)
- service_area as a separate provider screen (with draggable radius)
- skill_selection / skills

---

## Cross-cutting mobile requirements

### Auth & session
- Phone + OTP only (no email/password for customer; admin uses email+password+TOTP)
- Refresh token on app launch
- Logout on 401 from API
- Session persists across app close (AsyncStorage)

### Offline awareness
- Banner when offline ("You're offline. Some features unavailable.")
- Cached data for active booking visible offline
- Optimistic UI for non-critical actions
- Network retry with exponential backoff

### Push notifications
- Expo push tokens registered on login
- Per-event opt-in/out (Phase 09d notification-settings)
- Deep links to specific screen on tap

### Performance
- Image optimization (expo-image with blurhash)
- List virtualization (FlashList where >100 items)
- Lazy loading of non-critical screens
- Bundle splitting

### Accessibility (mobile)
- 44px minimum touch targets
- Screen reader labels on all interactive elements
- Color contrast WCAG AA
- Font scaling support
- Reduced motion respect

### Internationalization
- English only (per audit i18n RESOLVED)
- Currency always ₱
- Phone +63 format
- Asia/Manila timezone

### Cross-platform
- iOS (Expo Go for dev, EAS Build for store)
- Android (Expo Go for dev, EAS Build for store)
- Web (Expo for Web — works in browser, useful for desktop preview / kiosk display)
- Tablet layouts (master-detail where appropriate)

---

## Per-screen audit template usage

For every screen, the AI coder fills out `.ai-coder/templates/SCREEN-AUDIT-TEMPLATE.md`. This goes in the commit alongside the screen. Ken can spot-check by reading the audit file rather than the code.

The audit file confirms:
- Loading / Error / Empty / Success states all rendered
- Real API integration (no mock data)
- All 4 edge cases tested
- Lucide icons (no emoji as iconography)
- Design tokens used
- Responsive on iPhone SE / iPhone 14 / iPad
- Accessibility checks passed

---

## Mobile screen count after all phases

| Category | Existing | Phase 09 adds | Total |
|---|---|---|---|
| Customer | 50 | 22 | 72 |
| Provider | 25 | 14 | 39 |
| Auth/onboarding | 8 | 3 | 11 |
| **Total** | **83** | **39** | **122** |

Some Phase 09 screens replace thin existing files; net new files is closer to ~25-30. The "39 missing" count includes both new files and major rewrites of existing thin files.
