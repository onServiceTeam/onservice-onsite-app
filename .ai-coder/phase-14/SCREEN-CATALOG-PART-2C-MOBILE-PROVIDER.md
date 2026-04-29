# SCREEN CATALOG — Mobile Provider (Part 2C of 3)

**This catalog covers the 39 mobile provider screens.** Same template as Parts 2A and 2B. Audiences:

1. **The AI coder** — verifies "did I build this screen correctly?" Acceptance criteria become test assertions and Maestro flow steps.
2. **A UX firm engaged later** — uses this as the build brief for redesigning the provider mobile experience in Figma.
3. **Ken** — verifies, by tapping through each screen on a real iPhone and Android with a test provider account, whether what he sees matches what's written here.

**Scope:** files under `apps/mobile/app/provider-onboarding/*`, `apps/mobile/app/(provider-tabs)/*`, `apps/mobile/app/provider/*`, plus `apps/mobile/app/customer/provider/[id].tsx` (the public-facing provider profile that customers see, included here because it's primarily provider data).

**Reusing Parts 2A and 2B's universal requirements** — emoji-free icons, brand `#1B3A4B`, MMKV with encryption, server-canonical money, Routes registry, four required states, accessibility labels, etc. — those apply here too. This catalog only repeats requirements that are provider-specific or where provider screens introduce something the customer screens didn't.

**Provider-specific cross-cutting requirements:**

- **Provider auth model** — the same `users` table backs customer + provider, but providers have a `provider_profile` joined record. Tokens carry `role='customer'` or `'provider'`; switching role requires sign-out / sign-in via separate registration. Bug 901 (no in-app role switch) is intentional for v1.0.
- **Background work for live jobs** — providers in active jobs need GPS broadcast, background notifications, and reliable cellular connection. Many provider screens assume the provider is on-site, possibly with one hand free, possibly in poor lighting. UI must be thumb-reachable, high-contrast, with large touch targets (minimum 44pt — exceeds Apple's 36pt minimum).
- **Trust state machine** — every action a provider takes that affects money has a "you're committing to a contract" weight. Quote send, job start, completion mark, cancellation — each requires explicit confirmation, not casual taps. No light dismissal of money-affecting actions.
- **NBI clearance lifecycle** — every active provider has an `nbi_clearance` record with expiry. Several screens surface this (dashboard, profile, settings). When nearing expiry (<30 days), show banner. When expired, set provider to `inactive` server-side and block accept-quote / start-job actions.
- **Tier progression** — providers move New → Verified → Pro → Elite via objective criteria (jobs completed, rating, dispute rate, response time, etc.). Founding tier is admin-assigned (Bug 1323 fix: founding tier added to runtime config in dispatch 02). Multiple screens cite tier rules; all must come from server `/suki/provider-tiers` not from hardcoded constants.
- **Money in escrow** — provider sees "earned (in escrow)" as separate balance from "available". Escrow releases trigger via customer confirmation OR auto-release after dispute window. Providers do NOT manually release — the customer or admin does.

**Decision points that surface in this catalog:**

- **Provider chat affordance (sections 24, 25)** — same chat plumbing as customer side (Bug 38). If customer chat is disabled for v1.0, provider chat must be too. Catalog assumes both disabled.
- **Provider dispute filing (Bug 415, 194 chain)** — currently providers cannot file disputes against customers. Catalog flags this as v1.1 requirement. For v1.0, providers can mark a job "issue" which routes to support ticket.
- **Background-check vendor integration** — currently `provider-onboarding/background-check-status.tsx` polls a status that no real vendor populates. Catalog notes the integration as a launch blocker (per LAUNCH-LIMITATIONS) and recommends manual admin-driven approval flow for v1.0.

---

## 0. Provider shell — applies to every provider screen

The provider mobile experience runs on the same Expo Router + same `_layout.tsx` as the customer side, but the routing wraps under `(provider-tabs)` for the four bottom tabs and `provider/*` for stack screens.

**Tab bar (only on the 4 provider tab screens):**
- 4 tabs: Dashboard, Jobs, Earnings, Profile
- Lucide icons `LayoutDashboard`, `Briefcase`, `Wallet`, `User` (24px)
- Active state: tinted `brand.primary` `#1B3A4B`, 2px top accent bar
- Background `#FFFFFF`, top border `#E5E5E5`
- Height 56pt + bottom safe-area inset

**Header (per-screen, same shell as customer):**
- 44pt tall, white background, bottom border 1px `#E5E5E5`
- Back chevron when `router.canGoBack()`
- Title centered, Inter 600/16, 1 line truncated
- Right action slot configurable

**Status banner system (provider-only):**
Several global statuses can pin a banner to the top of every screen:
- **NBI expiring soon** (yellow): "Your NBI clearance expires in 12 days. [Update now →]" → `/provider/account-management`
- **NBI expired** (red, blocking): "Your NBI clearance has expired. You cannot accept new jobs until you update it. [Update now →]"
- **Account suspended** (red, blocking): "Your account is suspended. Please contact support."
- **Pending payout failure** (yellow): "A payout to your GCash failed. [Resolve →]" → `/provider/payouts`
- **Onboarding incomplete** (blue): for providers who haven't finished onboarding, "Complete your profile to start receiving jobs. [Continue →]" → resumes onboarding flow.

Banners are stacked top-down; max 2 visible at once; rest collapse into "+N more" expandable.

**Auth gating** — every provider screen except the onboarding screens checks for `role='provider'` on the user object. If `role='customer'`, redirect to `/(tabs)/home`. If unauthenticated, redirect to `/auth/login`.

**Job-active mode** — when the provider has a job in `provider_en_route` / `provider_arrived` / `in_progress` status, several UI elements change globally:
- Tab bar gets a third color row at top showing "Active job: <customer name>"
- Tapping anywhere on that row → `/provider/job/[id]`
- Auto-resume on app cold-launch — if any active job exists, splash routes directly to job screen (not dashboard)
- Push notifications elevated priority

---

## 1. provider-onboarding/role-select.tsx — Choose customer or provider role

**Route:** `/provider-onboarding/role-select`
**Auth:** Required (signed in but role not yet committed; this is the first screen of provider onboarding)
**Backend:** None at this step — selection saved client-side until step 2.
**Audit findings:** Bug 1186 chain — route is reachable from customer-side as well; must enforce one-way (a customer who already has bookings cannot become a provider on the same account).

**Layout:**
- Hero: "How will you use onService?"
- Two large tappable cards stacked:
  - **I'm a customer** — illustration (lucide `Search` 48px) + "Find trusted home pros nearby" → routes to `/(tabs)/home` (signs in as customer)
  - **I'm a service pro** — illustration (lucide `Wrench` 48px) + "Earn money offering your skills" → continues to `/provider-onboarding/terms`
- Below: "Already have an account? [Sign in]" → `/auth/login`

**Behavior on tap "I'm a service pro":**
- Calls `POST /auth/me/intent { role: 'provider' }` — server records intent; if user already has bookings as customer, server returns 409 with message "Customer accounts can't be converted. [Sign up with a different number →]" — modal redirects to fresh registration.
- On success, navigate to `/provider-onboarding/terms`.

**Acceptance:**
- Test 1: User who has prior customer bookings sees blocking modal, cannot proceed.
- Test 2: New user who has never booked anything proceeds to terms.
- Test 3: Both card buttons have lucide icons (no emoji).
- Test 4: Each card minimum tap area 88pt × 88pt.

---

## 2. provider-onboarding/terms.tsx — Provider terms acceptance

**Route:** `/provider-onboarding/terms`
**Auth:** Required (intent='provider')
**Backend:** `GET /cms/provider-terms`, `POST /provider/onboarding/accept-terms { version }`
**Audit findings:** Bug 1187 (terms hardcoded — must come from server, NPC requirement to track version), Bug 1188 (no scroll-to-bottom enforcement before agree)

**Layout:**
- Header: "Provider Terms"
- Sub: "Please read and accept to continue."
- Scrollable Markdown content from server (`cms.provider_terms.body`).
- Sections covered:
  - Independent Contractor relationship (NOT employees of onService)
  - Commission rates (server-driven values, currently New 15%, Verified 13%, Pro 11%, Elite 9%, Founding 10% — Bug 1323 fix)
  - Payout schedule + minimum withdrawal (₱500)
  - Insurance: own personal insurance (NOT covered by SiguradoShield Layer 2 since Layer 2 not wired — Bug 538 chain affects this section's wording)
  - Code of conduct
  - Cancellation rules (provider-side: max 2 cancellations per 30 days before tier penalty)
  - Background-check / NBI requirements
  - Data handling, user safety, harassment policy
- Sticky bottom (Bug 1188 fix):
  - Enabled only after user scrolled to ≥95% of content (verified by ScrollView's `onScroll` + content height).
  - Checkbox: "I have read and agree to these terms."
  - "Accept and continue" button (disabled until checkbox + scroll-complete).
- Below button: "Effective date: [date]. [View older versions →]" — opens version history modal.

**Acceptance:**
- Test 1: Agree button disabled until scroll-to-bottom + checkbox (Bug 1188 fix).
- Test 2: Terms content fetched from server, version persisted with acceptance row in `consent_records` (Bug 1187 fix).
- Test 3: Commission rates shown match server `/settings/commission-rates` (Bug 1323 chain).

---

## 3. provider-onboarding/categories.tsx — Service categories select

**Route:** `/provider-onboarding/categories`
**Auth:** Required (provider intent + terms accepted)
**Backend:** `GET /catalog/categories`, `POST /provider/onboarding/categories { category_ids[] }`
**Audit findings:** Bug 1189 (max 3 categories enforced client-side but server allows more), Bug 1190 (subcategories not selectable — only top-level; means an aircon repair pro registers as "appliance repair" which is too broad)

**Layout:**
- "What services do you offer?"
- Sub: "Pick up to 5 categories you can do well. You can add more later."
- Grid of category cards (icon + name + "from ₱X" indicative price-from):
  - Cleaning, Aircon, Plumbing, Electrical, Beauty, Massage, Pest control, Gardening, Repairs, Moving, Tutoring, Pet care, etc.
- Each tappable card toggles selection (max 5 — Bug 1189 fix to align client + server at 5).
- After ≥1 category selected, an expandable section appears below: "Specific services in [Cleaning]" with subcategory checkboxes (Bug 1190 fix).
- "Continue" button — disabled until ≥1 category + ≥1 subcategory selected.

**Acceptance:**
- Test 1: Max 5 categories enforced (matches server) — 6th tap shows toast "You can pick up to 5 categories" (Bug 1189 fix).
- Test 2: Subcategory selection required per category (Bug 1190 fix).
- Test 3: Selection persists if user backs out and returns.

---

## 4. provider-onboarding/service-area.tsx — Service area selection

**Route:** `/provider-onboarding/service-area`
**Auth:** Required
**Backend:** `GET /service-areas?status=active,recruiting`, `POST /provider/onboarding/service-area { area_id, willing_radius_km }`
**Audit findings:** Bug 1191 (radius slider goes to 100km but server caps at 25km — UX silent failure), Bug 1192 (city autocomplete missing Boracay reinforcement of Bug 706)

**Layout:**
- "Where do you work?"
- Map view of PH with active/recruiting service areas circled.
- List below the map of available areas: each row shows area name, status badge ("Active" or "Recruiting"), and provider count.
- Currently for v1.0: only Boracay shown as Active.
- Tap area → expanded view:
  - Radius slider 1km–25km (Bug 1191 fix to align with server cap)
  - "I'll travel up to 15km from area center"
  - Map preview of coverage circle.
- "Continue" button.

**Acceptance:**
- Test 1: Boracay listed as active area (Bug 706 chain).
- Test 2: Radius slider max is 25km (Bug 1191 fix).
- Test 3: At least one area selected before continue.

---

## 5. provider-onboarding/documents.tsx — Document uploads

**Route:** `/provider-onboarding/documents`
**Auth:** Required
**Backend:** `POST /provider/onboarding/documents` multipart upload, `GET /provider/onboarding/document-status`
**Audit findings:** Bug 1193 (NBI document upload uses base64 in JSON body — should be multipart/form-data for any file >100KB), Bug 36/461 chain (file:// URIs sent — must upload to S3)

**Layout:**
- "Upload your documents"
- Sub: "We need these to verify you're a real, qualified pro."
- Document list (5 rows):
  1. **NBI clearance** (required) — most critical. lucide `Shield` icon, status pill (Not uploaded / Uploaded / Verified / Rejected).
  2. **Government ID** (required) — Driver's license / Passport / SSS / UMID / etc. lucide `IdCard`.
  3. **Proof of address** (required) — utility bill or barangay clearance < 3 months. lucide `Home`.
  4. **Professional certs** (optional) — TESDA, Red Cross, vendor certifications. lucide `Award`. Multi-upload.
  5. **Business permit** (optional, only if registering as a business) — lucide `FileText`.

Each row tap → opens upload sheet:
- Camera button (uses Expo `ImagePicker.launchCameraAsync`).
- Photo library button.
- File picker (PDF allowed for documents).
- After upload: thumbnail preview, "Replace" / "Delete" actions.
- Server upload: file streams as multipart/form-data (Bug 1193 fix), gets S3 URL, returned as `{ document_id, status: 'pending' }`.

**Continue button:**
- Disabled until all 3 required documents uploaded with status ∈ {uploaded, verified}.

**Acceptance:**
- Test 1: NBI upload returns S3 URL stored in `provider_documents` table (Bug 36/461 chain).
- Test 2: PDF upload works for documents (not just images).
- Test 3: Upload uses multipart/form-data, NOT base64 in JSON (Bug 1193 fix verified by network log).
- Test 4: Continue blocked until 3 required documents uploaded.

---

## 6. provider-onboarding/selfie.tsx — Selfie liveness check

**Route:** `/provider-onboarding/selfie`
**Auth:** Required
**Backend:** `POST /provider/onboarding/selfie` multipart, server-side liveness via 3rd party vendor (e.g., AWS Rekognition / Onfido)
**Audit findings:** Bug 1194 (selfie comparison vs ID photo not actually wired — defer or wire), Bug 1195 (no liveness check — replay-attack possible by uploading photo of photo)

**Layout:**
- "Take a selfie"
- Sub: "We compare this with your government ID to confirm it's you."
- Camera preview with face oval overlay.
- Instructions: "Center your face in the oval, look straight at the camera, make sure lighting is good."
- After capture, AR-prompt sequence (Bug 1195 fix — basic liveness):
  - "Now turn your head left"
  - "Now turn right"
  - "Now smile"
- Each prompt captures additional frame for vendor liveness service.
- Submit → loading screen → result page.

**Decision required for Phase 14:** Bug 1194/1195 require contracted vendor (Onfido / Persona / AWS Rekognition + face liveness). Without that, this screen cannot meaningfully verify. Catalog assumes:
- **v1.0 (interim):** capture single photo + 2 prompts, store for manual admin review (admin sees photo on ProviderDetailPage and approves).
- **v1.1 (target):** wire vendor for automated liveness + ID matching.

**Acceptance:**
- Test 1: Camera permission requested with explanation modal first.
- Test 2: Photo upload uses multipart/form-data.
- Test 3: After v1.0 capture, status set to "pending_admin_review".

---

## 7. provider-onboarding/identity-verification.tsx — Independent contractor agreement

**Route:** `/provider-onboarding/identity-verification`
**Auth:** Required
**Backend:** `GET /cms/ic-agreement`, `POST /provider/onboarding/ic-agreement { signature, version, full_name }`
**Audit findings:** Bug 37 (signature not actually captured — must be a real signature, e.g., signature pad), Bug 1196 (no copy of agreement saved to user accessible location post-acceptance)

**Layout:**
- "Independent Contractor Agreement"
- Sub: "This formalizes your status as an independent contractor with onService."
- Scrollable agreement text from server.
- Signature pad component (canvas-based, Bug 37 fix):
  - "Sign here" placeholder
  - Clear button
  - Submit captures PNG of the signature.
- Type your full name (matches government ID exactly).
- "Sign and submit" button.
- After submit: server returns signed PDF URL; show "Saved to your profile under 'Agreements'" (Bug 1196 fix).

**Acceptance:**
- Test 1: Signature pad captures actual drawn strokes (Bug 37 fix).
- Test 2: Submission stores PNG signature in S3 + reference in `provider_agreements` table.
- Test 3: Signed PDF generated and accessible from settings later (Bug 1196 fix).

---

## 8. provider-onboarding/background-check-status.tsx — Background check polling

**Route:** `/provider-onboarding/background-check-status`
**Auth:** Required
**Backend:** `GET /provider/onboarding/background-check`, vendor webhooks update status
**Audit findings:** Bug 1197 (polling every 5 seconds — too aggressive), Bug 1198 (no manual recheck button), LAUNCH-LIMITATIONS (no real vendor wired — manual admin approval is interim)

**Layout:**
- Status pill: Pending / In Progress / Verified / Rejected / Expired
- Description text per status.
- For "In Progress": "We're checking your NBI clearance. This usually takes 1–3 business days."
- For "Verified": "✓ Background check passed. Continue →"
- For "Rejected": "We couldn't verify your background. [Contact support →]"
- "Refresh status" button (Bug 1198 fix, manual recheck).
- Last-checked timestamp.

**Polling behavior (Bug 1197 fix):**
- App-foreground: poll every 60s (not 5s).
- Background: stop polling, rely on push notification when status changes.
- Manual refresh button always available.

**Acceptance:**
- Test 1: Polling interval is 60s (Bug 1197 fix).
- Test 2: Manual refresh button works (Bug 1198 fix).
- Test 3: Status update arrives via push notification when admin approves.

---

## 9. provider-onboarding/review-pending.tsx — Final review state

**Route:** `/provider-onboarding/review-pending`
**Auth:** Required
**Backend:** `GET /provider/onboarding/status`
**Audit findings:** Bug 1199 (no estimate timeline — provider doesn't know how long admin review takes), Bug 1200 (cannot edit submitted info from this screen — must contact support to fix typos)

**Layout:**
- Hero: lucide `Clock` 64px (yellow tinted) + "Almost there!"
- Subhead: "Our team is reviewing your application. We'll notify you within 1–3 business days." (Bug 1199 fix)
- Application summary (read-only):
  - Categories selected
  - Service area
  - Documents uploaded (with thumbnails)
  - Background check status
- "Edit my submission" button (Bug 1200 fix):
  - Tappable to revisit each onboarding step until admin marks "in_review"
  - After "in_review", button disabled with tooltip "Your application is under active review. Contact support to make changes."
- Below: "Questions? [Contact support →]"

**Behavior on admin approval (push notification arrives):**
- App receives push, status flips to "active".
- On next launch (or in-app real-time), this screen replaced with celebration screen + auto-redirect to `/(provider-tabs)/dashboard`.

**Acceptance:**
- Test 1: Estimated timeline shown explicitly (Bug 1199 fix).
- Test 2: Edit submission accessible until admin starts review (Bug 1200 fix).
- Test 3: On approval, provider receives push + auto-redirects on next interaction.

---

## 10. (provider-tabs)/dashboard.tsx — Provider dashboard tab

**Route:** `/(provider-tabs)/dashboard`
**Auth:** Required (provider, status=active)
**Backend:** `GET /provider/dashboard` returns `{ today_stats, week_stats, active_jobs[], pending_quotes[], notifications[] }`, socket.io `provider:<user_id>:jobs`
**Audit findings:** Bug 1201 (online toggle visible but doesn't actually update server — no-op), Bug 1202 (today's earnings shown raw cents in dev), Bug 1203 (online toggle has no auto-off when phone locks/closes — drains battery)

**Layout (top to bottom):**

### Greeting + online toggle
- "Magandang umaga, Juan." + status pill ("Available" / "Offline" / "On a job")
- Toggle: "I'm available for new jobs" — Bug 1201 fix to actually call `POST /provider/availability { online: true }`
- Bug 1203 fix: toggle auto-flips to off after 15 minutes of app backgrounding (push notification respects this).

### KPI strip (4 small cards, scrollable horizontally)
- **Today's earnings** — formatted ₱ (Bug 1202 fix)
- **Today's jobs** — count
- **This week earnings** — ₱
- **Avg rating** — "4.8 ★ (47)" with link → `/provider/reviews`

### Active job card (pinned at top)
- ONLY shown when has any active job.
- Customer name + service + scheduled time
- Status pill (en_route / arrived / in_progress)
- "Open job →" → `/provider/job/[id]`

### Pending quotes section
- Title "Quotes awaiting your response"
- List of jobs where this provider has been notified, ranked by best fit (distance + score).
- Each card: customer first name + service summary + estimated total + lucide `Clock` time-since-notified.
- "View" → quote acceptance / decline page (uses `/provider/job/[id]/quote`)

### Today's schedule
- Mini timeline showing scheduled jobs for today.
- Tap job → `/provider/job/[id]`.

### Quick actions row
- [Update calendar] → `/provider/calendar`
- [View earnings] → `/(provider-tabs)/earnings`
- [Help] → `/provider/help`

### Tips / news section (CMS-driven)
- "What's new" announcements
- Tier progression hints

**Pull-to-refresh** standard.

**States:**
- **Loading** — skeleton KPIs + skeleton job cards.
- **Empty (no active jobs, no quotes)** — "No active work right now. [Browse open jobs →]" — but for v1.0, providers don't browse; they receive matches. So fallback is just "Stay online to receive new job matches."
- **Error** — Retry pattern.
- **Offline** — banner.

**Acceptance:**
- Test 1: Online toggle calls server API (Bug 1201 fix).
- Test 2: Earnings shown via formatCurrency (Bug 1202 fix).
- Test 3: Online auto-flips off after 15min background (Bug 1203 fix).
- Test 4: Active job card updates within 2s of socket event.
- Test 5: NBI expiring banner appears at top when within 30 days of expiry.

---

## 11. (provider-tabs)/jobs.tsx — Provider jobs tab

**Route:** `/(provider-tabs)/jobs`
**Auth:** Required (provider)
**Backend:** `GET /provider/jobs?status=<>&page=<>` paginated, socket.io for live status
**Audit findings:** Bug 1204 (no filter for date range — only status), Bug 1205 (cancelled jobs don't show cancellation reason)

**Layout:**

### Top tabs (4)
- Active (current job in progress)
- Upcoming (confirmed future + pending quotes)
- Past (completed)
- Cancelled (cancelled by self / customer / admin) — Bug 1205 fix: each row shows reason

### Filter chips (Bug 1204 fix)
- Date range: This week / This month / Custom
- Service category multi-select

### List (one card per job)
- Same shape as customer's bookings list but from provider's POV
- Customer name + service + status + total + scheduled time
- Tap → `/provider/job/[id]`

**States:** standard.

**Acceptance:**
- Test 1: Date range filter works (Bug 1204 fix).
- Test 2: Cancelled rows show reason and who cancelled (Bug 1205 fix).

---

## 12. (provider-tabs)/earnings.tsx — Provider earnings tab

**Route:** `/(provider-tabs)/earnings`
**Auth:** Required (provider)
**Backend:** `GET /provider/earnings?period=<>`, `GET /wallet/provider/transactions`
**Audit findings:** Bug 1206 (commission breakdown not shown — provider sees gross only), Bug 1207 (no chart of weekly trend), Bug 1208 (next payout date not shown)

**Layout:**

### Hero balance card (gradient — only allowed gradient location per Design Contract V2 §11)
- "Available to withdraw" ₱2,450.00 (Inter 700/40)
- Sub-balance: "₱1,200.00 in escrow (released after job confirmation)"
- Two CTAs:
  - [Withdraw to GCash] → `/provider/withdraw`
  - [Payout settings] → `/provider/payout-settings`

### Period selector
- Today / This week / This month / Custom

### Earnings chart (Bug 1207 fix)
- Simple line chart of daily earnings for selected period (recharts on web; victory-native or similar on mobile).
- Y-axis ₱, X-axis dates.

### Breakdown card (Bug 1206 fix)
- Gross earnings ₱X
- Service fees retained: ₱X (5%)
- Commission: ₱X (variable by tier — show tier rate)
- Net to you: ₱X
- Tax retention if applicable (BIR 8% withholding)

### Next payout
- Bug 1208 fix: "Next payout: <date> (Tuesdays and Fridays)"

### Transactions list
- Each row: lucide icon, description ("Booking #BK-1234 released"), amount, date.
- Tap → booking detail.

**Pull-to-refresh** standard.

**Acceptance:**
- Test 1: Commission breakdown visible (Bug 1206 fix).
- Test 2: Earnings chart rendered (Bug 1207 fix).
- Test 3: Next payout date shown (Bug 1208 fix).

---

## 13. (provider-tabs)/provider-profile.tsx — Provider profile tab

**Route:** `/(provider-tabs)/provider-profile`
**Auth:** Required (provider)
**Backend:** `GET /auth/me`
**Audit findings:** Bug 1209 (settings nav buried in sub-menus), Bug 1210 (no preview of public profile customer sees)

**Layout (similar shape to customer profile but provider-flavored):**

### Header
- Photo + name + tier badge + rating
- "Preview my public profile" link (Bug 1210 fix) → `/customer/provider/[id]?preview=true` (shows what customers see)

### Account section
- Account & security → `/provider/account-management`
- Service area → `/provider/service-area`
- Services I offer → `/provider/services`
- Skills & certifications → `/provider/skills`, `/provider/certifications`
- Portfolio → `/provider/portfolio`
- Schedule & availability → `/provider/schedule`, `/provider/availability`
- Calendar → `/provider/calendar`

### Earnings section
- Earnings dashboard → `/(provider-tabs)/earnings`
- Withdraw → `/provider/withdraw`
- Payout settings → `/provider/payout-settings`

### Customers section
- My suki customers → `/provider/suki-customers`
- Reviews → `/provider/reviews`
- Tier progression → `/provider/tier-progression`

### Help & info section
- Help center → `/provider/help`
- Settings → `/provider/settings` (Bug 1209 fix: top-level)
- Notifications → `/provider/notifications`

### Bottom
- App version
- Sign out (calls server logout — Bug 900/1020 chain)
- Delete account → links to data-rights (NPC compliance — same as customer side)

**Acceptance:**
- Test 1: All sub-menus reachable in 1 tap (Bug 1209 fix).
- Test 2: Preview public profile link works (Bug 1210 fix).
- Test 3: Sign out calls server logout endpoint.

---

## 14. customer/provider/[id].tsx — Public-facing provider profile

**Route:** `/customer/provider/[id]`
**Auth:** Required (any role can view)
**Backend:** `GET /providers/:id/public`
**Audit findings:** Bug 1211 (provider phone shown plain — should be hidden until customer books), Bug 1212 (no booking CTA — viewing only)

**Layout:**
- Header photo + name + tier badge + verified checkmark (NBI cleared)
- Stats row: rating, review count, total jobs, response time, completion rate.
- "About me" — provider-supplied bio (max 1000 chars).
- "Services I offer" — list with starting prices.
- "Service areas" — list with map preview.
- "Photos of my work" → `/provider/portfolio` photos shown here as carousel.
- "Reviews" — top 5 reviews + "View all" link.
- "Skills & certifications" — badges.
- Bug 1211 fix: phone NEVER shown on this screen (only revealed after booking via Twilio masked number).
- Bug 1212 fix: bottom sticky CTA "Book this pro" → opens service category picker → `/customer/booking/configure`.

**Acceptance:**
- Test 1: Phone never visible (Bug 1211 fix).
- Test 2: Book CTA visible at bottom (Bug 1212 fix).

---

## 15. provider/job/[id].tsx — Job detail (provider's view)

**Route:** `/provider/job/[id]`
**Auth:** Required (provider must own job)
**Backend:** `GET /provider/jobs/:id`, socket.io `booking:<id>:status`, multiple status mutations
**Audit findings:** Bug 416 (paymentMethod hardcoded 'wallet' — should reflect actual customer payment), Bug 1213 (cancel button no confirmation), Bug 1214 (no "report customer issue" affordance), Bug 1215 (status transitions silent — no haptic feedback on critical actions)

**Layout (status-dependent):**

### Header
- Back chevron + "Job #BK-1234"
- Right: lucide `MoreVertical` menu

### Hero status card
- Status pill (large)
- Status-specific sub-text

### Customer card
- First name + last initial only ("Maria S.")
- Photo (small)
- Two action icons:
  - Lucide `Phone` → calls Twilio masked number
  - Lucide `MessageCircle` → chat (or removed if chat not wired)

### Service & schedule card
- Service name, options selected, special instructions from customer.
- Scheduled at (Asia/Manila).

### Address card
- Map preview
- Full address + entry notes (e.g., "Gate code 1234")
- Lucide `Navigation2` → "Get directions" → `/provider/job/[id]/navigate`

### Money card (provider POV)
- Customer paid: ₱575
- Service fee retained: ₱50 (visible)
- Commission: ₱65 (visible, with tier rate)
- You receive: ₱460
- Bug 416 fix: payment method shown matches customer choice ("Visa ••••4242" / "GCash" / "Wallet")
- Status: "Held in escrow until you complete the job and customer confirms"

### Status-specific actions

**Confirmed (before scheduled time):**
- [Start travel] (Bug 1215 fix: triggers haptic feedback `Haptics.impactAsync(Heavy)`) → posts status=provider_en_route + starts GPS broadcast
- [Cancel job] → opens cancel modal (Bug 1213 fix: confirmation required + reason picker)
- [Reschedule request] → sends request to customer

**En route:**
- [I've arrived] (haptic) → posts status=provider_arrived

**Arrived:**
- [Start job] (haptic) → posts status=in_progress

**In progress:**
- [Open checklist] → `/provider/job/[id]/checklist`
- [Take photos] → `/provider/job/[id]/photos`
- [Submit change order] → `/provider/job/[id]/change-order`
- [Mark complete] → `/provider/job/[id]/complete` (only enabled when checklist 100% complete + ≥2 photos uploaded)
- [Report issue] (Bug 1214 fix) → opens support ticket form pre-filled with job context (this is the v1.0 dispute path for providers, since Bug 415 / 194 means they can't formally dispute)

**Pending customer confirmation:**
- "Waiting for [Customer] to confirm the job is done. Once confirmed, ₱460 will be released."
- [Send reminder] (max 1 per 4 hours)

**Complete:**
- "₱460 released to your wallet on [date] [time]"
- Customer's review (if posted) shown.

**Cancellation modal (Bug 1213 fix):**
- Title: "Cancel this job?"
- Required reason picker (max 1 of):
  - Schedule conflict
  - Tools/equipment issue
  - Health emergency
  - Customer changed scope
  - Address access issue
  - Other (free text)
- Custom reason input if "Other"
- Warning: "Cancelling within 2 hours of scheduled time may affect your tier. You have N cancellations this month."
- [Confirm cancel] disabled until reason picked.

### Photos & checklist progress bar
- Visible during in_progress.
- Tap → expands.

### Customer messages preview
- Last 3 messages (or removed if chat not wired).

### Timeline
- Vertical timeline of every status transition.

**Acceptance:**
- Test 1: Cancel button shows confirmation + reason picker (Bug 1213 fix).
- Test 2: Status mutation actions trigger haptic feedback (Bug 1215 fix).
- Test 3: Mark complete blocked until checklist 100% + ≥2 photos.
- Test 4: Report issue opens support form (Bug 1214 fix).
- Test 5: Money card shows real payment method (Bug 416 fix).

---

## 16. provider/job/[id]/checklist.tsx — Job checklist

**Route:** `/provider/job/[id]/checklist`
**Auth:** Required (provider must own job)
**Backend:** `GET /provider/jobs/:id/checklist`, `POST /provider/jobs/:id/checklist/items/:item_id { completed }`
**Audit findings:** **Bug 460 (checklist hardcoded for cleaning only — must be service-category-driven)**, **Bug 463 (checklist completion never validated against backend)**

**Layout:**
- "Job checklist"
- Progress bar at top: "8 of 12 complete · 67%"
- Sectioned by service step (sections come from server based on service category — Bug 460 fix; e.g., for aircon: "Pre-inspection", "Cleaning", "Refrigerant check", "Test run", "Cleanup").
- Each item is a checkbox row:
  - Text description
  - Optional: "Photo required" badge (camera icon)
  - Tap to toggle. If photo-required, taps opens camera first.
  - Completion timestamp shown after check.
- Sticky bottom: "Mark all complete" button — but does NOT bypass photo requirements.

**Server validation (Bug 463 fix):**
- Each toggle posts to server `POST /provider/jobs/:id/checklist/items/:item_id { completed: true, photo_id?: <id> }`.
- Server validates photo present when item requires photo.
- Server returns updated checklist state (for sync across multi-device, though unusual for providers).
- Failure shows inline error and reverts toggle.

**Backend-defined per service category (Bug 460 fix):**
- Server fetches `service_category.checklist_template_id` and returns the checklist items.
- Aircon repair sees aircon-specific items. Cleaning sees cleaning-specific. Massage sees massage-specific. Etc.

**Acceptance:**
- Test 1: Checklist items match the service category, NOT cleaning hardcoded (Bug 460 fix).
- Test 2: Each item toggle posts to server (Bug 463 fix verified by network log).
- Test 3: Photo-required items block completion until photo attached.

---

## 17. provider/job/[id]/photos.tsx — Job photos uploader

**Route:** `/provider/job/[id]/photos`
**Auth:** Required (provider must own job)
**Backend:** `POST /provider/jobs/:id/photos` multipart upload to S3
**Audit findings:** **Bug 461 (photos NEVER uploaded — stored as device file:// URIs)**, Bug 1216 (no compression — sends original 4K photos consuming bandwidth)

**Layout:**
- Tabs: Before / During / After / Issues
- Per tab: grid of uploaded photos + "+ Add" tile.
- Tap "+" → camera or gallery → captures → uploads.

**Upload flow (Bug 461 fix):**
- Pick photo via Expo `ImagePicker.launchCameraAsync({ quality: 0.7 })` (Bug 1216 fix: compress 70% quality).
- Resize to max 1920×1920 client-side via `expo-image-manipulator`.
- POST multipart/form-data to `/provider/jobs/:id/photos` with `photo_type` field (before/during/after/issue).
- Server uploads to S3, returns `{ photo_id, s3_url, thumbnail_url }`.
- UI shows thumbnail with upload state (uploading / uploaded / failed).
- Failed uploads show retry button.

**Acceptance:**
- Test 1: All photos POST as multipart/form-data, server stores S3 URL (Bug 461 fix verified by network log + DB inspection).
- Test 2: Photos compressed to max 1920px and 70% quality before upload (Bug 1216 fix).
- Test 3: Failed uploads show retry, not silent fail.
- Test 4: Photos appear in customer's `/customer/booking/photos` viewer.

---

## 18. provider/job/[id]/quote.tsx — Send quote to customer

**Route:** `/provider/job/[id]/quote`
**Auth:** Required (provider matched to customer's quote-pricing-type request)
**Backend:** `POST /provider/jobs/:id/quote { amount_cents, message, expiry_hours }`
**Audit findings:** Bug 1217 (no validation on amount — provider can quote ₱0 or ₱1M), Bug 1218 (no template messages — every provider types from scratch)

**Layout:**
- Header: "Send a quote"
- Customer's request summary (read-only, what they asked for).
- Their photos (if uploaded).
- Their address area only (not full address until accepted).

### Quote form
- **Amount input** — ₱ centavos, with min ₱100 and max ₱50,000 (Bug 1217 fix). Helper text "What's your fair price for this job?"
- **Message** — free text, max 500 chars. Bug 1218 fix: 3 template chips ("Yes I can help, here's my price", "I have questions before quoting", "I can do this with [add-on]"). Tapping fills the input.
- **Expiry** — defaults 24h, options 1h / 6h / 24h.
- "Send quote" button.

**After send:**
- Confirmation: "Quote sent. Maria has 24h to accept."
- Returns to dashboard with quote in "Awaiting" state.

**Acceptance:**
- Test 1: Amount validation (≥₱100, ≤₱50,000) blocks submit (Bug 1217 fix).
- Test 2: Template chips work (Bug 1218 fix).

---

## 19. provider/job/[id]/change-order.tsx — Submit change order

**Route:** `/provider/job/[id]/change-order`
**Auth:** Required (provider must own job, status=in_progress)
**Backend:** `POST /provider/jobs/:id/change-orders { description, additional_amount_cents, photos[] }`
**Audit findings:** Bug 1219 (additional amount client-trusted — should call /preview first)

**Layout:**
- "Request a change to the scope"
- Sub: "Need to do extra work? Send a change order. The customer must approve before you proceed."
- Description (textarea, ≥30 chars).
- Photos (upload up to 5 showing the issue).
- Additional cost input (₱).
- Preview button → calls server `POST /change-orders/preview` (Bug 1219 fix) → returns canonical adjusted total.
- Submit → sends to customer for approval.
- After submit: status shows "Awaiting customer approval".

**Acceptance:**
- Test 1: Preview from server, not client calc (Bug 1219 fix).
- Test 2: Customer receives push notification when change-order submitted.

---

## 20. provider/job/[id]/complete.tsx — Mark job complete

**Route:** `/provider/job/[id]/complete`
**Auth:** Required
**Backend:** `POST /provider/jobs/:id/complete` (transitions status, awaits customer confirmation)
**Audit findings:** Bug 1220 (allows completion without checklist 100% — server should reject), Bug 1221 (after completion no haptic / sound feedback — provider doesn't know it succeeded)

**Layout:**

### Pre-completion checklist
- "Before you mark complete, make sure:"
- 4 items shown as readonly checks:
  - ✓ Checklist 100% complete
  - ✓ At least 2 photos uploaded (after)
  - ✓ Area cleaned and ready
  - ✓ Customer informed

### Final notes (optional)
- Textarea for notes to customer (e.g., "Used 2 tubes of caulk; the leak should be sealed now").

### Submit
- Big button "Mark job complete"
- Disabled if checklist incomplete OR <2 after-photos.
- Bug 1220 fix: server also validates and returns 400 if conditions unmet.
- On success: haptic feedback (Bug 1221 fix) + transition to "Awaiting customer confirmation" screen.
- "₱460 will be released once customer confirms or after 48 hours."

**After:**
- Returns to job detail with new status.
- Push notification sent to customer.

**Acceptance:**
- Test 1: Submit blocked until checklist 100% + ≥2 photos (Bug 1220 fix).
- Test 2: Haptic feedback fires on success (Bug 1221 fix).
- Test 3: 48h auto-release timer set server-side.

---

## 21. provider/job/[id]/navigate.tsx — In-app navigation

**Route:** `/provider/job/[id]/navigate`
**Auth:** Required
**Backend:** `GET /provider/jobs/:id/route` returns turn-by-turn from Mapbox / Google Directions API
**Audit findings:** Bug 1222 (no traffic-aware routing — defaults to fastest), Bug 1223 (no "I'm here" button — must rely on GPS)

**Layout:**
- Full-screen map with route polyline.
- Top overlay: ETA, distance, next turn instruction.
- Voice guidance toggle.
- Bottom: customer info + lucide `Phone` to call.
- Bottom right: "I've arrived" button (Bug 1223 fix) → posts status=provider_arrived → returns to job detail.
- "Open in [Apple Maps / Google Maps]" link (sets status to en_route then deep-links to native maps).

**GPS broadcast behavior:**
- Background-task service via `expo-task-manager` broadcasts location every 10s while in en_route or arrived status.
- Location only sent to customer's tracker socket — not stored permanently after job done.

**Acceptance:**
- Test 1: Route uses traffic-aware option (Bug 1222 fix).
- Test 2: "I've arrived" button posts status update (Bug 1223 fix).
- Test 3: GPS broadcast stops on job complete or cancel.

---

## 22. provider/job/active.tsx — Active job redirect

**Route:** `/provider/job/active`
**Auth:** Required
**Backend:** `GET /provider/jobs/active`
**Audit findings:** N/A — utility screen.

**Layout:** Brief loading spinner, then redirect to active job's `/provider/job/[id]` if any, else `/(provider-tabs)/dashboard`.

**Use:** push notifications and deep links route here when a notification refers to "your active job" without a specific id.

---

## 23. provider/schedule.tsx — Working hours / availability

**Route:** `/provider/schedule`
**Auth:** Required
**Backend:** `GET|PATCH /provider/schedule`
**Audit findings:** Bug 1224 (no per-day exception — only single weekly schedule), Bug 1225 (timezone not visible)

**Layout:**
- "When you're available"
- 7 days of week, each row:
  - Day name
  - Toggle (work / off)
  - Time picker pair (start time / end time)
- Below: "Time zone: Asia/Manila (PHT)" (Bug 1225 fix)
- Bug 1224 fix: link "+ Add date-specific exceptions" → opens screen for adding e.g., "Off on May 1 (Labor Day)" or "Working extended hours May 15".

**Acceptance:**
- Test 1: Time zone label visible (Bug 1225 fix).
- Test 2: Date exceptions accessible (Bug 1224 fix).

---

## 24. provider/availability.tsx — Day-by-day availability override

**Route:** `/provider/availability`
**Auth:** Required
**Backend:** `GET|POST /provider/availability/exceptions`
**Audit findings:** Bug 1226 (no recurring exception — must add same exception annually for holidays)

**Layout:**
- Calendar view (full month).
- Tap a date → modal: Available all day / Off all day / Custom hours / Already booked (read-only from existing bookings).
- List below calendar of upcoming exceptions.
- Bug 1226 fix: "Make this annual" toggle on each exception.

**Acceptance:**
- Test 1: Annual recurring exception works (Bug 1226 fix).

---

## 25. provider/calendar.tsx — Job calendar

**Route:** `/provider/calendar`
**Auth:** Required
**Backend:** `GET /provider/calendar?month=<>`
**Audit findings:** Bug 1228 (no week view — only month), Bug 1229 (jobs across days don't show duration block)

**Layout:**
- View toggle: Month / Week / Day (Bug 1228 fix).
- Calendar grid showing scheduled bookings as colored blocks (Bug 1229 fix: block height represents duration).
- Tap day → list of jobs for that day.
- Tap job block → `/provider/job/[id]`.
- Long-press empty time → "Mark unavailable".

**Acceptance:**
- Test 1: Week view available (Bug 1228 fix).
- Test 2: Job blocks span their duration visually (Bug 1229 fix).

---

## 26. provider/services.tsx — Services I offer

**Route:** `/provider/services`
**Auth:** Required
**Backend:** `GET|POST|PATCH /provider/services`
**Audit findings:** Bug 1230 (custom price overrides backend min/max — provider can list ₱100 for service that's min ₱500), Bug 1231 (no per-area pricing — same price all areas)

**Layout:**
- List of services this provider offers.
- Each row: service name, my price (overrides system base), enabled toggle, edit chevron.
- "+ Add service" → service picker → configuration form.

**Edit form:**
- Service from category catalog (read-only after first set).
- My base price (₱) — Bug 1230 fix: server enforces ≥ system min, ≤ system max.
- My availability (inherits provider schedule by default; can override).
- Per-area pricing toggle (Bug 1231 fix, defer to v1.1 if time-constrained).
- Active toggle.

**Acceptance:**
- Test 1: Price entry rejected if outside system min/max (Bug 1230 fix).

---

## 27. provider/skills.tsx — Skills declaration

**Route:** `/provider/skills`
**Auth:** Required
**Backend:** `GET|POST /provider/skills`
**Audit findings:** Bug 1232 (no proficiency level — flat list), Bug 1233 (no skill verification — provider can claim anything)

**Layout:**
- List of skills with proficiency levels (Bug 1232 fix: Beginner / Intermediate / Expert).
- "+ Add skill" → searchable picker from skill taxonomy.
- Each skill: optional verification (link to certification — Bug 1233 fix).

**Acceptance:**
- Test 1: Proficiency level selectable (Bug 1232 fix).

---

## 28. provider/certifications.tsx — Certifications

**Route:** `/provider/certifications`
**Auth:** Required
**Backend:** `GET|POST /provider/certifications`
**Audit findings:** Bug 1234 (certification expiry not tracked — could show expired certs as valid)

**Layout:**
- List of certifications uploaded.
- Each row: name, issuer, issued date, expiry date (warning if <60 days), verified badge.
- Tap → view full certificate (S3 URL).
- "+ Add certification" → upload form (name, issuer, issued, expiry, file upload).

**Acceptance:**
- Test 1: Expired certificates shown with red expired badge, not used in matching algorithm.
- Test 2: <60-day expiry warns provider (Bug 1234 fix).

---

## 29. provider/portfolio.tsx — Work portfolio

**Route:** `/provider/portfolio`
**Auth:** Required
**Backend:** `GET|POST|DELETE /provider/portfolio`
**Audit findings:** Bug 1236 (no caption / description per photo), Bug 1237 (no consent-to-publish from customer for after-photos of their property)

**Layout:**
- Grid of portfolio photos.
- Tap → fullscreen viewer.
- "+ Add photo" → upload + caption form (Bug 1236 fix).
- Bug 1237 fix: when uploading from a job's after-photos, prompt "Do you have written consent from the customer to use this photo? [Yes, I have consent] [No, cancel]".

**Acceptance:**
- Test 1: Captions on each photo (Bug 1236 fix).
- Test 2: Customer consent affirmation captured (Bug 1237 fix).

---

## 30. provider/payouts.tsx — Payout history

**Route:** `/provider/payouts`
**Auth:** Required
**Backend:** `GET /provider/payouts?page=<>`
**Audit findings:** Bug 1238 (failed payouts show no resolution path), Bug 1239 (no export to CSV — defer v1.1)

**Layout:**
- List of payouts (date, amount, status, method).
- Each row tap → detail.
- Failed payouts highlighted red with "[Resolve]" button → opens support ticket pre-filled (Bug 1238 fix).

**Acceptance:**
- Test 1: Failed payouts have resolve action (Bug 1238 fix).

---

## 31. provider/withdraw.tsx — Manual withdrawal

**Route:** `/provider/withdraw`
**Auth:** Required
**Backend:** `POST /provider/withdraw { amount_cents }`
**Audit findings:** Bug 1240 (no preview of fees — provider sees gross only), Bug 1241 (no min withdraw enforced client — server returns 400 silently)

**Layout:**
- Available balance display.
- Amount input — Bug 1241 fix: min ₱500 (server-enforced); helper "Minimum ₱500".
- Selected payout method (read-only, from payout-settings).
- Bug 1240 fix: preview "₱5,000.00 will be sent to GCash 0917•••1234. PayMongo fee ₱25.00. You receive ₱4,975.00."
- "Withdraw" button.
- Confirmation modal with summary.

**Acceptance:**
- Test 1: Min amount enforced client + server (Bug 1241 fix).
- Test 2: Fee preview accurate (Bug 1240 fix).

---

## 32. provider/payout-settings.tsx — Payout method config

**Route:** `/provider/payout-settings`
**Auth:** Required
**Backend:** `GET|PATCH /provider/payout-settings`
**Audit findings:** Bug 1242 (changing GCash number has no verification — could be entered wrong), Bug 1243 (no auto-payout schedule option — only manual withdraw)

**Layout:**
- Current method (GCash / Maya / Bank transfer).
- Change method → form.
- Bug 1242 fix: changing requires SMS OTP verification on the new number.
- Bug 1243 fix: toggle "Auto-withdraw whenever balance ≥ ₱1,000".

**Acceptance:**
- Test 1: Account change requires OTP verification (Bug 1242 fix).
- Test 2: Auto-withdraw setting works (Bug 1243 fix).

---

## 33. provider/suki-customers.tsx — Repeat customers

**Route:** `/provider/suki-customers`
**Auth:** Required
**Backend:** `GET /provider/suki-customers`
**Audit findings:** Bug 1245 (no message / discount affordance to retain), Bug 1246 (suki count includes one-time customers from years ago — should respect timeframe)

**Layout:**
- "Your suki customers"
- List sorted by booking count desc.
- Each row: customer first name + last initial, booking count, last booking date, total spent, suki tier.
- Bug 1245 fix: per row "[Send custom discount]" → opens form to send a one-time discount code to that customer (defer to v1.1).
- Bug 1246 fix: filter "Last 12 months" / "All time".

**Acceptance:**
- Test 1: 12-month filter works (Bug 1246 fix).

---

## 34. provider/tier-progression.tsx — Tier roadmap

**Route:** `/provider/tier-progression`
**Auth:** Required
**Backend:** `GET /provider/tier-progress`
**Audit findings:** Bug 1247 (criteria hardcoded but server has different — Bug 974 chain), Bug 1248 (founding tier not shown — Bug 1323 chain)

**Layout:**
- Current tier badge + progress to next.
- Tiers list (server-driven, Bug 1247 fix):
  - New (default)
  - Verified (after 5 jobs + ≥4.5 rating + 0 disputes)
  - Pro (after 25 jobs + ≥4.7 rating + <2% dispute rate)
  - Elite (after 100 jobs + ≥4.9 rating + <1% dispute rate + ≤30 min response time)
  - Founding (admin-assigned, Bug 1323 fix — surfaces here when assigned)
- Per tier: criteria progress, benefits, commission rate.

**Acceptance:**
- Test 1: Criteria shown match server (Bug 1247 fix).
- Test 2: Founding tier visible when assigned (Bug 1323 chain).

---

## 35. provider/reviews.tsx — Reviews received

**Route:** `/provider/reviews`
**Auth:** Required
**Backend:** `GET /provider/reviews?page=<>`
**Audit findings:** Bug 1249 (no reply affordance — provider can't respond to reviews), Bug 1250 (no flag-as-abusive button)

**Layout:**
- Average rating + count.
- 5-star breakdown bars.
- Sub-rating averages (5 categories).
- List of reviews:
  - Customer first name + last initial
  - Star rating + sub-ratings
  - Review text + photos
  - Date
  - "Reply" button (Bug 1249 fix, defer to v1.1) — provider response shown below review when posted
  - "Flag as inappropriate" (Bug 1250 fix) → opens form, sends to admin queue

**Acceptance:**
- Test 1: Flag button works (Bug 1250 fix).

---

## 36. provider/account-management.tsx — Account & security

**Route:** `/provider/account-management`
**Auth:** Required
**Backend:** Various profile mutations
**Audit findings:** Same as customer/account-management (Bug 957/958 chain).

**Layout sections:**
- Profile photo
- Name (editable)
- Phone (read-only — change via support)
- Email (editable, requires verification)
- DOB
- Address (personal — separate from service area)
- NBI clearance status + expiry + "Re-upload" button
- Government ID (re-upload)
- Documents archive (all uploaded)
- Tax info (TIN, BIR registration if business)
- Linked accounts
- Delete account → `/customer/data-rights?action=erasure`

**Acceptance:** as customer side; same Bug 957 fix patterns.

---

## 37. provider/notifications.tsx — Provider notification inbox

**Route:** `/provider/notifications`
**Auth:** Required
**Backend:** `GET /notifications/inbox?role=provider`
**Audit findings:** Same as customer notifications (Bug 966/967 chain).

**Layout:** Same shape as customer notifications. Filter chips appropriate for provider: All, Job offers, Payments, Account, System.

**Acceptance:** As customer side.

---

## 38. provider/help.tsx — Provider help

**Route:** `/provider/help`
**Auth:** Required
**Backend:** Static FAQ from `/cms/help-articles?audience=provider`
**Audit findings:** Bug 1266 (provider FAQ not separate from customer — currently same articles)

**Layout:** Categories, FAQ, contact support, similar shape to customer help. Bug 1266 fix: server distinguishes audience and returns provider-relevant articles.

**Acceptance:** Provider-specific FAQ articles served (Bug 1266 fix).

---

## 39. provider/settings.tsx — Provider settings

**Route:** `/provider/settings`
**Auth:** Required
**Backend:** `GET|PATCH /provider/settings`
**Audit findings:** Bug 1267 (settings duplicated across multiple submenus — must consolidate here)

**Layout:**
- App appearance (light/dark/system)
- Language (English / Tagalog / Cebuano — defer multi-language to v1.1)
- Notification settings → `/provider/notifications` (or inline here)
- Auto-accept jobs toggle (with criteria — defer to v1.1)
- Sound + haptic toggles
- Data usage (compress photos toggle, low-data mode)
- About (version, build, ToS, Privacy)
- Diagnostics (export logs to support)
- Sign out
- Delete account

**Acceptance:** All settings consolidated in one place (Bug 1267 fix).

---

## 40. provider/chat/[id].tsx — Provider chat

**Route:** `/provider/chat/[id]`
**Auth:** Required
**Backend:** Same socket.io infrastructure as customer chat.
**Audit findings:** Bug 38 chain — same decision as customer/chat/[id].tsx.

**DECISION:** if customer chat is deferred, provider chat is too. Both must launch together.

**Layout:** Same shape as customer chat — message list, input, attachments.

**Acceptance:** Same as customer chat — wire fully or remove all chat affordances from provider job screens.

---

## 41. provider/service-area.tsx — Edit service area post-onboarding

**Route:** `/provider/service-area`
**Auth:** Required
**Backend:** `GET|PATCH /provider/service-area`
**Audit findings:** Bug 1268 (changing area requires admin approval but no UI indication of pending state)

**Layout:**
- Current area: name + radius + map preview.
- "Change area" button → opens area selector (same as onboarding step 4).
- Bug 1268 fix: after submission, status shows "Pending admin review" with explanation.

**Acceptance:** Pending state shown clearly (Bug 1268 fix).

---

# Cross-cutting acceptance for the provider mobile app

These apply universally across all 39 provider screens:

1. **All universal customer requirements apply** (no emoji, brand `#1B3A4B`, encrypted MMKV, formatCurrency, server-canonical money, Routes registry, four states, accessibility, no console.log, no axios, etc.).
2. **Provider-specific haptics** — every status-changing action (start travel, arrive, start job, complete job) triggers `Haptics.impactAsync('Heavy')` for confirmatory feedback. Cancel actions use `Haptics.notificationAsync('Warning')`. Money actions (withdraw, complete job) use heavy haptic. Bug 1215 chain.
3. **GPS background broadcasting** — only active during `provider_en_route` and `provider_arrived` status. Stops on job complete / cancel / app force-quit. Battery-conscious: 10s polling rate during active job, no polling otherwise. Privacy: GPS coordinates sent only to customer's tracker socket, not stored permanently.
4. **NBI lifecycle banners** — every screen surface NBI expiring (<30 days) and NBI expired states via global banner. Expired NBI blocks accept-quote and start-job actions server-side AND client-side.
5. **Payment-method authentication** — changing GCash/Maya/bank account requires SMS OTP to the new account before commit. Bug 1242 chain.
6. **Tier progression criteria from server** — no hardcoded tier rules in client. Bug 974/1247 chain. Founding tier visible when assigned (Bug 1323 chain).
7. **Provider can NOT see customer phone** in plain text anywhere. All calls route through Twilio masked numbers. Server-side proxy stores call metadata for compliance (Bug 1211 chain).
8. **Photo uploads always go to S3** via multipart/form-data with compression. Bug 461 chain. Verified by absence of any `file://` URIs in API request bodies in network logs.
9. **All checklists are service-category-driven** from server-side templates. Bug 460 chain. Aircon repair providers see aircon checklists. Massage providers see massage checklists.
10. **Job completion gated by checklist + photos** at both client and server. Bug 1220 chain.
11. **Provider notifications respect quiet hours** — no push notifications between 10pm and 7am unless tagged "urgent" (active job in progress).
12. **Onboarding is resumable** — provider can quit any onboarding screen and return to where they left off. State persisted server-side per `provider_onboarding_progress` table.
13. **Background-check vendor integration is launch-blocker** — without real vendor (Onfido / Persona / etc.), the v1.0 path is admin manual approval. This is documented in LAUNCH-LIMITATIONS.
14. **Sign out calls server logout endpoint** — Bug 900/1020/1260 chain.
15. **Independent contractor language is consistent** — every screen referencing employment uses "independent contractor" not "employee" / "worker" (legal compliance with PH labor law).

---

# What's next: Part 3 — Bug Remediation Manual

This catalog covered the 39 mobile provider screens, completing the screen catalog trilogy:

- **Part 2A** — 28 admin pages
- **Part 2B** — 43 mobile customer screens  
- **Part 2C** — 39 mobile provider screens
- **Total: 110 screens fully spec'd**

When Ken says "continue," I'll deliver:

- **Part 3 — Bug Remediation Manual** — every one of the 1,371 active bugs grouped into the 14 dispatches in dependency order. Each bug entry has: file:line citation, exact problem, exact fix code (not prose — actual TypeScript / SQL / etc.), test signature for AI coder to write. Dispatch 01 covers 6 deploy-blockers (Bug 1061 MMKV, Bug 1235 admin password seed, Bug 1251 admin localStorage tokens, Bug 1286 Google Maps placeholder, Bug 1309 Prometheus zero scrape, Bug 1325 S3 SSE deferred). Dispatch 02 covers cross-source-of-truth reconciliation (cancellation policy, brand colors, founding tier, routes registry). And so on through Dispatch 14.

Then Part 4 (gate hardening: actual shell scripts + CI configuration) and Part 5 (Ken's review handbook) complete the package.
