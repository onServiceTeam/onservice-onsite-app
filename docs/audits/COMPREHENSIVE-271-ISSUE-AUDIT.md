# ONSERVICE ONSITE APP — COMPREHENSIVE 250+ ISSUE AUDIT
> **HISTORICAL ISSUE INVENTORY (2026-08-22):** this is the original pre-remediation list, not a current open-bug list. Many entries were fixed, superseded, or replaced by later decisions. Do not implement a money/config value from this file without checking current code, `LAUNCH-LIMITATIONS.md`, and the active decision/escalation records. Current audit: `docs/audits/CURRENT-PLATFORM-AUDIT-2026-08-22.md`.
# ════════════════════════════════════════════════════════
# Source: Full repo review + 90 Stitch screen comparison
# Total issues: 250+ across 15 categories
# Priority: CRITICAL → HIGH → MEDIUM → LOW → ENHANCEMENT
# ════════════════════════════════════════════════════════

# TABLE OF CONTENTS
# Section 1:  CRITICAL Money Bugs (7 issues)
# Section 2:  Config vs Spec Mismatches (8 issues)
# Section 3:  Missing Stitch Screens (39 screens)
# Section 4:  UX/UI Quality Gaps (55 issues)
# Section 5:  Insurance & Protection Design (18 issues)
# Section 6:  Provider Accountability System (12 issues)
# Section 7:  Dispute/Complaint/Ticket Flows (15 issues)
# Section 8:  Wallet/Escrow/Release Flows (11 issues)
# Section 9:  Missing Buttons/Clicks/Features (35 issues)
# Section 10: Admin Panel Gaps (18 issues)
# Section 11: Backend Service Gaps (14 issues)
# Section 12: Performance & Quality (12 issues)
# Section 13: i18n & Localization (RESOLVED — English only, no i18n needed)
# Section 14: Security Hardening (9 issues)
# Section 15: Accessibility & Inclusivity (8 issues)


# ════════════════════════════════════════════════════════
# SECTION 1: CRITICAL MONEY BUGS
# (See CODE-AUDIT-AND-FIX-INSTRUCTIONS.md for exact code fixes)
# ════════════════════════════════════════════════════════

CRIT-001 | Escrow release uses total_amount instead of service_price for commission — creates money from nothing
CRIT-002 | Wallet UNIQUE(user_id) allows only ONE wallet per user — dual-role users get wrong wallet
CRIT-003 | Escrow status set to 'released' BEFORE money moves — data integrity violation if release fails
CRIT-004 | handleCancellation uses total_amount for refund percentages — same root cause as CRIT-001
CRIT-005 | Dispute resolution NEVER processes actual refunds — dispute.service.ts has zero escrow/wallet imports
CRIT-006 | Mobile checkout never sends servicePrice — all bookings created with ₱0 price
CRIT-007 | Suki points calculated on total_amount — includes platform fee, inflates loyalty cost


# ════════════════════════════════════════════════════════
# SECTION 2: CONFIG VS SPEC MISMATCHES
# ════════════════════════════════════════════════════════

CONF-001 | Commission rates changed without approval
  Spec says: new=15%, verified=13%, pro=11%, elite=9%
  Code has:  new=20%, verified=18%, pro=15%, elite=12%
  The AI coder increased all rates by ~5%. Ken must decide which to use.
  File: packages/api/src/config/platform.config.ts AND apps/mobile/src/config/platform.config.ts

CONF-002 | Service fee rate changed without approval
  Spec says: 10% (with ₱25 min, ₱500 max)
  Code has:  5% (with ₱25 min, ₱500 max)
  Half the specified rate. Significant revenue impact.
  File: both platform.config.ts files

CONF-003 | Cancellation fee config exists but is NEVER USED
  platformConfig.cancellationFees = { beforeMatch: 0, afterMatch: 0.05, ... }
  But commission.service.ts calculateCancellationRefund() uses HARDCODED percentages.
  The config values are dead code.
  Fix: Wire calculateCancellationRefund to read from platformConfig

CONF-004 | Cancellation percentages differ from FR-102 spec
  Spec FR-102 table:
    >24h before: 100% customer / 0% provider
    2-24h: 100% / 0%
    1-2h: 90% / 10%
    30min-1h: 80% / 20%
    <30min or provider en route: 70% / 30%
    After arrival: 50% / 50%
    Customer no-show: 0% / 100%
  Code (commission.service.ts):
    >=2h: 100% / 0% ✓
    1-2h: 90% / 10% ✓
    0.5-1h: 80% / 20% ✓
    0-0.5h: 70% / 30% ✓
    providerArrived: 50% / 50% ✓
    But MISSING: customer no-show (0% / 100%) ← not handled at all

