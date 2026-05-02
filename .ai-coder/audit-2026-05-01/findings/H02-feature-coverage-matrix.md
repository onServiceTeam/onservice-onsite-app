# Phase H Findings Part 2 — Per-feature test coverage matrix

## What this is

Your brief asked for: "If a customer flow has 100 actions, write 100 tests." This doc enumerates every action across customer / provider / admin flows + the variation axes (happy / failed / empty / permission / network / duplicate / race / edge / mobile / tablet / desktop / browser / abuse) and marks coverage status against the existing test inventory.

Coverage symbols:
- ✅ REAL test exists (REAL-UNIT or REAL-RENDER from H01 buckets)
- 🟡 SHALLOW test exists (R7-real smoke compile only — does not assert on behavior)
- 🔴 no test exists
- ⚙️ runtime-only (requires Docker harness from Phase I-A)

The coverage cells reference the test files from H01 + the source files from F-phase audit. Every 🔴 in this matrix is a test that needs to be written. Every 🟡 in this matrix is a test that needs to be augmented (paired with a `*.behavior.test.tsx`).

---

## CUSTOMER FLOWS

### C-1 Sign up (mobile)

| # | Action | Happy | Failed | Empty | Permission | Network | Duplicate | Race | Edge | Coverage notes |
|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| 1 | Open app, see welcome screen | 🟡 | 🔴 | 🔴 | n/a | 🔴 | n/a | n/a | 🔴 | `apps/mobile/__tests__/screens/welcome.real.test.tsx` is SHALLOW |
| 2 | Tap "Sign up" → navigate to register | 🟡 | 🔴 | n/a | n/a | n/a | n/a | n/a | 🔴 | navigation not asserted |
| 3 | Enter PH phone number (validate +63 9XX format) | ✅ | ✅ | 🔴 | n/a | n/a | n/a | n/a | ✅ | `proof/phone-validation.real.test.ts` covers PH regex |
| 4 | Tap "Send OTP" → server sends SMS | 🟡 | 🔴 | 🔴 | n/a | 🔴 | 🔴 | 🔴 | 🔴 | duplicate-OTP-request rate-limit not tested; race against same-phone re-request not tested |
| 5 | Wait for SMS, enter 6-digit code | 🟡 | 🔴 | 🔴 | n/a | n/a | n/a | n/a | 🔴 | wrong code 3× lockout (per migration 026) not tested at flow level |
| 6 | OTP verified → user created in DB | ⚙️ | ⚙️ | n/a | n/a | ⚙️ | 🔴 | 🔴 | ⚙️ | needs runtime harness |
| 7 | Capture device fingerprint (CRIT-119 family) | 🔴 | 🔴 | n/a | n/a | n/a | 🔴 | n/a | 🔴 | Phase E CRIT-119: fingerprint is non-deterministic; test that 2 calls return same fingerprint NOT WRITTEN |
| 8 | Issue access + refresh JWT | 🟡 | 🔴 | n/a | n/a | n/a | 🔴 | n/a | 🔴 | refresh-token replay detection (CRIT-22/53/68/72) not tested at flow level |
| 9 | Land on home screen | 🟡 | n/a | 🔴 | n/a | 🔴 | n/a | n/a | 🔴 | onboarding nudge for incomplete profile not tested |

**Tests to write for C-1: ~30 new behavior tests + 9 E2E flows (one per action × representative variation).**

### C-2 Log in (mobile, returning customer)

| # | Action | Happy | Failed | Permission | Network | Duplicate | Race | Edge | Coverage |
|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| 1 | Tap "Log in" | 🟡 | 🔴 | n/a | n/a | n/a | n/a | n/a | login.real.test.tsx SHALLOW |
| 2 | Enter phone | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | `proof/login.dom.test.tsx` covers invalid PH format |
| 3 | Tap "Send code" | 🟡 | 🔴 | n/a | 🔴 | 🔴 | 🔴 | 🔴 | rate-limit on resend not tested |
| 4 | Enter OTP | 🟡 | 🟡 | n/a | n/a | n/a | n/a | 🔴 | wrong OTP 3× lockout not tested at flow level |
| 5 | Locked-out 4th attempt | 🔴 | n/a | n/a | n/a | n/a | n/a | 🔴 | escalating lockout not tested |
| 6 | Captcha required after threshold | 🔴 | 🔴 | n/a | 🔴 | n/a | 🔴 | 🔴 | hcaptcha integration only unit-tested in `hcaptcha-verify.test.ts`; flow-level untested |
| 7 | New device login → security event written | 🔴 | n/a | n/a | n/a | 🔴 | n/a | 🔴 | `device_fingerprints.is_trusted=false` path not tested |
| 8 | JWT issued with correct claims (role, perms) | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | API tests cover JWT issue |
| 9 | Refresh token rotation on 401 | ✅ | 🔴 | n/a | 🔴 | 🔴 | 🔴 | 🔴 | rotation tested; replay-detection NOT |

