# HONEST AUDIT — onService PH

**Date:** April 27, 2026
**Latest commit verified:** `322330a`
**Verified by:** Direct git clone in this session, file-by-file inspection

> **HISTORICAL SNAPSHOT (2026-08-22):** this audit describes commit `322330a` from April 2026. Its screen counts, dependency counts, money settings, launch conclusions, and statements that findings "still stand" are not current verification. Keep it as audit history only. Use `docs/audits/CURRENT-PLATFORM-AUDIT-2026-08-22.md` for the current baseline and `CLAUDE.md` for binding direction.

This document is what's actually true about the codebase, the prior plans, and the strategic choices. Where I was wrong before, I say so explicitly.

---

## Part 1 — Where I was wrong across our chats

### Wrong claim 1: "Every successful marketplace started with one category."

I said this when I recommended Boracay-only / AC-cleaning-only / B2B-first. It is wrong as stated.

**Truth:** TaskRabbit launched 2008 in Boston as a multi-task framework — task posting was the model, not "one category." Thumbtack 2008 launched broad. Urban Company / UrbanClap 2014 launched with multiple categories. Handy 2012 did launch cleaning-first but expanded to handyman within 18 months. Helpling 2014 was cleaning-only and went bankrupt in NL. Homejoy 2010 was cleaning-only and shut down in 2015.

**The real pattern is not narrow vs broad.** It is whether you have **one anchor service that drives repeat behavior fast enough to fund the others** AND **enough density in one geography for unit economics to work**. Cleaning is the canonical anchor (rebooks every 2-4 weeks). AC cleaning works in PH because of the climate (3-6 month cycle per unit, 2-4 units per home).

**Corrected position for onService PH:** Multi-service from day one is right for Ken given (a) the codebase already supports 14 categories with the full pricing model, (b) CleanHub data proves PH demand spans cleaning, plumbing, electrical, painting, (c) no incumbent owns the category, so "we only do one thing" isn't a useful brand. Stay in 1-2 cities. Cleaning + AC are the anchors that fund discovery of plumbing, electrical, painting.

### Wrong claim 2: "I audited the codebase" (when I hadn't fully)

I described the codebase as if I had it open in some sessions when I was working from memory of earlier sessions. I should have re-cloned every time.

**Truth as of now (verified this session):**
- Latest commit `322330a` titled "feat(platform): audit fixes - JWT security, GPS enforcement, provider accountability"
- 109 backend TypeScript files, 14,065 lines of service code across 39 services
- 83 mobile screens (`apps/mobile/app/`)
- 19 admin pages totaling 6,281 lines (`apps/admin/src/pages/`)
- Only 7 reusable admin UI components — explains the inconsistency feel
- 49 SQL migrations through `049_provider_cancellation_tracking.sql`
- 21 test files, 2,256 lines, including `escrow-money-conservation.test.ts`
- 9 root MD docs, 7,509 lines total

**All 7 critical money bugs from the 271-issue audit are FIXED:**
- CRIT-001 (commission base) → fixed: `calculateCommission(servicePrice, providerTier)` correctly uses `servicePrice`
- CRIT-002 (wallet UNIQUE) → fixed: migration 034 changed `UNIQUE(user_id)` to `UNIQUE(user_id, type)`
- CRIT-005 (dispute imports) → fixed: `dispute.service.ts` imports `escrowService`
- All others verified by file inspection

**All 8 config decisions from CONF-001 through CONF-008 are at spec values:**
- Commission rates: new 15% / verified 13% / pro 11% / elite 9%
- Service fee: 10%
- Dispute window: 48 hours
- Min withdrawal: ₱100 (10000 centavos)
- Cancellation tiers: match FR-102 exactly

### Wrong claim 3: "Boracay is the only right launch city."

I made this case strongly in chat 771a0b44 (April 16). The case itself was correct; the framing as "only right" was oversold.

**Truth:** Boracay has unique strengths (10.32 sq km density, you live there, tourism B2B contracts can fund operations early, no serious branded competition). It has unique weaknesses (37K residents, seasonal demand, expansion crosses water via Caticlan ferry). GenSan has 722K population and four major malls — but you don't live there, would need a hired city manager (₱45-60K/month), and cannot personally walk to providers and customers. Davao has 1.83M and the largest Mindanao TAM but is too expensive to crack at launch. Cebu has the most demand AND the most competition.

**Corrected and settled position (per April 16 chat):** **Boracay primary at launch, expand to Kalibo (Aklan capital, m6), then Iloilo (regional anchor, m12).** The codebase is genuinely city-agnostic — the decision is tactical not foundational — but the answer is Boracay-Kalibo-Iloilo per the past chat.