CONF-005 | escrowDisputeWindowHours is 24 but spec says 48
  Spec: "Customers have 48 hours to dispute after completion"
  Code: escrowDisputeWindowHours: 24

CONF-006 | JWT expires in 7 days (backend) but mobile shows 15 minutes
  Backend: jwtExpiresIn: '7d'
  Spec: "Hard 15-minute session ceiling per VHA Directive 6500"
  This is for VistA, not onService — but the JWT should still be shorter (15min access + 30d refresh)

CONF-007 | minimumWithdrawalAmount is ₱500 in config but spec says ₱100
  Config: minimumWithdrawalAmount: 50000 (₱500)
  Spec: "Minimum withdrawal ₱100"

CONF-008 | Provider no-show detection doesn't check providerArrived status
  The handleCancellation function receives providerArrived as a parameter,
  but booking.routes.ts always passes `false`:
  `await escrowService.handleCancellation(id, hoursUntil, false);`
  It should check if the booking status ever reached 'provider_arrived'.


# ════════════════════════════════════════════════════════
# SECTION 3: MISSING STITCH SCREENS (39 not built)
# ════════════════════════════════════════════════════════

# LAUNCH-CRITICAL (must have before soft launch):
MISS-001 | safety_insurance_info — SiguradoShield™ buyer protection screen
MISS-002 | identity_verification — Provider KYC / government ID upload
MISS-003 | document_upload — Provider document management
MISS-004 | background_check_status — Provider verification progress tracker
MISS-005 | help_center — FAQ, search, category browse, support chat CTA
MISS-006 | manage_addresses — Address list with add/edit/delete/set-default
MISS-007 | terms_privacy_consent — Dedicated terms acceptance screen
MISS-008 | payment_failed_error_state — Dedicated payment error with retry

# HIGH PRIORITY (needed for good UX):
MISS-009 | service_checklist — Provider job checklist with progress bar, photo per item, required tags
MISS-010 | before_after_photos — Photo comparison view (before service / after service)
MISS-011 | saved_payment_methods — Manage saved GCash/Maya/cards
MISS-012 | add_card_wallet — Wallet top-up flow
MISS-013 | media_inspection_gallery — Photo evidence gallery for disputes
MISS-014 | urgency_selector — Dedicated rush/emergency booking UI with surge pricing display
MISS-015 | home_care_plan_selection — Subscription/recurring service plan selection
MISS-016 | subscriptions_management — Manage recurring bookings (backend exists, no mobile UI)

# MEDIUM PRIORITY (post-launch):
MISS-017 | tax_documents_access — BIR tax document center (2316 forms, receipts)
MISS-018 | customer_dashboard_v2 — Alternate dashboard layout (compare with current)
MISS-019 | set_service_area — Provider service area map with draggable radius
MISS-020 | skill_selection — Provider skill/category selection with search
MISS-021 | mark_job_completed — Dedicated job completion screen for providers
MISS-022 | job_photo_uploads — Photo upload screen for before/during/after
MISS-023 | work_summary — Post-job summary with breakdown
MISS-024 | navigation_to_job — Turn-by-turn navigation integration
MISS-025 | redeem_credits_modal — Wallet credit redemption modal
MISS-026 | referral_message_preview — Preview referral share message
MISS-027 | referral_status_rewards — Detailed referral tracking dashboard
MISS-028 | live_chat_support — Customer support chat (different from provider chat)
MISS-029 | dashboard_loading_state — Skeleton loading states (some exist, not all screens)

# ADMIN SCREENS:
MISS-030 | marketing_growth_tools — Admin marketing/promo management
MISS-031 | staff_roles_permissions — Admin staff/role management
MISS-032 | global_system_settings — Admin system configuration UI
MISS-033 | system_audit_logs — Admin audit log viewer (backend exists)
MISS-034 | booking_oversight_control — Real-time booking monitor
MISS-035 | dispute_quality_control — Quality metrics dashboard for disputes