### C-3 Browse + search services

| # | Action | Happy | Failed | Empty | Permission | Network | Edge | Coverage |
|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| 1 | Home shows service categories | 🟡 | 🔴 | 🔴 | n/a | 🔴 | 🔴 | category fetch error path untested |
| 2 | Tap category → list of subcategories | 🟡 | 🔴 | 🔴 | n/a | 🔴 | n/a | empty subcategory list rendering untested |
| 3 | Search by keyword | 🟡 | 🔴 | 🔴 | n/a | 🔴 | 🔴 | search debounce, no-results state untested |
| 4 | Filter by price range | 🟡 | 🔴 | 🔴 | n/a | 🔴 | 🔴 | filter state persistence across nav untested |
| 5 | Filter by service area (Boracay default) | 🔴 | 🔴 | 🔴 | n/a | 🔴 | 🔴 | CRIT-92/93/116 family — Manila default not tested |
| 6 | Sort by rating | 🟡 | 🔴 | 🔴 | n/a | 🔴 | 🔴 | |
| 7 | Tap service → detail screen | 🟡 | 🔴 | n/a | n/a | 🔴 | n/a | |
| 8 | View provider profile, ratings, reviews | 🟡 | 🔴 | 🔴 | n/a | 🔴 | n/a | provider with 0 reviews → empty state |

### C-4 Book a service (the money path)

| # | Action | Happy | Failed | Empty | Permission | Network | Duplicate | Race | Edge | Coverage |
|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| 1 | Configure service (date/time/options) | 🟡 | 🔴 | 🔴 | n/a | n/a | n/a | n/a | 🔴 | |
| 2 | Customer sees CANONICAL price (not client-computed) | ✅ | n/a | n/a | n/a | 🔴 | n/a | 🔴 | 🔴 | F02 CRIT-13/42/75/81 family — price drift partially tested via `commission.test.ts` |
| 3 | Add to cart / checkout | 🟡 | 🔴 | 🔴 | n/a | 🔴 | n/a | n/a | 🔴 | |
| 4 | Apply promo code (CRIT-146 — disabled in v1.0) | 🔴 | 🔴 | 🔴 | n/a | n/a | 🔴 | 🔴 | 🔴 | feature flag gates this; flag-on/off behavior untested |
| 5 | Apply suki discount | 🟡 | 🔴 | n/a | n/a | n/a | 🔴 | 🔴 | 🔴 | |
| 6 | Select address (existing or new) | 🟡 | 🔴 | 🔴 | n/a | 🔴 | n/a | n/a | 🔴 | |
| 7 | Confirm booking summary | 🟡 | 🔴 | n/a | n/a | n/a | n/a | n/a | 🔴 | |
| 8 | Initiate PayMongo payment intent | 🟡 | 🔴 | n/a | n/a | 🔴 | 🔴 | 🔴 | 🔴 | webhook idempotency CRIT-19/20/21 family |
| 9 | Webhook received → escrow held | ✅ | ⚙️ | n/a | n/a | ⚙️ | ⚙️ | ⚙️ | ⚙️ | `escrow-async-integration.test.ts` covers happy; idempotency on webhook retry untested |
| 10 | Failed payment → user sees retry path | 🟡 | 🔴 | 🔴 | n/a | 🔴 | 🔴 | n/a | 🔴 | `customer-booking-payment-failed.real.test.tsx` SHALLOW |
| 11 | 3DS challenge flow | 🔴 | 🔴 | n/a | n/a | 🔴 | n/a | 🔴 | 🔴 | not tested at all |
| 12 | Booking row created with status='paid' | ⚙️ | ⚙️ | n/a | n/a | ⚙️ | ⚙️ | ⚙️ | ⚙️ | needs runtime harness |
| 13 | Customer sees booking in history | 🟡 | 🔴 | 🔴 | n/a | 🔴 | n/a | n/a | 🔴 | |
| 14 | Provider gets push notification | 🔴 | 🔴 | n/a | n/a | 🔴 | 🔴 | 🔴 | 🔴 | push notification dispatch not tested at flow level |
| 15 | Provider matched / dispatched (eligibility rules) | ✅ | 🔴 | 🔴 | n/a | n/a | 🔴 | 🔴 | 🔴 | `matching.test.ts` REAL-UNIT |
| 16 | Race: 2 providers accept simultaneously | 🔴 | n/a | n/a | n/a | n/a | n/a | 🔴 | 🔴 | NOT TESTED |

### C-5 Cancel booking (refund tier policy)

