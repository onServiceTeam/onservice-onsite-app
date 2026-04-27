# PHASE 09 — MISSING STITCH SCREENS

**Goal:** Build the 39 mobile screens that the Stitch design produced but were never built. Per the audit (Section 3 of `COMPREHENSIVE-271-ISSUE-AUDIT.md`).


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/09-missing-stitch-screens`
**Estimated time:** 30 hours (largest phase; can be split into sub-branches if needed)
**Dependencies:** Phase 08 complete and merged
**Risk:** Medium — large surface area, many small screens, but each is independent

---

## Step 1 — Pre-flight (standard)

## Step 2 — Strategy: split into sub-batches

Because this phase is large, the AI coder may execute in 5 sub-batches. Each sub-batch creates a sub-branch off `phase/09-missing-stitch-screens`, gets a separate review from Ken, and merges to the phase branch. Only when all 5 are merged does the phase branch merge to main.

Sub-batches:

### Batch 09a — Launch-critical (8 screens)

These BLOCK launch. Build first.

1. **`safety_insurance_info`** — `apps/mobile/app/customer/safety.tsx` (file exists, may be thin — make it the full SiguradoShield trust screen)
   - Hero: "Every booking is protected by SiguradoShield™"
   - 3 protection layers explained: Platform Guarantee Fund, Per-Job Optional Coverage (Igloo placeholder), Provider Liability
   - "What's covered" expandable list
   - "How to file a claim" 4-step process
   - FAQ section
2. **`identity_verification`** — `apps/mobile/app/provider-onboarding/identity-verification.tsx`
   - Government ID picker (driver's license, passport, UMID, PRC, postal)
   - Front photo, back photo
   - Validation: image quality, glare, blur detection (client-side)
   - Server upload to S3 via presigned URL
3. **`document_upload`** — generic doc upload component used by multiple flows
4. **`background_check_status`** — `apps/mobile/app/provider-onboarding/background-check-status.tsx`
   - Status: NBI clearance pending / approved / rejected
   - Estimated time
   - What to do if delayed
   - Refresh button
5. **`help_center`** — `apps/mobile/app/customer/help-center.tsx` and `apps/mobile/app/provider/help-center.tsx`
   - Search bar
   - Category browse: Booking issues, Payment issues, Account, Service quality, Insurance claims
   - FAQ articles (markdown)
   - "Contact support" CTA → opens chat or Messenger
6. **`manage_addresses`** — `apps/mobile/app/customer/addresses.tsx` (exists, audit says missing — verify scope)
   - List of saved addresses
   - Add new (map picker + form)
   - Edit, delete
   - Set default
7. **`terms_privacy_consent`** — `apps/mobile/app/customer/terms.tsx` (exists, may be thin)
   - Required acceptance during signup
   - Version tracking (NPC requirement)
   - Re-prompt on version change
   - Granular toggles: marketing emails, SMS marketing, data sharing
8. **`payment_failed_error_state`** — `apps/mobile/app/customer/booking/payment-failed.tsx`
   - Clear failure reason
   - Retry button
   - Switch payment method button
   - Contact support fallback

### Batch 09b — Provider job execution (8 screens)

9. **`service_checklist`** — `apps/mobile/app/provider/job/[id]/checklist.tsx` (exists — verify it's the spec'd version)
   - Progress bar
   - Categorized checklist (e.g., for cleaning: Living Room, Kitchen, Bathroom, Bedrooms — each with subitems)
   - Photo upload per item
   - Timestamps captured per check
   - "Report Issue" per item (notifies customer + admin)
10. **`before_after_photos`** — comparison view for any job with photos
11. **`mark_job_completed`** — `apps/mobile/app/provider/job/[id]/complete.tsx`
    - Final photos required
    - Customer signature (touch capture)
    - Optional notes
    - Submit triggers escrow flow
12. **`work_summary`** — post-completion summary
13. **`service_area`** — `apps/mobile/app/provider/service-area.tsx` (provider sees and edits their service area on a map with draggable radius)
14. **`skill_selection`** — `apps/mobile/app/provider/skills.tsx` (provider chooses which categories/subcategories to offer)
15. **`navigation_to_job`** — `apps/mobile/app/provider/job/[id]/navigate.tsx` (deep link to Google Maps or Waze)
16. **`job_photo_uploads`** — generic photo upload component

### Batch 09c — Customer flows enhancements (10 screens)

17. **`saved_payment_methods`** — `apps/mobile/app/customer/payment-methods.tsx` (exists, verify CRUD)
18. **`add_card_wallet`** — `apps/mobile/app/customer/wallet-topup.tsx` (exists — verify)
19. **`media_inspection_gallery`** — photo evidence gallery (used in disputes)
20. **`urgency_selector`** — rush booking option with surge price preview
21. **`home_care_plan_selection`** — recurring service plan picker
22. **`subscriptions_management`** — `apps/mobile/app/customer/recurring/index.tsx` (exists — verify CRUD)
23. **`tax_documents_access`** — customer can download their booking receipts/ORs and provider can download 2307s
24. **`redeem_credits_modal`** — wallet credit redemption at checkout
25. **`referral_message_preview`** — preview FB / SMS / WhatsApp share message
26. **`referral_status_rewards`** — `apps/mobile/app/customer/referral.tsx` (exists, verify it has full tracking)

### Batch 09d — Polish (8 screens)

27. **`live_chat_support`** — customer support chat (separate from provider chat)
28. **`dashboard_loading_state`** — skeleton loading on every list/dashboard screen
29. **`empty_bookings_state`** — clear empty states with illustration + CTA
30. **`notification_settings`** — `apps/mobile/app/customer/notification-settings.tsx` (exists — verify granular per-channel)
31. **`customer_dashboard_v2`** — alternate layout — compare and pick best elements (or skip if not needed)
32. **`password_reset`** — admin password reset flow (mobile uses phone+OTP)
33. **`change_phone_number`** — phone number change with new OTP verification
34. **`linked_accounts`** — Google / FB OAuth linking (post-launch, can defer)

### Batch 09e — Admin completion (5 screens)

35. **`marketing_growth_tools`** — `apps/admin/src/pages/MarketingPage.tsx` (NEW)
    - Promo code CRUD
    - Campaign tracker (FB ads, billboards, kiosks, influencers)
    - CPA by channel
36. **`staff_roles_permissions`** — verify `StaffRolesPage.tsx` has full RBAC matrix UI
37. **`global_system_settings`** — verify `SystemSettingsPage.tsx` from Phase 03 is the full categorized UI
38. **`system_audit_logs`** — verify `AuditLogPage.tsx` has diff viewer (Phase 11 ensures this)
39. **`dispute_quality_control`** — quality dashboard for disputes (resolution time SLA, accuracy of resolutions)

## Step 3 — Per-screen contract

For each screen, create a `SCREEN-AUDIT.md` file using the template at `.ai-coder/templates/SCREEN-AUDIT-TEMPLATE.md`. Fill in every field. Commit it alongside the screen.

For each screen verify before merge:
- Loading state, error state, empty state, success state all rendered
- Real API integration (no hardcoded data)
- All 4 edge cases tested: no permission, slow network, server error, empty result
- Lucide icons (no emoji)
- Design tokens used (no hardcoded colors)
- Responsive: works on iPhone SE, iPhone 14, iPad
- Accessibility: keyboard nav (web), screen reader labels, 44px touch targets

## Step 4 — Sub-batch cadence

After each sub-batch:
1. Sub-merge back to phase branch
2. Run `verify-phase.sh PHASE-09-NN`
3. Send sub-batch report to Ken
4. Wait for sub-approval
5. Move to next sub-batch

After all 5 sub-batches done:
1. Final phase verification
2. Phase report
3. Merge to main on Ken's approval