# EDGE CASES:
MISS-036 | password_reset — Not applicable (phone+OTP), but needed for admin
MISS-037 | empty_bookings_state — Some empty states exist, verify all screens have them
MISS-038 | notification_settings — Granular notification preferences (push/SMS/email per type)
MISS-039 | customer_dashboard_v2 — Compare alternate layout, use best elements


# ════════════════════════════════════════════════════════
# SECTION 4: UX/UI QUALITY GAPS
# ════════════════════════════════════════════════════════

# --- Stitch vs Built Visual Differences ---

UX-001 | Home screen uses emoji (🧹🔧⚡) for category icons instead of proper SVG/icon components
  Stitch has: Clean line icons in circular backgrounds
  Built has: Raw emoji text
  Fix: Use lucide-react-native or custom SVG icons with themed circle backgrounds

UX-002 | Home screen missing user avatar in header
  Stitch has: Circular avatar photo top-left
  Built has: Text greeting only

UX-003 | Home screen missing location selector with dropdown
  Stitch has: "Current Location • 123 Main St ▾" selector
  Built has: No location display at all

UX-004 | Active booking card missing gradient background
  Stitch has: Blue gradient card with provider photo, status badge, "Track Status" button
  Built has: Flat background card

UX-005 | Promo carousel missing
  Stitch has: Horizontal scrolling promo cards ("20% Off First Booking", "Join for Free")
  Built has: No promo section at all

UX-006 | Category grid needs better spacing and visual treatment
  Stitch has: 4-column grid with icon + label, light background cards
  Built has: Emoji in plain text layout

UX-007 | Wallet screen missing earnings chart
  Stitch has: Bar chart showing daily/weekly earnings trend
  Built has: Balance + transaction list only, no chart

UX-008 | Wallet screen missing "Earned Today" and "Pending" stat cards
  Stitch has: Two stat cards below balance
  Built has: Single balance display

UX-009 | Transaction list items missing colored type-specific icons
  Stitch has: Different colored circle icons per transaction type (wrench, paintbrush, bank)
  Built has: Generic icons or no icons

UX-010 | Confirmation screen missing map preview
  Stitch has: Embedded Google Maps preview of service location
  Built has: Text address only

UX-011 | Confirmation screen missing "Satisfaction Guarantee Included" badge
  Stitch has: Green badge at bottom
  Built has: No guarantee mention

UX-012 | Review screen missing "What went well?" tag chips
  Stitch has: Quick-tap chips (Professional, Punctual, Great Value, Friendly, Cleaned up)
  Built has: Only star rating + text review

UX-013 | Review screen should combine rating + tip into one flow
  Stitch has: Tip section embedded in the review screen
  Built has: Separate screens (review.tsx → tip.tsx)
  Consider: Combine for fewer taps

UX-014 | Review screen missing character counter on textarea
  Stitch has: "0/500" counter
  Built has: No counter shown

UX-015 | Review screen missing "Add private note to platform" expandable
  Stitch has: Private feedback option separate from public review
  Built has: Only public review

UX-016 | Provider dashboard missing online/offline status badge
  Stitch provider_home_dashboard has: Green "ONLINE" badge top-right
  Built has: Toggle exists but less prominent

UX-017 | Provider dashboard missing map view of today's jobs
  Stitch has: Embedded map showing job locations
  Built has: List view only

UX-018 | Provider dashboard missing "Scan QR" quick action
  Stitch has: Scan QR, Support, History quick action buttons
  Built has: Different quick action layout

UX-019 | Provider wallet missing weekly earnings summary
  Stitch has: "$850.00 this week" subtitle under daily earnings
  Built has: Only current balance

UX-020 | Service checklist not built at all (Stitch has full design)
  Stitch has: Progress bar, categorized checklist, timestamps per item, photo upload per item, "Report Issue" per item
  Built has: Nothing — this feature is entirely missing

# --- General UX Issues ---