| # | Action | Happy | Failed | Permission | Network | Race | Edge | Coverage |
|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| 1 | View cancel options | 🟡 | n/a | n/a | n/a | n/a | n/a | |
| 2 | See refund preview per tier (>24h, 4-24h, <4h, no-show) | ✅ | n/a | n/a | n/a | n/a | ✅ | `cancellation-service-bug-1170.test.ts` REAL covers tier math |
| 3 | Confirm cancellation → server applies tier refund | ⚙️ | ⚙️ | n/a | ⚙️ | ⚙️ | ⚙️ | needs runtime harness; per-tier integration tested at unit level |
| 4 | Wallet credited the refund | ✅ | n/a | n/a | n/a | 🔴 | 🔴 | `escrow-money-conservation.test.ts` covers conservation |
| 5 | Provider notified of cancellation | 🔴 | 🔴 | n/a | 🔴 | 🔴 | 🔴 | not tested |
| 6 | Provider compensation if applicable (no-show credit ₱200) | ✅ | n/a | n/a | n/a | 🔴 | ✅ | `cancellation-policies.provider_no_show_credit_php` |
| 7 | Customer cannot cancel after `cancelled_by_provider` | 🔴 | 🔴 | n/a | n/a | n/a | 🔴 | not tested |
| 8 | Cancel during `in_progress` → refund tier 4 (0%) | 🔴 | n/a | n/a | n/a | n/a | 🔴 | not tested |

### C-6 Reschedule booking — 🔴 NOT TESTED AT ALL

No `*.test.ts` file matches "reschedule." If the feature exists in customer mobile, it has zero test coverage. Audit-derived assumption: the customer-side recurring booking flow has rescheduling; needs investigation.

### C-7 Communicate with provider (chat) — 🔴 BROKEN PER PHASE D/E

Phase D CRIT-91/96 + Phase E confirmed chat is broken on Bug-1061-migrated devices. Tests don't exist for the broken state OR the fixed state. When the chat fix lands, it needs:
- Send message happy path
- Receive message via socket
- Failed-send retry
- Empty chat state
- Permission: customer can only chat with their own provider
- Network: socket disconnect + reconnect
- Race: two messages sent simultaneously
- Edge: 5000-char message; emoji-only; image upload (CRIT-91 family)

### C-8 Upload + view photos

| Action | Happy | Failed | Edge | Coverage |
|---|:-:|:-:|:-:|---|
| Customer uploads before-photos | 🔴 | 🔴 | 🔴 | not tested |
| Provider uploads after-photos (CRIT-102 family) | ⚙️ | ⚙️ | ⚙️ | mobile-side tests for the broken `file://` path don't exist; need runtime harness |
| Customer views provider after-photos | 🟡 | 🔴 | 🔴 | view shallow only |
| Pinch-zoom + save-to-device (Bug 943/944, claimed encompassed by Bug 36) | 🔴 | 🔴 | 🔴 | encompassed-bugs source-regex tests don't prove behavior |
| Photos persist beyond booking lifecycle | 🔴 | n/a | 🔴 | data retention not tested |

### C-9 Leave review

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| 1-5 star + comment | ✅ | ✅ | n/a | ✅ | `review-validators.test.ts` REAL |
| Photo attached to review | 🟡 | 🔴 | n/a | 🔴 | |
| Cannot review until booking confirmed | 🔴 | 🔴 | 🔴 | 🔴 | not tested at flow level |
| Customer cannot review their own provider account | 🔴 | n/a | 🔴 | n/a | abuse case untested |
| Edit review within window | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Review hidden by admin (CRIT-131 family) | 🔴 | n/a | 🔴 | 🔴 | NPC notification of hide not tested |

### C-10 Receive notifications

| Action | Happy | Failed | Edge | Coverage |
|---|:-:|:-:|:-:|---|
| Push notification dispatched (via `notification-templates`) | 🟡 | 🔴 | 🔴 | template render tested at validator level |
| In-app notification rendered | 🟡 | 🔴 | 🔴 | shallow render only |
| Email notification (where applicable) | 🔴 | 🔴 | 🔴 | not tested |
| SMS notification | 🔴 | 🔴 | 🔴 | not tested |
| User can disable notification preferences per type | 🔴 | 🔴 | 🔴 | `notification_preferences` table tested at validator only |
| Locale: Tagalog template (MED-335) | 🔴 | n/a | 🔴 | i18n not tested |

### C-11 Disputes

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| File dispute (within window) | ✅ | ✅ | ✅ | ✅ | `compliance-dsr-flow.test.ts` + `dispute-validators.test.ts` REAL |
| Upload evidence | 🟡 | 🔴 | 🔴 | 🔴 | dispute_evidence schema OK, flow not E2E |
| Cannot file outside window | ✅ | n/a | n/a | ✅ | tested at validator level |
| Receive resolution decision | ⚙️ | ⚙️ | ⚙️ | ⚙️ | needs runtime |
| Refund applied per resolution_type | ✅ | n/a | n/a | ✅ | `dispute-refund-processing.test.ts` REAL |
| Appeal a rejection | 🔴 | 🔴 | 🔴 | 🔴 | not built; not tested |