A previous version of this package (and earlier drafts of `STRATEGY.md` and `MARKETING-PLAYBOOK.md`) recommended a Boracay + GenSan dual launch. That contradicts the April 16 decision and has been corrected. If Ken wants to revisit GenSan as a launch market, that's his call — but the default is the settled path above.

### Wrong claim 4: "5000 things to fix."

I told you 5000 is fake. Correct. But I then produced new "175 distinct issues" lists in some chats without reconciling with `COMPREHENSIVE-271-ISSUE-AUDIT.md` which is the canonical artifact.

**Truth:** The 271-issue audit is real. 7 are critical (all fixed). 8 are config (all resolved). The rest are organized into 13 categories, all addressed by the phase plan in this package.

### Wrong claim 5: "AI coder will execute this plan flawlessly with the right instructions."

Implied in earlier chats. Not true.

**Truth:** AI coders make mistakes regardless of instruction quality. The verification protocol in this package is designed to catch the most common categories of failure (phantom tests, silent type drops, missing migrations, race conditions, n+1 queries) — but it is not a guarantee. Ken is the QA reviewer. That is the honest reality.

### Wrong claim 6: "Multi-quote bidding should be parked."

I recommended it in earlier chats. It would break custom-quote workflows for plumbing, electrical, painting where scope is genuinely unknown until the provider visits.

**Corrected position:** Keep multi-quote enabled. Park behind feature flags ONLY: Suki gamification UI, referral cash-out flow, advanced A/B testing in admin, churn prediction analytics. Core booking flows stay enabled.

---

## Part 2 — Ground truth from the codebase (verified)

### What's substantial and works

**Backend services (39, 14,065 lines):**
The largest are booking (1040), dispute (783), provider (776), admin-analytics (750), provider-tools (743), service-area (634), data-management (548), business (537), security (524), admin (512), recurring (482), escrow (442), notification (441), pricing (411). All have substantial implementations.

**Multi-service support is real:**
- `service_categories` table with UUID PK, slug, display_order, is_active
- `service_subcategories` table with `pricing_type` ENUM (`fixed` / `quote` / `hourly`), base_price, min_price, max_price, estimated_duration_minutes
- `services` table mapping providers to subcategories
- `service_addons` table (migration 040)
- Spec calls for 14 categories: cleaning, plumbing, electrical, painting, HVAC/aircon, pest control, moving, carpentry, appliance repair, lawn & garden, spa & wellness, laundry, deep cleaning, handyman

**Multi-area support is real:**
- `service_areas` table with full status workflow: planned → recruiting → soft_launch → active → paused → retired
- Per-area: launch_date, launched_at, min_providers_to_launch, active_provider_count, active_customer_count, total_bookings, center_lat, center_lng, radius_km
- `area_waitlist` table for customers in not-yet-served areas
- `provider_service_areas` join table (one provider works multiple areas, one is_primary)
- Backend service: `service-area.service.ts` (634 lines)

**Pricing rules engine is real:**
- `pricing_rules` table supports rush, holiday, peak_hours
- Per-rule: multiplier (1.0-5.0), category scope, area scope, priority, platform_surge_share
- Stored on each booking: `surge_multiplier`, `surge_amount`, `pricing_rule_id`
- Admin page: `PricingRulesPage.tsx` (624 lines — the most complex admin page)

**Money flow is correct:**
- Commission calculation uses `service_price`, not `total_amount`
- Service fee: 10% with min ₱25, max ₱500
- Cancellation refund logic uses `platformConfig.cancellationFees` (was previously hardcoded — fixed)
- Wallets support dual-role users
- Escrow state machine: UNPAID → ESCROW_HELD → PENDING_CONFIRMATION → ESCROW_RELEASED → PAYOUT_PROCESSING → PAID_OUT (with disputed/refund branches)
- Tests: `escrow-money-conservation.test.ts` (60 lines), `commission.test.ts` (137 lines), `dispute-refund-processing.test.ts` (69 lines)

**B2B is real:**
- Migration 021 `b2b_commercial.sql`
- Service: `business.service.ts` (537 lines)
- Admin: `BusinessAccountsPage.tsx` (238 lines)
- Recurring contracts, multi-property accounts, billing-as-account

**Suki / loyalty is real:**
- Service: `suki.service.ts` (335 lines)
- Migration 031: `add_suki_discount_to_bookings.sql`
- Customer screen: `customer/suki-pros.tsx`
- Provider screen: `provider/suki-customers.tsx`
- Customer-provider relationship tracking with discount on rebook with same provider

**Provider lifecycle is comprehensive:**
- Migration 035: `provider_onboarding_documents.sql`
- Migration 042: `provider_portfolios_certifications.sql`
- Migration 049: `provider_cancellation_tracking.sql`
- Migration 043: `availability_overrides.sql`
- Migration 039: `provider_payout_preferences.sql`
- Service: `provider.service.ts` (776 lines), `provider-tools.service.ts` (743 lines)