UX-021 | No skeleton loading states on most screens — shows blank white until data loads
UX-022 | No offline indicator banner when internet is lost
UX-023 | No haptic feedback on any interactive element (tap, success, error)
UX-024 | Pull-to-refresh not implemented on all list screens
UX-025 | No swipe-to-dismiss on any modal or bottom sheet
UX-026 | No transition animations between screens (instant cuts)
UX-027 | Back buttons are all text arrows ("←") instead of proper icon components
UX-028 | No search within booking history (filter by date/service/status exists, no text search)
UX-029 | No empty state illustrations — all empty states are just text
UX-030 | Date picker shows next 14 days but no calendar view option
UX-031 | Time slots are hardcoded chips — no way to request custom time
UX-032 | Address picker has no "Use Current Location" prominent button
UX-033 | Checkout screen doesn't show estimated arrival/duration
UX-034 | Booking detail receipt doesn't have a "Download PDF" option
UX-035 | No deep link support for push notifications (clicking notification doesn't navigate to relevant screen)
UX-036 | Chat doesn't support voice messages or file attachments
UX-037 | Chat doesn't show "online" status of the other party
UX-038 | Provider profile doesn't show portfolio photos
UX-039 | Provider profile doesn't show response time metric
UX-040 | No "Favorite Provider" / save provider feature
UX-041 | No service comparison feature (compare quotes side by side)
UX-042 | No estimated price range on category selection (before choosing specific subcategory)
UX-043 | No "Most Popular" or "Recommended" badges on services
UX-044 | Booking confirmation doesn't have share option (share with family member)
UX-045 | No in-app rating prompt after 5th booking (App Store / Play Store review)
UX-046 | Provider job acceptance doesn't show customer rating/history
UX-047 | No pre-booking questionnaire for complex services (e.g., "How many rooms?" for cleaning)
UX-048 | No service area verification before booking (check if provider serves customer's location)
UX-049 | Tip screen doesn't show suggested amounts based on service quality/price
UX-050 | Profile screen has no "Edit Profile Picture" option
UX-051 | No dark mode support
UX-052 | No font size / accessibility settings
UX-053 | Onboarding slides use emoji icons instead of proper illustrations
UX-054 | No "What's New" / changelog screen after app updates
UX-055 | Admin dashboard has no real-time update (must manually refresh)


# ════════════════════════════════════════════════════════
# SECTION 5: INSURANCE & PROTECTION DESIGN
# ════════════════════════════════════════════════════════

INS-001 | No SiguradoShield™ screen exists in the app
  Must build: customer/safety.tsx with full coverage details

INS-002 | Coverage limits not defined anywhere in the codebase
  Need to add to platformConfig:
  - maxPropertyDamageCoverage: 2500000 (₱25,000)
  - maxTheftCoverage: 1000000 (₱10,000)
  - maxInjuryCoverage: 5000000 (₱50,000)
  - propertyDamageDeductible: 50000 (₱500 for claims >₱5,000)
  - claimWindowHours: 48

INS-003 | Guarantee fund math not validated at runtime
  guaranteeFundRate is 0.015 (1.5%) but this needs financial modeling:
  - At ₱1M GMV/month: ₱750/month into fund
  - Expected claim rate: 1-2% of bookings
  - Average claim: ₱2,000-5,000
  - Fund may be insufficient in early months
  - Need: minimum fund threshold alert for admins

INS-004 | No insurance claim filing flow
  Current: Customer files a "dispute" which is generic
  Need: Dedicated insurance claim flow:
  1. Select claim type (property damage, theft, injury)
  2. Upload evidence (photos of damage, police report for theft, medical docs for injury)
  3. Estimated damage value
  4. Contact info for follow-up
  5. Auto-create dispute with claim metadata
  6. Track claim status separately from dispute status

INS-005 | No automatic claim assessment based on evidence
  Tier-1 auto-resolution only checks for no-shows
  Need: Photo AI analysis for damage claims (future enhancement)
  For now: Claims auto-escalate to Tier-2 admin review

INS-006 | Provider should bear primary liability — not fully designed
  Business rule: Provider is responsible for damage they cause
  Implementation needed:
  1. SiguradoShield covers the customer immediately (guarantee fund)
  2. Platform then recovers from provider's wallet/future earnings
  3. If provider can't pay: deduct from future payouts
  4. If provider disputes responsibility: escalate to Tier-3

INS-007 | No "Damage Waiver" for providers
  Providers should have option to purchase damage insurance:
  - Monthly premium: ₱200-500 depending on service type
  - Covers up to ₱50,000 in property damage claims
  - Reduces their deductible from 100% to 20%
  - Partner: Igloo microinsurance or Pioneer Insurance

INS-008 | Igloo integration not researched or designed
  Igloo (https://www.igloo.insure) offers embedded insurance APIs
  - Per-transaction microinsurance
  - Customer pays small premium (₱5-20 per booking) for enhanced coverage
  - Covers: property damage, theft, personal injury
  - Claims handled by Igloo's claims team
  - Platform earns commission on insurance sold
  Need: Research Igloo API, design integration

INS-009 | No insurance toggle on checkout
  Customer should be able to opt-in to enhanced coverage:
  - Free tier: SiguradoShield™ basic (guarantee fund, ₱25K max)
  - Paid tier: SiguradoShield™ Plus (Igloo-backed, ₱100K max)
  - Show premium cost at checkout (e.g., "+₱15 for enhanced protection")

INS-010 | Escrow hold doesn't prevent early fund release on disputed bookings
  If customer confirms job → escrow released → THEN discovers damage later
  The money is gone. Need: 48-hour "cooling off" period even after confirmation
  where funds can still be clawed back from provider wallet

INS-011 | No provider liability score
  Track: number of claims against provider, claim amounts, claim types
  Use for: tier demotion, suspension, increased commission rates
  Display: On admin provider detail page

INS-012 | No "incident report" separate from dispute
  Some issues don't need a refund but should be documented:
  - Provider was rude but work was fine
  - Minor scheduling delay
  - Communication issues
  These should be logged and affect provider quality score without triggering refund

INS-013 | No customer safety check after in-home services
  After certain service types (cleaning, plumbing, electrical):
  - Send automated check: "Is everything OK? Notice any issues?"
  - 24-hour window to report problems before escrow releases
  - Different from manual confirmation — this is a safety prompt

INS-014 | No emergency contact system
  For in-home services, customer should optionally share:
  - Emergency contact name + phone
  - Stored encrypted, accessible only during active booking
  - Provider never sees it — only used if safety concern reported

INS-015 | Guarantee fund has no admin dashboard
  Admin should see:
  - Current fund balance
  - Monthly contributions vs payouts
  - Claim history and trends
  - Fund sustainability projection
  - Alerts when fund falls below threshold

INS-016 | No automatic provider suspension after multiple claims
  Rule needed: 3 valid claims in 30 days → auto-suspend → admin review
  Currently: Only manual suspension via admin panel

INS-017 | No pre-service safety briefing
  For higher-risk services (electrical, plumbing, pest control):
  - Show safety info to customer before booking
  - Provider must acknowledge safety checklist before starting
  - Required PPE verification

INS-018 | No post-dispute customer satisfaction survey
  After dispute is resolved, ask customer:
  - "Was the resolution fair?" (1-5)
  - "How was the support experience?" (1-5)
  - Use feedback to improve dispute process


# ════════════════════════════════════════════════════════
# SECTION 6: PROVIDER ACCOUNTABILITY SYSTEM
# ════════════════════════════════════════════════════════

PROV-001 | No provider deactivation flow
  Currently providers can be "suspended" by admin but:
  - No clear path from suspension → reinstatement
  - No escalation: warning → probation → suspension → ban
  - No required actions to lift suspension (e.g., re-training, new NBI)

PROV-002 | No provider performance dashboard
  Provider should see:
  - Their quality score (calculated weekly by admin-analytics)
  - Metrics: on-time rate, completion rate, customer satisfaction
  - Comparison to tier requirements
  - Actions needed for tier promotion

PROV-003 | No strike/warning system
  Need formal escalation:
  - 1st offense: Warning notification
  - 2nd offense: Probation (reduced booking visibility)
  - 3rd offense: Suspension (can't accept bookings)
  - 4th offense: Permanent ban

PROV-004 | Provider can complete job without GPS check-in
  Code allows status transition to provider_arrived without verifying GPS
  Fix: Before allowing provider_arrived, verify GPS is within 200m of booking address

PROV-005 | Provider can mark job complete immediately
  No minimum time-on-site enforcement
  E.g., provider marks "arrived" and "complete" within 1 minute
  Fix: Minimum time between in_progress and completed_by_provider (configurable per service)

PROV-006 | No provider response time tracking
  Track how quickly providers accept/decline job requests
  Use for: matching algorithm priority, tier requirements

PROV-007 | No provider cancellation penalty
  Provider cancels after accepting job — no consequence
  Need: Cancellation rate tracking → affects tier → affects commission

PROV-008 | No provider identity verification refresh
  Government ID and NBI are uploaded once
  Need: Annual re-verification prompt
  NBI expiry already tracked (nbi_expiry_date) but no re-upload flow

PROV-009 | No provider earnings goal tracking
  Gamification: "You're ₱2,000 away from your weekly goal!"
  Motivates providers to stay active

PROV-010 | No provider training/certification system
  Platform could offer:
  - Safety training modules
  - Service-specific best practices
  - Completion → badge on profile → higher tier eligibility

PROV-011 | No provider "busy" / "on break" status
  Only online/offline toggle exists
  Need: Granular status (available, on a job, on break, offline)

PROV-012 | Provider dispute recovery amount not tracked
  When SiguradoShield pays a claim, platform should recover from provider
  Need: recovery_amount field on disputes
  Need: automatic deduction from provider's next payout


# ════════════════════════════════════════════════════════
# SECTION 7: DISPUTE/COMPLAINT/TICKET FLOWS
# ════════════════════════════════════════════════════════

DISP-001 | Dispute filing window too narrow (24h in code, spec says 48h)
DISP-002 | No photo comparison in dispute review (before vs after)
DISP-003 | No dispute chat thread (customer ↔ admin conversation)
DISP-004 | No dispute SLA tracking (response time, resolution time)
DISP-005 | Auto-resolution only checks no-show, not quality/damage
DISP-006 | No dispute re-open capability
DISP-007 | No customer appeal process after resolution
DISP-008 | Provider dispute response has no deadline enforcement
DISP-009 | No dispute priority queue based on amount/urgency
DISP-010 | Partial refund calculation doesn't account for change orders
DISP-011 | No "mediation" step between customer and provider before admin involvement
DISP-012 | No automated evidence gathering (pull chat history, GPS logs, booking timeline)
DISP-013 | No template responses for common dispute types
DISP-014 | No customer notification when dispute is assigned to admin
DISP-015 | No escalation notification when dispute exceeds SLA


# ════════════════════════════════════════════════════════
# SECTION 8: WALLET/ESCROW/RELEASE FLOWS
# ════════════════════════════════════════════════════════

WALL-001 | No "cooling off" period after customer confirmation
  Customer confirms → escrow released instantly
  Need: Optional 24-48h hold after confirmation for damage discovery

WALL-002 | No wallet balance notification (low balance alert for wallet payments)

WALL-003 | No automatic wallet top-up when balance drops below threshold

WALL-004 | No scheduled/automatic withdrawal for providers
  Provider must manually request withdrawal each time
  Need: Auto-withdrawal when balance exceeds threshold

WALL-005 | Withdrawal to bank has no bank account verification
  Provider enters account number but no verification step
  Need: Micro-deposit verification or bank name/account holder validation

WALL-006 | No receipt generation for withdrawals (BIR-compliant)

WALL-007 | No wallet-to-wallet transfer (customer → customer for gift cards)

WALL-008 | No refund to original payment method
  All refunds go to wallet balance, not back to GCash/Maya/card
  Need: Option to refund to original payment method via PayMongo

WALL-009 | Platform escrow wallet has no balance cap alert
  If escrow grows too large relative to platform revenue, it's a liability risk

WALL-010 | No financial reconciliation report
  Admin needs: Daily/weekly reconciliation of escrow in vs escrow out + fees

WALL-011 | Change order approval adds to booking amounts but doesn't collect additional payment
  Detailed in CODE-AUDIT — the provider does additional work with no payment guarantee


# ════════════════════════════════════════════════════════
# SECTION 9: MISSING BUTTONS/CLICKS/FEATURES PER SCREEN
# ════════════════════════════════════════════════════════

# --- Home Screen ---
BTN-001 | No "See All" button on category grid (expand to full categories page)
BTN-002 | No search bar on home screen (Stitch has one)
BTN-003 | No "Near Me" / location-based provider count per category
BTN-004 | No "Recently Viewed" section

# --- Booking Flow ---
BTN-005 | Checkout has no "Apply Promo Code" field
BTN-006 | Booking form has no "Add Urgency" option (rush pricing)
BTN-007 | No "Book for Someone Else" option
BTN-008 | No recurring booking option during initial booking ("Make this weekly?")
BTN-009 | Booking form has no "Upload Photos" for the job description

# --- Booking Detail ---
BTN-010 | No "Cancel Booking" button (must use status transition API directly)
BTN-011 | No "Reschedule" button
BTN-012 | No "Download Receipt" / "Share Receipt" buttons
BTN-013 | No "Report Provider" button on completed bookings
BTN-014 | No "Book Again with Same Provider" quick action

# --- Provider ---
BTN-015 | No "Share Profile" for providers to share their public profile link
BTN-016 | No "View Analytics" from provider dashboard (earnings trends over time)
BTN-017 | No "Export Earnings Report" for tax purposes
BTN-018 | Provider job detail has no "Contact Support" button
BTN-019 | Provider services page has no "Preview Public Profile" button

# --- Chat ---
BTN-020 | No "Send Photo" button in chat (only text messages)
BTN-021 | No "Send Location" sharing in chat
BTN-022 | No "Quick Replies" templates in chat
BTN-023 | No "End Chat" / archive conversation option

# --- Profile ---
BTN-024 | No "Change Phone Number" option (requires new OTP flow)
BTN-025 | No "Linked Accounts" section (Google, Facebook)
BTN-026 | No "Privacy Settings" (visibility of profile to providers)
BTN-027 | RESOLVED — App is English only (no language selector needed)
BTN-028 | No "App Theme" selector (light/dark)

# --- Wallet ---
BTN-029 | No "Send Money" to another user
BTN-030 | No "Transaction Details" screen when tapping a transaction
BTN-031 | No "Filter Transactions" by type (earnings, refunds, tips, withdrawals)
BTN-032 | No "Export Transactions" as CSV/PDF

# --- Notifications ---
BTN-033 | No "Clear All" for read notifications
BTN-034 | No notification grouping (multiple from same booking grouped)
BTN-035 | No notification categories/tabs (Bookings, Payments, System)


# ════════════════════════════════════════════════════════
# SECTION 10: ADMIN PANEL GAPS
# ════════════════════════════════════════════════════════

ADM-001 | No real-time dashboard updates (must manually refresh)
ADM-002 | No system audit log viewer (backend has audit_log table, no UI)
ADM-003 | No staff management (add/remove/assign roles to admin users)
ADM-004 | No system configuration UI (can only change via code deployment)
ADM-005 | No provider application review workflow (approve with notes/conditions)
ADM-006 | No batch operations (approve multiple providers, resolve multiple disputes)
ADM-007 | No customer communication tool (send message/notification to customer from admin)
ADM-008 | No provider communication tool (send message/notification to provider from admin)
ADM-009 | No financial reconciliation report page
ADM-010 | No guarantee fund management page
ADM-011 | No service area management map view (only table exists)
ADM-012 | No pricing rule testing tool (preview what a booking would cost with current rules)
ADM-013 | No export functionality on any table (CSV/Excel export)
ADM-014 | No admin action history per entity (see all admin actions on a specific provider/booking)
ADM-015 | No dashboard customization (KPI card ordering, date range selector)
ADM-016 | No mobile-responsive admin panel (works only on desktop)
ADM-017 | No 2FA for admin login (spec requires it)
ADM-018 | No admin session timeout warning (spec says 1 hour timeout)


# ════════════════════════════════════════════════════════
# SECTION 11: BACKEND SERVICE GAPS
# ════════════════════════════════════════════════════════

BACK-001 | No upload/presign endpoint — image upload completely missing
BACK-002 | No BIR-compliant invoice generation (VAT computation exists but no PDF generation)
BACK-003 | No webhook retry mechanism for failed PayMongo webhooks
BACK-004 | No rate limiting per user (only global rate limit exists)
BACK-005 | No request logging with correlation IDs for debugging
BACK-006 | No database connection pool monitoring
BACK-007 | No health check for Redis connectivity (/health/ready only checks PostgreSQL)
BACK-008 | No API versioning strategy (all routes are v1, no v2 migration plan)
BACK-009 | No request body size validation per endpoint (global 10MB limit is too high for most)
BACK-010 | No file cleanup for orphaned uploads (files uploaded but never linked to a booking)
BACK-011 | No booking expiration (requested bookings that sit for days without provider match)
BACK-012 | No provider availability calendar (only weekly schedule, no date-specific blocks)
BACK-013 | No booking conflict detection (double-booking same provider at same time)
BACK-014 | No customer blacklist per provider (provider blocks specific customer)


# ════════════════════════════════════════════════════════
# SECTION 12: PERFORMANCE & QUALITY
# ════════════════════════════════════════════════════════

PERF-001 | No image caching strategy (expo-image has blurhash but not configured on most screens)
PERF-002 | Booking list loads ALL bookings then filters client-side for some status filters
PERF-003 | Chat messages don't paginate on scroll-up (loads all at once)
PERF-004 | No database query performance monitoring (no EXPLAIN ANALYZE usage)
PERF-005 | Wallet transactions query has no date range filter
PERF-006 | Admin dashboard KPI query runs 3 subqueries sequentially (could be parallel)
PERF-007 | No CDN for static assets (images served directly from S3)
PERF-008 | No API response compression for large payloads
PERF-009 | Socket.io reconnection not handled gracefully on mobile
PERF-010 | FlatList performance on long lists (no getItemLayout or initialNumToRender optimization)
PERF-011 | No bundle size optimization (no lazy loading of screens)
PERF-012 | No Sentry or error tracking integration


# ════════════════════════════════════════════════════════
# SECTION 13: i18n & LOCALIZATION — ALL RESOLVED
# ════════════════════════════════════════════════════════
# DECISION: App is English only. All Philippine apps use English.
# The i18n framework has been removed entirely.
# No translation files, no useTranslation hook, no language switcher.

i18n-001 | RESOLVED — No translations needed (English only)
i18n-002 | RESOLVED — No language switcher needed (English only)
i18n-003 | RESOLVED — Plain English strings in JSX is the standard
i18n-004 | STILL VALID — Date formatting uses Asia/Manila timezone + PH format (separate from i18n)
i18n-005 | STILL VALID — Currency formatting uses ₱/PHP correctly (separate from i18n)
i18n-006 | RESOLVED — English error messages are correct for English-only app
i18n-007 | RESOLVED — English push notifications are correct for English-only app
i18n-008 | RESOLVED — Admin panel English only is correct
i18n-009 | RESOLVED — Onboarding in English only
i18n-010 | RESOLVED — Legal text in English only (standard for PH apps)


# ════════════════════════════════════════════════════════
# SECTION 14: SECURITY HARDENING
# ════════════════════════════════════════════════════════

SEC-001 | Admin login has no 2FA (spec requires TOTP or SMS)
SEC-002 | No CAPTCHA on registration (configured but not wired)
SEC-003 | PayMongo webhook secret set to skip in dev (verifyWebhookSignature returns true if no secret)
SEC-004 | Government ID images should be encrypted at rest (currently stored as plain URLs)
SEC-005 | No PII data masking in logs (phone numbers may appear in error logs)
SEC-006 | JWT access token expires in 7 days (should be 15 minutes with refresh)
SEC-007 | No brute force detection on OTP verification (max attempts exist but no IP-level blocking)
SEC-008 | Admin API endpoints don't verify admin role consistently (some check, some don't)
SEC-009 | No Content Security Policy headers for admin web panel


# ════════════════════════════════════════════════════════
# SECTION 15: ACCESSIBILITY & INCLUSIVITY
# ════════════════════════════════════════════════════════

ACC-001 | No accessibilityLabel on most touchable elements
ACC-002 | No accessibilityRole on buttons (using TouchableOpacity without roles)
ACC-003 | Color contrast may not meet WCAG 4.5:1 for some text colors
ACC-004 | No screen reader navigation support (accessibilityElementsHidden not used)
ACC-005 | Star rating component not accessible (no screen reader alternative)
ACC-006 | No font scaling support (fixed font sizes instead of responsive)
ACC-007 | No reduced motion support (animations can't be disabled)
ACC-008 | No high contrast mode


# ════════════════════════════════════════════════════════
# TOTAL ISSUE COUNT: 271 distinct issues
# ════════════════════════════════════════════════════════
#
# CRITICAL:   7 (money bugs — fix immediately)
# CONFIG:     8 (spec mismatches — Ken decides)
# MISSING:   39 (Stitch screens not built)
# UX/UI:     55 (quality gaps)
# INSURANCE: 18 (protection system design)
# PROVIDER:  12 (accountability gaps)
# DISPUTE:   15 (complaint flow gaps)
# WALLET:    11 (money flow gaps)
# BUTTONS:   35 (missing clicks/features)
# ADMIN:     18 (panel gaps)
# BACKEND:   14 (service gaps)
# PERF:      12 (quality issues)
# i18n:      10 (ALL RESOLVED — English only, no i18n framework)
# SECURITY:   9 (hardening)
# ACCESS:     8 (accessibility)
# ════════════════════════════════════════════════════════