### C-12 Customer NPC rights (DSR)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| File access DSR | ✅ | ✅ | n/a | ✅ | `compliance-dsr-flow.test.ts` REAL |
| File erasure DSR | ⚙️ | ⚙️ | n/a | ⚙️ | **CRIT-136**: Mark Complete doesn't actually erase. Test that asserts post-completion DB has no PII for the user → DOES NOT EXIST |
| File correction DSR | 🟡 | 🔴 | n/a | 🔴 | |
| File portability DSR | 🟡 | 🔴 | n/a | 🔴 | |
| Receive response within 15-day NPC SLA | 🔴 | 🔴 | n/a | 🔴 | SLA tracking tested via `compliance.dsr` overdue queries; customer-side notification not tested |
| Customer can re-submit if rejected | 🔴 | n/a | n/a | 🔴 | rate-limit (MED-331) tested? no |

### C-13 Use app on different platforms

| Platform | Smoke | Behavior | E2E | Coverage |
|---|:-:|:-:|:-:|---|
| iOS phone | 🟡 | 🔴 | 🔴 | F#3 Maestro YAMLs scaffolded, baselines NOT captured |
| iOS tablet | 🔴 | 🔴 | 🔴 | not tested |
| Android phone | 🟡 | 🔴 | 🔴 | F#3 Maestro YAMLs scaffolded |
| Android tablet | 🔴 | 🔴 | 🔴 | not tested |
| Web (responsive of mobile app?) | 🔴 | 🔴 | 🔴 | unclear if web build exists; admin-web yes, customer-web unknown |

---

## PROVIDER FLOWS

### P-1 Sign up / onboarding (CRIT-115/117/128 family)

| # | Action | Happy | Failed | Empty | Permission | Edge | Coverage |
|---:|---|:-:|:-:|:-:|:-:|:-:|---|
| 1 | Phone/OTP signup (same as customer) | 🟡 | 🔴 | 🔴 | n/a | 🔴 | shared with customer |
| 2 | Choose role: provider | 🔴 | 🔴 | n/a | n/a | 🔴 | not tested at flow level |
| 3 | Personal info | 🔴 | 🔴 | 🔴 | n/a | 🔴 | not tested |
| 4 | Business info | 🟡 | 🔴 | 🔴 | n/a | 🔴 | shallow |
| 5 | Service categories | 🟡 | 🔴 | 🔴 | n/a | 🔴 | shallow |
| 6 | Service area (Boracay default — CRIT-111/116) | 🔴 | 🔴 | 🔴 | n/a | 🔴 | CRIT — not tested |
| 7 | Upload NBI clearance to `provider_documents` | ⚙️ | ⚙️ | ⚙️ | n/a | ⚙️ | needs runtime; happy path REAL via `provider_documents` schema |
| 8 | Upload Government ID front + back (CRIT-128 wire-up) | ⚙️ | ⚙️ | ⚙️ | n/a | ⚙️ | provider_documents schema EXISTS per Phase G; service wire-up missing |
| 9 | Upload selfie liveness (CRIT-128) | ⚙️ | ⚙️ | ⚙️ | n/a | ⚙️ | same |
| 10 | Submit application → status='pending_review' | ⚙️ | ⚙️ | n/a | n/a | ⚙️ | needs runtime |
| 11 | Admin reviewer queue receives application | 🔴 | n/a | n/a | n/a | 🔴 | not tested at admin flow level |
| 12 | Provider receives status update notification | 🔴 | 🔴 | n/a | n/a | 🔴 | not tested |
| 13 | Sent-back state — provider edits + resubmits (Bug 1200) | ⚙️ | ⚙️ | n/a | n/a | ⚙️ | tested only via SRC-REGEX in d09-encompassed-bugs |
| 14 | Approved → can accept jobs | ⚙️ | ⚙️ | n/a | n/a | ⚙️ | needs runtime |
| 15 | Rejected → cannot proceed; appeal path | 🔴 | n/a | n/a | n/a | 🔴 | not tested |
| 16 | Onboarding theatre check: silent 404 swallow (CRIT-115) | 🔴 | n/a | n/a | n/a | 🔴 | NOT TESTED — the bug remains UNVERIFIABLE without the test |

### P-2 Manage profile / availability

| # | Action | Happy | Failed | Edge | Coverage |
|---:|---|:-:|:-:|:-:|---|
| 1 | Edit business name / description | 🟡 | 🔴 | 🔴 | shallow |
| 2 | Toggle online/offline | 🟡 | 🔴 | 🔴 | shallow |
| 3 | Set availability schedule | 🟡 | 🔴 | 🔴 | `availability_overrides` schema, no flow test |
| 4 | Service area change request (Bug 1268) | ⚙️ | ⚙️ | ⚙️ | tested only via SRC-REGEX |
| 5 | Update service categories | 🟡 | 🔴 | 🔴 | shallow |
| 6 | Upload portfolio (CRIT-108 — paste URL is broken) | 🔴 | 🔴 | 🔴 | upload-by-paste vs ImagePicker — neither tested |
| 7 | Upload certifications (CRIT-109) | 🔴 | 🔴 | 🔴 | same |
| 8 | NBI expiry warning (provider receives notification) | 🟡 | 🔴 | 🔴 | banner component shallow rendered, expiry-soon path not tested |