**Insurance / SiguradoShield architecture exists:**
- Self-funded guarantee fund wallet type
- `customer/safety.tsx` mobile screen exists
- Spec describes layered approach: platform guarantee + per-job opt-in (Igloo/Malayan)
- Igloo integration: NOT YET WIRED (backend has the structure, no API integration)

**Real-time / messaging:**
- Socket.io: `socket.service.ts` (169 lines)
- In-app chat: `messaging.service.ts` (205 lines)
- Push: migration 016 `create_push_tokens.sql`
- Expo push notifications wired

**Admin RBAC:**
- Migration 046: `admin_staff_roles.sql` — full role system
- Migration 047: `admin_totp_2fa.sql` — 2FA infrastructure (not yet enforced on login)
- Service: `staff.service.ts` (275 lines)
- Admin page: `StaffRolesPage.tsx` (442 lines)

**Notification system:**
- Templates editable: `NotificationTemplatesPage.tsx` (390 lines)
- Per-user preferences: migration 041 `notification_preferences.sql`
- Channels: SMS, push, email, in-app

### What's missing or thin

**Provider detail view: MISSING**
- `App.tsx` has only `<Route path="/providers" element={<ProvidersPage />} />`
- No `<Route path="/providers/:id" />`
- Spec called for 6 tabs (Profile / Jobs / Financials / Reviews / Disputes / Activity log)
- Phase 05 builds this

**Customer detail view: MISSING**
- `CustomersPage.tsx` is 144 lines — list only
- No detail route
- Phase 06 builds this

**Booking detail view (admin): MISSING**
- `BookingsPage.tsx` is 190 lines — list only
- No detail route
- Phase 07 builds this

**Dashboard charts: MISSING (the most visible gap)**
- `DashboardPage.tsx` is 107 lines, all KPI cards with **emoji icons**
- Recharts is installed in admin/package.json but unused
- Spec called for: revenue trend (30d line), booking volume (7d bar by category), customer acquisition (line), alert feed, quick actions
- Phase 04 rebuilds this

**Icon library: MISSING**
- Zero `lucide-react` or `lucide-react-native` imports
- 73 emoji uses across the codebase
- 18 emoji icons in admin sidebar nav alone (every nav item is an emoji)
- Phase 02 fixes all of this

**Audit log diff viewer: THIN**
- `audit_log` table exists
- `AuditLogPage.tsx` exists (250 lines) — verify in Phase 11

**Real-time admin updates: PARTIAL**
- React-query refetchInterval used on most pages
- Socket.io NOT wired to admin
- Phase 10 wires socket to admin

**Export functions: MISSING**
- No CSV / Excel / PDF export on any admin table
- Phase 04-08 add export to relevant tables

**Map view of service areas: MISSING**
- `ServiceAreasPage.tsx` is table only
- Phase 08 adds map view

**Real-time dispatch console: MISSING**
- Spec describes a real-time view of all active bookings with provider locations
- Currently providers and bookings are managed separately
- Phase 10 builds this

**BIR-compliant invoice generation: MISSING**
- `invoice.service.ts` (371 lines) has VAT computation
- No PDF generation
- No sequential OR numbering
- No Form 2307 generation
- Phase 08 builds this

**Sentry integration: MISSING**
- Phase 12 adds this

**2FA on admin login: PARTIAL**
- Schema in migration 047
- Login flow not yet wired
- Phase 12 enforces this

**File upload presigned URLs: VERIFY**
- `upload.service.ts` (172 lines) exists
- Audit item BACK-001 says this is missing — but the service file exists, so this is a verify-then-fix in Phase 03

### 39 missing Stitch screens (per audit Section 3)

Launch-critical (Phase 09 builds these first):
1. `safety_insurance_info` — SiguradoShield trust screen
2. `identity_verification` — Provider KYC
3. `document_upload` — Provider doc management
4. `background_check_status` — Vetting progress
5. `help_center` — FAQ + support
6. `manage_addresses` — Address CRUD
7. `terms_privacy_consent` — NPC compliance
8. `payment_failed_error_state` — Dedicated payment error UI

High priority:
9. `service_checklist` — Provider job checklist
10. `before_after_photos` — Photo comparison view
11. `saved_payment_methods` — Manage GCash/Maya/cards
12. `add_card_wallet` — Wallet top-up flow
13. `media_inspection_gallery` — Photo evidence for disputes
14. `urgency_selector` — Rush booking with surge display
15. `home_care_plan_selection` — Subscription plan picker
16. `subscriptions_management` — Manage recurring bookings