### P-3 Accept / reject jobs

| # | Action | Happy | Failed | Permission | Race | Edge | Coverage |
|---:|---|:-:|:-:|:-:|:-:|:-:|---|
| 1 | Receive job offer push | 🔴 | 🔴 | n/a | 🔴 | 🔴 | not tested |
| 2 | View job details | 🟡 | 🔴 | n/a | n/a | 🔴 | shallow |
| 3 | Accept job | 🟡 | 🔴 | 🔴 | 🔴 | 🔴 | RACE: 2 providers accept untested |
| 4 | Reject job | 🟡 | 🔴 | 🔴 | n/a | 🔴 | shallow |
| 5 | Job auto-expires after timeout | 🔴 | n/a | n/a | n/a | 🔴 | not tested |
| 6 | Status: en_route → arrived → started → completed | 🟡 | 🔴 | 🔴 | 🔴 | 🔴 | state machine tested at unit level only |

### P-4 Job execution + completion (CRIT-102/103/104/105 family)

| # | Action | Happy | Failed | Edge | Coverage |
|---:|---|:-:|:-:|:-:|---|
| 1 | Open checklist (server-driven per category — Bug 1xxx) | 🔴 | 🔴 | 🔴 | CRIT-105: hardcoded cleaning checklist; not tested |
| 2 | Mark each step completed | 🔴 | 🔴 | 🔴 | not tested |
| 3 | Upload before-photos | ⚙️ | ⚙️ | ⚙️ | CRIT-102: `file://` URI bug; needs runtime |
| 4 | Upload after-photos | ⚙️ | ⚙️ | ⚙️ | same |
| 5 | Customer signature capture | ⚙️ | ⚙️ | ⚙️ | CRIT-103: signature lost as point dots; not tested |
| 6 | Submit completion → status='completed_by_provider' | ⚙️ | ⚙️ | ⚙️ | CRIT-104: /complete endpoint doesn't exist server-side; not tested |
| 7 | Earnings preview (CRIT-99/100/101/107 family) | 🔴 | 🔴 | 🔴 | fake data shown; tests don't catch this |
| 8 | Customer confirms / disputes | ✅ | ✅ | ✅ | dispute flow tested |

### P-5 Earnings / payouts (CRIT-112/113/114 family)

| # | Action | Happy | Failed | Edge | Coverage |
|---:|---|:-:|:-:|:-:|---|
| 1 | View earnings dashboard | 🔴 | 🔴 | 🔴 | CRIT-112: hardcoded fake earnings; not tested |
| 2 | View commission breakdown per booking | 🔴 | 🔴 | 🔴 | CRIT-100: fake math; not tested |
| 3 | View available withdraw balance | 🔴 | 🔴 | 🔴 | CRIT-114: wallet URL drift (plural→singular); not tested |
| 4 | Initiate withdraw | 🟡 | 🔴 | 🔴 | shallow |
| 5 | Withdraw to GCash | ⚙️ | ⚙️ | ⚙️ | needs runtime |
| 6 | Withdraw to bank | ⚙️ | ⚙️ | ⚙️ | needs runtime |
| 7 | Payout history | 🟡 | 🔴 | 🔴 | shallow |
| 8 | Failed payout — reason shown | 🔴 | 🔴 | 🔴 | not tested |
| 9 | Minimum withdraw threshold (₱100) | 🔴 | 🔴 | 🔴 | configured in platform_settings, not tested at flow level |

### P-6 Notifications, cancellations, disputes

Similar matrix to C-7/C-9/C-11 from the provider side. All currently 🟡 SHALLOW or 🔴.

---

## ADMIN FLOWS

### A-1 Login (TOTP 2FA)

| Action | Happy | Failed | Edge | Coverage |
|---|:-:|:-:|:-:|---|
| Email + password → preauth token | ✅ | ✅ | ✅ | `auth-validators.test.ts` REAL |
| TOTP entry → final session | 🟡 | 🟡 | 🔴 | shallow login.real test |
| Force-enrollment for first-time admin | 🟡 | 🔴 | 🔴 | shallow |
| Backup code consumption | ✅ | ✅ | ✅ | `admin_backup_codes` schema + `admin-2fa.service` tests REAL |
| Admin session cookie + CSRF (Bug 1251) | ✅ | ✅ | ✅ | `admin-cookies.test.ts` + `admin-csrf-middleware.test.ts` REAL |