Medium priority:
17. `tax_documents_access` — BIR document center
18. `customer_dashboard_v2` — Alternate layout
19. `set_service_area` — Provider area map with draggable radius
20. `skill_selection` — Provider skill picker
21. `mark_job_completed` — Dedicated completion screen
22. `job_photo_uploads` — Photo upload per job
23. `work_summary` — Post-job summary
24. `navigation_to_job` — Turn-by-turn integration
25. `redeem_credits_modal` — Wallet redemption modal
26. `referral_message_preview` — Preview share message
27. `referral_status_rewards` — Detailed referral dashboard
28. `live_chat_support` — Customer support chat
29. `dashboard_loading_state` — Skeleton loading

Admin screens:
30. `marketing_growth_tools` — Promo management
31. `staff_roles_permissions` — Staff/role admin (verify against existing StaffRolesPage)
32. `global_system_settings` — System config UI (per RUNTIME-CONFIG-SPEC)
33. `system_audit_logs` — Audit log viewer
34. `booking_oversight_control` — Real-time monitor (Phase 10)
35. `dispute_quality_control` — Dispute QC dashboard

Edge cases:
36. `password_reset` — Admin password reset (mobile uses phone+OTP)
37. `empty_bookings_state` — Empty state polish
38. `notification_settings` — Granular per-channel preferences
39. `customer_dashboard_v2` — Compare layouts

---

## Part 3 — The 271-issue audit reconciled

| Category | Count | Status |
|---|---|---|
| CRITICAL Money Bugs | 7 | All FIXED |
| Config vs Spec Mismatches | 8 | All RESOLVED at spec values |
| Missing Stitch Screens | 39 | Phase 09 |
| UX/UI Quality Gaps | 55 | Phase 02 (icons), Phase 09 (screens), Phase 04 (dashboard) |
| Insurance & Protection Design | 18 | Phase 11 + INSURANCE.md spec |
| Provider Accountability System | 12 | Phases 03, 05 |
| Dispute/Complaint/Ticket Flows | 15 | Phase 07, 11 |
| Wallet/Escrow/Release Flows | 11 | Phase 03, 08 |
| Missing Buttons/Clicks/Features | 35 | Phases 04-09 |
| Admin Panel Gaps | 18 | Phases 04-11 |
| Backend Service Gaps | 14 | Phase 03 (config), Phase 12 (Sentry, etc) |
| Performance & Quality | 12 | Phase 12 |
| i18n & Localization | 10 | RESOLVED — English only |
| Security Hardening | 9 | Phase 12 |
| Accessibility & Inclusivity | 8 | Phase 02 (semantic icons help), Phase 09 |

**Net:** 264 of 271 items addressed by the phase plan. The 7 critical money bugs are already fixed. The 10 i18n items are resolved by the "English only" decision. Every other item has a phase that addresses it.

---

## Part 4 — Honest assessment of remaining risk

After all phases complete:

**Low risk (high confidence we'll get this right):**
- Money flow correctness (already covered by tests)
- Multi-area architecture (already DB-driven)
- Multi-service catalog (already built)
- Admin functional depth (each phase adds verified scope)
- Mobile screen completeness (39 screens mapped)

**Medium risk (will require careful testing):**
- BIR compliance — Philippine accountant should review the 2307 generation, sequential OR numbering, monthly filings before Ken trusts it for live use
- NPC compliance — DPO should validate the consent flow and DSR queue
- Real-time dispatch console — websockets at scale require monitoring
- Insurance integration — Igloo/Malayan partner integration is real work that requires their API access and underwriting agreement
- PayMongo at volume — webhook reliability under load
- Performance at 1000+ active bookings — needs realistic load testing

**Higher risk (needs human attention):**
- Marketing execution — the playbook is detailed but ads, kiosks, billboards, influencer partnerships all require operational work
- Provider quality — TESDA partnership pipelines exist on paper; converting to actual recruited providers is field work
- Dispute resolution at scale — first 100 disputes need manual review by Ken or an ops lead to calibrate the auto-resolution rules
- Anti-Dummy Law — Ken is a foreigner; if onService PH is to be an actual Philippine corporate entity, Ken needs a Philippine lawyer to advise on structure (this is in COMPLIANCE.md)

The plan addresses the technical risks. The non-technical risks remain operational and require Ken's direct attention.

---

## Part 5 — What this means for the work

The codebase is **70-80% there**. The phase plan completes the remaining 20-30%. After Phase 12, onService PH is genuinely launch-ready:
- Multi-service from day one
- Multi-city from day one
- Commercial-grade admin (no emoji icons, real charts, real detail views, real exports, real audit log)
- BIR-compliant
- Real-time dispatch
- Sentry-monitored
- 2FA-secured
- Compliance-aware

This is fast because most of the foundation is built. The remaining work is mostly UI depth, integration polish, and gap-filling — not greenfield engineering.