### A-2 Customer management

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| List customers, paginate, search | 🟡 | 🔴 | 🔴 | 🔴 | shallow render only |
| View customer detail (Profile/Bookings/Payments/Disputes/Referrals/Activity) | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| Suspend customer (super_admin) | 🔴 | 🔴 | 🔴 | 🔴 | CRIT-132 family — perm gate not tested |
| Reactivate customer | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Flag fraud | 🔴 | 🔴 | 🔴 | 🔴 | CRIT-MED-305: action with no UI explanation |
| Issue wallet credit (CRIT-133/134) | 🔴 | 🔴 | 🔴 | 🔴 | unbounded amount; not tested |
| View customer PII (CRIT-132 redaction) | 🔴 | 🔴 | 🔴 | 🔴 | per-role redaction not tested |

### A-3 Provider management (CRIT-130 family)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| List providers, paginate, search, filter by tier | 🟡 | 🔴 | 🔴 | 🔴 | CRIT-129: 'founding' missing from filter |
| View provider 360 (Profile/Jobs/Financials/Reviews/Disputes/Activity/Notes) | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| Approve provider | 🔴 | 🔴 | 🔴 | 🔴 | CRIT-130: junior admin OK at server-level; not tested |
| Reject provider with reason | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Suspend provider | 🔴 | 🔴 | 🔴 | 🔴 | account-killing; not tested |
| Reactivate | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Change tier (incl 'founding') | 🔴 | 🔴 | 🔴 | 🔴 | CRIT-129: dropdown missing 'founding' |
| Adjust wallet (CRIT-133/134) | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Hide review (CRIT-131) | 🔴 | 🔴 | 🔴 | 🔴 | no super-admin gate, no reason field |
| Add internal note (general/quality/financial/legal) | ✅ | ✅ | 🔴 | 🔴 | basic test exists; legal-category permission not tested |
| Delete note | ✅ | ✅ | 🔴 | 🔴 | basic test |
| View KYC docs (CRIT-128 wire-up) | 🔴 | 🔴 | 🔴 | 🔴 | "not stored" string still shown; service drift; NOT TESTED |

### A-4 Booking management (F02 CRIT-120 onward)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| List bookings | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| View Booking 360 (Overview/Timeline/Evidence/Money/Audit) | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| Cancel booking with refund tier preview (CRIT-123) | 🔴 | 🔴 | 🔴 | 🔴 | NOT tested — preview missing |
| Reassign provider (CRIT-127: 200 cap) | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Force-complete booking (super_admin) | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Release escrow (manual override) | 🟡 | 🔴 | 🔴 | 🔴 | server-side tested via `dispute-refund-processing` |
| Refund booking (full) | 🟡 | 🔴 | 🔴 | 🔴 | tested at unit, not flow |
| Send admin message to customer | 🟡 | 🔴 | 🔴 | 🔴 | shallow; CRIT-91/96 customer chat broken |
| Audit log records every action | 🟡 | 🔴 | 🔴 | 🔴 | server-side adds row; UI display test SHALLOW |

### A-5 Financials (F02 CRIT-125)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| Reconciliation Run (super_admin) | ✅ | ✅ | 🔴 | 🔴 | `financial-bir-admin.test.ts` REAL |
| BIR 2550M VAT Generate (monthly) | ✅ | ✅ | 🔴 | 🔴 | tested |
| BIR 2550M Finalize (locks the report) | 🔴 | 🔴 | 🔴 | 🔴 | confirm-dialog UX not tested (MED-283) |
| BIR 2307 Quarterly batch | ✅ | ✅ | 🔴 | 🔴 | tested |
| Receipt search + paginate | 🟡 | 🔴 | 🔴 | 🔴 | shallow; CRIT-125 PDF URL leak |
| OR issue / cancel | ✅ | ✅ | 🔴 | 🔴 | tested |
| PayMongo transfer ID secret leak (CRIT-135) | 🔴 | n/a | 🔴 | 🔴 | NOT tested |

### A-6 Dispute resolution

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| List disputes | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| View dispute detail with party history | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| Assign to staff (free-text UUID — MED-290) | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Resolve with refund_amount preview (CRIT-124 client-vs-server math) | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Resolve with `refund_with_suspension` (CRIT-121) | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Escalate | ✅ | ✅ | 🔴 | 🔴 | server REAL; UI shallow |
| Reopen (super_admin) | 🔴 | 🔴 | 🔴 | 🔴 | not tested |

### A-7 Compliance / DPO surfaces (F04 CRIT-136 family)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| View DSR queue | ✅ | ✅ | ✅ | ✅ | `compliance-admin.test.ts` REAL |
| Mark DSR complete (CRIT-136 — doesn't actually erase) | 🔴 | n/a | 🔴 | 🔴 | **THE most critical missing test.** Erasure DSR completes → assert customer's user row is anonymized AND every joined PII column scrubbed. NOT TESTED. |
| Reject DSR (super_admin) | ✅ | ✅ | ✅ | ✅ | tested |
| Escalate to NPC | ✅ | ✅ | ✅ | ✅ | tested |
| Request more info | ✅ | ✅ | ✅ | ✅ | tested |
| Publish consent version (CRIT-137) | 🔴 | 🔴 | 🔴 | 🔴 | unguarded server-side; junior admin can publish; NOT tested |
| Search consent records (DPO-only — Bug 402) | ✅ | ✅ | ✅ | ✅ | tested |
| BIR Calendar | ✅ | n/a | ✅ | ✅ | tested |
| Audit Log CSV export (Bug 401) | ✅ | ✅ | ✅ | ✅ | self-audit tested |
| Breach log create / NPC notify / status change (DPO) | 🔴 | 🔴 | 🔴 | 🔴 | API tested; UI doesn't exist yet (MED-332) |

### A-8 Pricing rules / catalog / service areas (CRIT-142/144 family)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| Create surge pricing rule | ✅ | ✅ | 🔴 | 🔴 | `admin-pricing-rules-validators.test.ts` REAL; perm not tested |
| Toggle pricing rule | 🔴 | 🔴 | 🔴 | 🔴 | CRIT-142: junior admin can toggle |
| Delete pricing rule | 🔴 | 🔴 | 🔴 | 🔴 | not tested |
| Create service area (PH bounds enforced) | ✅ | ✅ | 🔴 | ✅ | `migrations/074-service-area-bounds.test.ts` SRC-REGEX (delete) + `admin-service-area-validators.test.ts` REAL |
| Activate / Pause service area | 🔴 | 🔴 | 🔴 | 🔴 | account-killing; not tested |
| Edit catalog category basePrice (CRIT-144) | ✅ | ✅ | 🔴 | 🔴 | `admin-catalog-validators.test.ts` REAL; perm not tested |
| `Number(price) * 100` precision (CRIT-145) | 🔴 | n/a | n/a | 🔴 | not tested |

### A-9 Marketing (CRIT-138/143/146 family)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| Create promo code (v1.0 redemption disabled) | ✅ | ✅ | 🔴 | 🔴 | `marketing-admin.test.ts` REAL |
| Edit promo code | ✅ | ✅ | 🔴 | 🔴 | tested |
| Deactivate promo code | ✅ | ✅ | 🔴 | 🔴 | tested |
| Promo redemption with feature flag OFF | 🔴 | 🔴 | n/a | 🔴 | flag-on/off behavior NOT tested |
| Create campaign | ✅ | ✅ | 🔴 | 🔴 | tested |
| Edit campaign attribution numbers (CRIT-143 fraud vector) | 🔴 | 🔴 | 🔴 | 🔴 | direct-edit allowed; structured adjustment not built; NOT tested |
| Notification template create/edit/delete (CRIT-138) | 🔴 | 🔴 | 🔴 | 🔴 | XSS sanitization NOT tested; multi-language NOT tested |
| A/B test create/start/end (feature-flag gated) | ✅ | 🔴 | 🔴 | 🔴 | basic flow tested |

### A-10 System settings (CRIT-147)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| Edit commission rate | 🔴 | 🔴 | 🔴 | 🔴 | CRIT-147: junior admin can edit; NOT tested |
| Edit auth.lock_threshold | 🔴 | 🔴 | 🔴 | 🔴 | NOT tested |
| Edit security.rate_limit_max_requests | 🔴 | 🔴 | 🔴 | 🔴 | NOT tested |
| Reset to default | 🔴 | 🔴 | 🔴 | 🔴 | NOT tested |
| Cache flush | 🔴 | 🔴 | 🔴 | 🔴 | DoS via repeated flush untested |
| View setting history | 🔴 | n/a | 🔴 | 🔴 | NOT tested |
| Sensitive setting plaintext display (CRIT-150) | 🔴 | n/a | 🔴 | 🔴 | NOT tested |
| Cancellation policy editor (gold standard) | 🟡 | ✅ | ✅ | ✅ | `cancellation-policy-page-bug-1170-admin-ui.test.ts` SRC-REGEX (delete + replace); server REAL |

### A-11 Dashboard (CRIT-148)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| KPIs render | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| Guarantee fund runway visible (CRIT-148) | 🔴 | n/a | 🔴 | 🔴 | per-role gate NOT tested |
| Revenue trend chart | 🟡 | 🔴 | n/a | 🔴 | shallow |
| Operational alerts merge (DSR + general) | 🔴 | 🔴 | n/a | 🔴 | not tested |
| Quick actions deep links | 🔴 | n/a | n/a | 🔴 | broken `/financials/reports` not tested (MED-365) |
| Cities row links to /service-areas/:id | 🔴 | n/a | n/a | 🔴 | broken link (MED-364) |

### A-12 Analytics (CRIT-149)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| A/B test list (feature flag gated) | ✅ | 🔴 | 🔴 | 🔴 | tested |
| Cohort retention | 🟡 | 🔴 | 🔴 | 🔴 | shallow |
| Churn list with phone+spend (CRIT-149 PII) | 🔴 | n/a | 🔴 | 🔴 | per-role gate NOT tested |
| Quality scores recompute (DoS via repeated click) | 🔴 | 🔴 | 🔴 | 🔴 | NOT tested |
| Commission optimization view | 🟡 | 🔴 | 🔴 | 🔴 | shallow |

### A-13 Audit log (CRIT-135)

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| List audit log entries | ✅ | ✅ | ✅ | ✅ | tested |
| Filter by action / entityType | ✅ | ✅ | n/a | ✅ | tested |
| Filter by from/to date (CompliancePage tab) | ✅ | n/a | n/a | ✅ | tested |
| CSV export (Bug 401 self-audit) | ✅ | ✅ | ✅ | ✅ | tested |
| Sensitive field redaction in oldValues/newValues (CRIT-135) | 🔴 | n/a | 🔴 | 🔴 | NOT tested — schema accepts anything per CRIT-152 |
| Tamper-evident hash chain | 🔴 | n/a | n/a | 🔴 | not built; not tested |

### A-14 Staff & roles

| Action | Happy | Failed | Permission | Edge | Coverage |
|---|:-:|:-:|:-:|:-:|---|
| List staff | ✅ | ✅ | ✅ | ✅ | server REAL |
| List roles | ✅ | ✅ | ✅ | ✅ | tested |
| Create role with permissions | ✅ | ✅ | ✅ | ✅ | tested |
| Edit role | ✅ | ✅ | ✅ | ✅ | tested |
| Delete role (only if 0 staff) | ✅ | ✅ | ✅ | ✅ | tested |
| Add staff member (paste user UUID) | ✅ | ✅ | ✅ | ✅ | tested at server; UX MED-316 |
| Update staff role | ✅ | ✅ | ✅ | 🔴 | self-deactivation lockout untested (MED-318) |
| Remove staff | ✅ | ✅ | ✅ | ✅ | tested |
| List permissions | ✅ | n/a | ✅ | ✅ | tested |

---

## RUNTIME / E2E (currently 0% covered)

Every flow above marked ⚙️ requires the runtime harness from Phase I-A. There are no Docker-based + DB-state-checked + screenshot-evidenced tests today. The following are the priority E2E flows:

| E2E flow | Why critical | Phase I-A priority |
|---|---|---|
| Customer signup → book → pay → service performed → confirm → review | full money path; touches 10+ tables | P0 |
| Customer cancels in each refund tier | wallet conservation per tier | P0 |
| Provider accepts → arrives → completes (with photos + signature) | CRIT-102/103/104/105 root cause | P0 |
| Erasure DSR → confirm DB anonymization | CRIT-136 NPC compliance | P0 launch-blocking |
| Junior admin tries to edit commission rate | CRIT-147 server gate | P0 launch-blocking |
| Junior admin tries to suspend provider | CRIT-130 server gate | P0 launch-blocking |
| Pricing rule with multiplier 5×, all-day, all-services | CRIT-142 platform-wide pricing | P0 launch-blocking |
| Notification template body with `<script>` tag | CRIT-138 XSS sanitization | P0 launch-blocking |
| Concurrent webhook calls for same booking | CRIT-19/20/21 idempotency | P1 |
| 1000 concurrent bookings stress test | scalability | P2 |
| Browser compat (Chrome / Safari / Edge) | admin web | P2 |

---

## Coverage summary by user side

| Side | Real tests | Shallow tests | Untested | Critical-untested |
|---|---:|---:|---:|---:|
| **Customer** | ~30% (validators + money math) | ~40% (R7-real shallow) | ~30% | erasure DSR, KYC verify side-effects, photo `file://`, recurring rebooking |
| **Provider** | ~25% | ~50% | ~25% | onboarding theatre, KYC docs, job completion, earnings (fake data) |
| **Admin** | ~40% (validators + service tests) | ~30% (R7-real shallow) | ~30% | role gating on every mutation, settings unbounded edits, attribution fraud |

The percentages are estimates from the matrix — call them ±10%. The matrix has the granular cells.

---

## Total tests-to-write (rough count from matrix)

| Layer | Count |
|---|---:|
| New `*.behavior.test.tsx` for 29 admin pages | 29 |
| New `*.behavior.test.tsx` for ~85 mobile screens | 85 |
| New `*.unit.test.ts` for missing service paths (recurring rebooking, force-complete, sent-back resubmit, KYC verify, erasure executor, breach log create, ...) | ~50 |
| New `*.unit.test.ts` for missing validators (currently inline-mocked patterns) | ~20 |
| Replacement for the 25 deleted SRC-REGEX files (real behavioral tests) | 25 |
| Phase I-A E2E flows (priority list above) | ~15 P0 + ~10 P1 + ~5 P2 = 30 |
| **Total new tests** | **~240** |

This is a 1.1x increase on the existing 218 → ~458 total. Each test averaging 50-100 lines = 12,000-24,000 new lines of test code. Spread across the dispatches in Phase I-B.
