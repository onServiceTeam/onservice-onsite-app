# SCREEN CATALOG — Admin (Part 2A of 3)

**This is the canonical specification for every admin page in onService PH.** It serves three audiences:

1. **The AI coder** uses it to verify "did I build this screen correctly?" Every section's acceptance criteria become test assertions and visual-audit checklist items.
2. **A UX/UI design firm** (when one is engaged later — see Design Contract V2 §16) uses it as the build brief for redesigning the admin in Figma.
3. **Ken** uses it to verify, by clicking through each page, whether what he sees matches what the catalog says. Discrepancies are bugs.

**This catalog covers the 28 admin pages.** Mobile customer screens are in Part 2B. Mobile provider screens are in Part 2C.

**How each screen is documented:**

```
## NN. PageName.tsx — One-line purpose
Route: /path/to/page (mounted in App.tsx)
RBAC: which admin roles see it
Backend: which routes/services it hits
Audit findings to address: bug numbers from V14
Layout: ASCII wireframe
Fields/Columns: what's displayed and how
Actions: every button, every click, every outcome
States: loading / empty / error / success
Acceptance: testable criteria
```

---

## 0. Admin shell — applies to every admin page

Every admin page renders inside `AdminLayout.tsx` which provides the shell. The shell is locked per Design Contract V2 §10. Specifically:

**Header (top, 56px)**
- Logo on left (28px tall, `brand.primary` background, white "onService" text in Inter 600/16)
- Global search input centered, max-width 480px, opens with `cmd+K` / `ctrl+K`. Searches providers, customers, bookings, disputes, support tickets. Shows 8 most recent results with type badges (lucide icons). Selecting result navigates to its detail page.
- Date/time on the right showing `Asia/Manila` zone in format `Wed, Apr 29 · 14:32 PHT`. Updates every 30 seconds. Uses `formatInTimeZone`.
- Environment badge next to time when `import.meta.env.MODE !== 'production'`: yellow pill saying `STAGING` or `DEV`.
- Notification bell (lucide `Bell`) with unread count badge. Click opens dropdown with last 20 admin notifications, "Mark all read", "View all" → AuditLogPage with filter `actor_id = currentUser.id`.
- User avatar (lucide `UserCircle` 32px circle) clicks to open menu: "Profile" → no-op for now (not built), "Settings" → SystemSettingsPage, "Sign out" → calls `/auth/admin/logout`, clears tokens, redirects to LoginPage.

**Sidebar (left, 240px, dark variant)**
- Background `neutral.900` `#161616`, text `neutral.0`, hover `neutral.800` `#262626`, active item has 3px `brand.primary` accent on left edge AND 10%-opacity `brand.primary` background tint.
- 22 nav items. **Filtered by role per migration 047** (Bug 1270 — currently shows all items regardless). Implementation: each nav item declares required permission (`audit_log:view`, `compliance:view`, etc.); the sidebar consults `currentUser.permissions` set from the JWT.
- Each item: lucide icon (16px) + label (14/500). Active state styling per above.
- Order (top to bottom): Dashboard, Providers, Customers, Bookings, Catalog, Pricing Rules, Service Areas, Disputes, Dispatch, Financials, Payouts, Recurring, Business Accounts, Marketing, Templates, Compliance, Data Protection Log, Consent Versions, Audit Log, Support Tickets, Staff & Roles, Settings.
- Collapsed mode: 64px wide, icons only. Toggle button at bottom of sidebar. State persists in localStorage.

**Content area**
- Fluid width, `max-width: 1600px`, centered.
- Default padding `24px` horizontal, `24px` top.
- Page title at top in `24/700`, breadcrumbs above it in `12/400 text-secondary`.
- Sticky filter bar (when applicable) below page title with `bg-bg-alt` background and `border-bottom`.

**Toast container**
- Bottom-right corner, max 4 toasts visible, FIFO stack.
- 4-second default duration, dismissible.
- Use `sonner` library (already in repo).
- Status colors per Design Contract V2 §2.

**RBAC enforcement**
- Every page wraps in a `<RequirePermission permission="X">` HOC. If user lacks permission, render a 403 page with "You don't have access to this section. Contact super_admin to request access." plus the specific permission name in `<code>`.
- Sidebar items hide entirely when permission absent. Direct URL access still hits the 403 page.

**Required states (universal)**
- Loading: skeleton matching content structure, never blank with spinner. Skeleton appears within 200ms.
- Empty: concrete copy + lucide illustration (32-48px) + action button. Examples in each page.
- Error: friendly message + Retry button + Sentry-logged. Stack traces never visible to user.
- Offline: top banner "You're offline. Some features unavailable." Disables write actions.

---

## 1. LoginPage.tsx — Admin sign-in

**Route:** `/login`
**RBAC:** Public (no auth required)
**Backend:** `POST /api/v1/auth/admin/login`, `POST /api/v1/auth/admin/2fa/setup`, `POST /api/v1/auth/admin/2fa/enable`, `POST /api/v1/auth/admin/2fa/verify`
**Audit findings:** Bug 96 (account enumeration via differentiated error messages), Bug 99 (no captcha on admin login), Bug 1227 (hCaptcha bypass in non-production), Bug 1251 (admin tokens in localStorage — fix migrates to httpOnly cookies in Dispatch 02)

**Fields:**
- Email — `type=email`, `inputMode=email`, `autoComplete=username`, required, validated as email. On invalid: "Enter a valid email address."
- Password — `type=password`, `autoComplete=current-password`, required, min length 8. Show/hide toggle (lucide `Eye` / `EyeOff`). On change focus, visibility resets to hidden.
- hCaptcha — required, server verifies token. Failure shows "Verification failed. Please try again."

**Actions:**
- **Sign in button** — disabled until email valid + password ≥ 8 chars + captcha solved. On click: shows spinner, calls `/auth/admin/login`. Three response branches:
  1. **Credentials valid + 2FA enabled** → navigate to 2FA verify view (same page, swapped panel) with 6-digit input. Submitting valid TOTP → mint tokens, navigate to dashboard.
  2. **Credentials valid + 2FA NOT enabled (admin or super_admin)** → navigate to 2FA setup view showing QR code (from `/2fa/setup`), instructions, and 6-digit input. Submitting valid TOTP → calls `/2fa/enable`, mints tokens, navigates to dashboard.
  3. **Credentials invalid** → toast error "Sign-in failed. Check your email and password." (DO NOT differentiate "wrong email" vs "wrong password" — Bug 96 fix). After 3 consecutive failures from this IP, captcha mandatory; after 5, IP blocked for 15 min server-side.
- **Forgot password** — currently no flow. Renders disabled link with tooltip "Contact your super_admin to reset." (Phase 14 dispatch 14 may add real flow.)
- **Show/hide password** — toggles visibility, focuses field after toggle.

**States:**
- **Loading** — spinner inside Sign-in button, button disabled, fields disabled. Page background unchanged.
- **Empty** — N/A (no list)
- **Error** — toast: "Sign-in failed. Check your email and password." For server errors (5xx): "Something went wrong. Try again or contact support if it persists." Sentry-logged with `request_id`.
- **Success** — brief "Signed in" toast then redirect.

**Acceptance:**
- Test 1: Submitting invalid email format prevents form submit and shows inline error.
- Test 2: Submitting wrong password 4 consecutive times triggers captcha requirement (verified by `captchaRequired: true` in server response).
- Test 3: Submitting 6 consecutive invalid attempts blocks the IP server-side (`blocked_ips` table receives row).
- Test 4: Admin without 2FA setup is forced into setup flow before token issued.
- Test 5: Token storage is httpOnly cookie set by server (Bug 1251 fix), not localStorage. Verified by absence of token in `localStorage` after login and presence of `Set-Cookie: admin_session=...; HttpOnly; Secure; SameSite=Strict; Path=/`.
- Test 6: Console is empty after successful login. No warnings, no errors.
- Test 7: Page renders correctly at viewport widths 1920, 1440, 1280, 768, 414 (yes — admin must be tablet-usable).

---

## 2. DashboardPage.tsx — Operational overview

**Route:** `/` (default after login)
**RBAC:** All admin roles see it; specific KPI cards filtered by role (Finance role doesn't see compliance KPIs and vice versa)
**Backend:** `GET /api/v1/admin/dashboard?period=24h|7d|30d`, `GET /api/v1/admin/wallets/summary`, Socket.io subscription to `admin:dashboard` room for live updates
**Audit findings:** Bug 1244 (auto-refresh polling not respecting visibility), Bug 1255 (KPI cards have no skeleton during load), Bug 1264 (dashboard charts use emoji icons — Phase 02 fix incomplete on this page)

**KPI cards (8 cards in 4×2 grid):**
1. **Revenue** — sum of platform commission + service fee + retained surge for the selected period. Centavos to ₱ via `formatCurrency`. Comparison to previous equivalent period. Lucide icon: `TrendingUp` (replaces 💸).
2. **GMV** — gross merchandise value (sum of `bookings.total_amount` where status in {released, completed} for period). Lucide: `Package` (replaces 📦).
3. **Active jobs** — count of bookings where `status IN ('confirmed','provider_en_route','provider_arrived','in_progress')`. Lucide: `Wrench` (replaces 🔧).
4. **Open disputes** — count of disputes where `status IN ('opened','under_review','escalated')`. Lucide: `AlertTriangle` (replaces ⚠️).
5. **New signups** — count of users created in period. Lucide: `UserPlus` (replaces 🆕).
6. **Pending approvals** — count of providers in `pending_review`. Lucide: `CheckCircle2` (replaces ✅).
7. **Today's bookings** — count of bookings scheduled for today's date. Lucide: `ClipboardList` (replaces 📋).
8. **Average rating** — weighted average of `reviews.rating_overall` for period. Lucide: `Star` (replaces ⭐).

Each card: title (12/500 `text-secondary`), value (30/700 `text-primary`), comparison (12/400 with up/down arrow lucide icon, green for positive change, red for negative, gray for no-change). Loading state: skeleton at exact dimensions.

**Charts:**
- **Revenue trend** — line chart, 30-day daily aggregate, x-axis dates (Asia/Manila), y-axis ₱. Single line in `brand.primary`. Recharts library. Tooltip on hover shows date + value.
- **Booking volume by category** — horizontal bar chart, top 7 categories. Bars in `brand.secondary`. Sorted descending. Lucide icons next to category names.
- **Acquisition funnel** — 4-step funnel (Visit → Signup → First booking → Repeat customer). Each step shows count and conversion %. Recharts FunnelChart.

**Operational alerts** (max 5 visible, "View all" link to filter):
- Each alert: lucide icon (16px) + concise message + age + click target (navigates to relevant page filtered to the alert).
- Categories: stale disputes, expiring NBI, DSR alerts, fraud-flagged bookings, payout failures, low guarantee fund runway.

**Quick actions** (4 buttons):
- "+ Approve provider" → opens ProvidersPage filtered to `status=pending_review`
- "+ Adjust wallet" → opens modal (no separate page) for wallet adjustment with audit trail
- "+ Issue refund" → opens DisputesPage filtered to `status=opened`
- "+ View today's jobs" → opens BookingsPage filtered to `scheduled_at=today`

**Wallet runways:**
- Platform wallet, Guarantee fund, Tax escrow.
- Each shows balance + months runway (balance ÷ recent 30-day burn rate). Color: green ≥6mo, yellow 3-6mo, red <3mo.
- Click each → FinancialsPage with that wallet selected.

**Service areas live:**
- One row per service area in {recruiting, soft_launch, active}. Active provider count + active customer count + bookings-today count. Updates via socket.io `admin:dashboard` events.

**Actions:**
- Period selector (Today / 7d / 30d) — radio button group, `today` default. Changing re-fetches all data.
- Refresh button — manual trigger; auto-refresh every 60s WHEN tab is visible (`document.visibilityState === 'visible'` — Bug 1244 fix). Shows last-refreshed timestamp.

**States:**
- **Loading** — skeleton boxes matching exact dimensions of all 8 KPI cards + charts. Charts show skeleton with grid lines visible. Within 200ms of mount.
- **Empty** — N/A for dashboard (always has data even if zero — show "0" not blank).
- **Error per widget** — each KPI / chart has independent error state. One widget failing doesn't blank the whole page. Shows "Failed to load. [Retry]" inside the card.
- **Success** — data renders, last-refreshed timestamp updates.

**Acceptance:**
- Test 1: All 8 KPI cards use lucide icons, no emoji.
- Test 2: Auto-refresh stops when `document.visibilityState !== 'visible'` and resumes on visibility (Bug 1244 fix).
- Test 3: Period changes correctly affect all KPIs and charts (URL query updates: `?period=7d`).
- Test 4: Quick actions navigate to correctly-filtered pages (verified by URL contents).
- Test 5: Wallet runway color coding matches thresholds (≥6mo green / 3–6mo yellow / <3mo red).
- Test 6: Operational alert click navigates to filtered destination (e.g., disputes alert → DisputesPage `?status=overdue`).
- Test 7: Charts respect Asia/Manila timezone for date axes (verified by snapshot at known date).
- Test 8: Loading state appears within 200ms and skeleton matches final dimensions (no layout shift on data arrival).
- Test 9: At viewport 1280, layout reflows to 2×4 KPI grid; at 768, single column.
- Test 10: Console empty during normal operation.

---

## 3. ProvidersPage.tsx — Provider list + management

**Route:** `/providers`
**RBAC:** `provider:view` permission required
**Backend:** `GET /api/v1/admin/providers` (paginated), `POST /api/v1/admin/providers/:id/approve|reject|suspend|reactivate`
**Audit findings:** Bug 78 (provider approve/reject missing transactional audit), Bug 81 (provider activity feed leaks raw IPs/user_agents — must mask in this list view), Bug 350 (phone/email shown plain — must mask except on detail), Bug 282 (no saved filters)

**Columns (configurable, default visible):**
1. ☐ Selection checkbox (bulk actions)
2. Photo — 32×32 lucide `UserCircle` if no `profile_photo_url`, else `<img>` with fallback on error
3. Name — `first_name + last_name`
4. Business name — `business_name` or "—"
5. Phone — masked: `+63 9XX ••• 1234` (last 4 visible). Click "👁" reveals full (audit-logged read).
6. Email — masked: `j•••@gmail.com`. Click reveals.
7. Status — colored badge: pending_review (yellow), active (green), suspended (red), inactive (gray), rejected (red)
8. Tier — badge: New (gray), Verified (blue), Pro (purple), Elite (gold), Founding (gold-bordered)
9. Rating — "4.8 ★ (47)" (avg + count). Sortable.
10. Total jobs — number, sortable
11. Service area — primary area name
12. Last active — relative ("2h ago", "3d ago"). Sortable.
13. Profile completion — % with progress bar. Sortable.

Hidden by default (toggleable): NBI status, NBI expiry, primary category, joined date, suspension reason.

**Filters (sticky bar):**
- Search — fuzzy across name, phone (last 4 or full), NBI number, business name. Debounced 300ms. Shows "Showing N results for 'X'" beneath.
- Status — multi-select dropdown
- Tier — multi-select
- Area — single-select
- Category — multi-select
- Joined date range — calendar picker
- Save filter button — saves current filter combo to user prefs (`admin_user_preferences` table). Shows "My filters" submenu with saved filters.

**Actions:**
- **Row click** → ProviderDetailPage `/providers/:id`.
- **Phone/email reveal** — click "👁" icon next to masked value. Calls `POST /admin/providers/:id/reveal-pii { field: 'phone' }`. Audit-logged. Shows for 30s then re-masks.
- **Bulk actions** (top of table when ≥1 row selected):
  - Approve selected — for `status=pending_review` rows only. Modal asks for optional note (max 500 chars). Calls each provider's approve endpoint sequentially with progress bar.
  - Reject selected — modal asks for required reason (min 20 chars per Bug 78 fix). Calls reject endpoint per row.
  - Suspend selected — required reason (min 20 chars). Confirmation modal showing impact ("This will affect 3 active bookings totaling ₱4,500.").
  - Send message — modal with message input (max 500 chars), sends in-app notification.
  - Export — downloads CSV (admin-readable) or Excel.
- **+ Approve provider** quick-action button (top right) — opens filter for `status=pending_review`.
- **Map view toggle** — switches to map showing provider pins (clustered). Click pin → mini card with name, status, recent jobs.
- **Column show/hide** — toggleable list, persists to user prefs.
- **Export ▾** — CSV (all visible columns), Excel (all visible columns), CSV (filtered), Print PDF.

**States:**
- **Loading** — 10 skeleton rows with realistic column widths.
- **Empty** — "No providers match your filters. [Clear filters]" + lucide `Users` 48px illustration.
- **Error** — "Failed to load providers. [Retry]" inline at top of table area.
- **Success** — data + pagination footer.

**Acceptance:**
- Test 1: Phone numbers display masked by default; reveal action audit-logged in `admin_actions` table with `action_type='pii_reveal'`.
- Test 2: Bulk reject requires reason ≥ 20 chars (input shows counter).
- Test 3: Filter combinations are URL-encoded (`?status=active,pending_review&tier=pro&area=boracay`) so sharing URL preserves filters.
- Test 4: Save-filter creates a row in `admin_user_preferences`; re-renders the filter on revisit.
- Test 5: Sort order persists across pages.
- Test 6: Map view performs <1s render with 1,000 markers (clustering enabled).
- Test 7: Sidebar shows Providers nav only if user has `provider:view` permission.
- Test 8: At 768px viewport, filters collapse into a "Filters (3)" expandable.

---

## 4. ProviderDetailPage.tsx — Provider 360°

**Route:** `/providers/:id`
**RBAC:** `provider:view`. Some tabs require additional permissions (Financials → `provider:adjust_wallet`, Notes → `provider:notes`).
**Backend:** `GET /api/v1/admin/providers/:id`, `POST /api/v1/admin/providers/:id/{approve|reject|suspend|reactivate|adjust-wallet|reset-tier}`, `GET /api/v1/admin/providers/:id/jobs|payouts|reviews|disputes|notes|activity`
**Audit findings:** Bug 79 (updateProviderProfile not transactional), Bug 80 (deleteProviderNote hard delete with no audit), Bug 81 (activity feed leaks IPs/UAs — must mask), Bug 82 (createProviderNote extra round-trip — combine into single mutation), Bug 347/348 (admin approve/reactivate missing audit)

**Header:**
- Avatar 64px circle (lucide UserCircle fallback)
- Name (24/700)
- Business name (16/500 `text-secondary`)
- Phone + email (masked + reveal toggle)
- Status badge + Tier badge + Rating
- Action buttons (varies by status):
  - Status `pending_review`: [Approve] [Reject] [Send message]
  - Status `active`: [Suspend] [Send message] [Reset tier ▾] [⋯]
  - Status `suspended`: [Reactivate] [Send message] [⋯]
  - [⋯] menu: Adjust wallet (super_admin), Force re-NBI, Force re-onboard, View full audit trail

**Tabs (7):**

### 4.1 Profile tab
- All editable fields with inline edit (pencil icon → input → save/cancel). Each save calls `PATCH /admin/providers/:id` and creates `admin_actions` entry.
- Sections: Personal, Business, Identity, Skills, Service Areas, Schedule, Onboarding milestones, Tier history.
- Founding tier toggle (super_admin only) — shows confirmation modal with effective dates.
- "Force re-NBI" button (admin only) — sets `nbi_status=expired`, requires re-upload from provider, audit-logged.

### 4.2 Jobs tab
- Sub-table of bookings filtered to this provider. Same columns as BookingsPage but pre-filtered.
- Quick stats at top: total jobs (lifetime), this month count, avg rating, completion rate.
- Click row → BookingDetailPage.

### 4.3 Financials tab
- Wallet balance card: available, pending, total
- Lifetime earnings, this month, last 30 days
- Recent transactions table (paginated)
- Pending payouts list
- "Adjust wallet" button (super_admin only) — opens modal:
  - Direction (credit / debit), amount (₱ centavos input), required reason (≥20 chars), required note for provider, confirm modal
  - Bug 78 fix: entire mutation runs in single `db.transaction` covering wallet UPDATE + transactions INSERT + admin_actions INSERT. Failure rolls back all.

### 4.4 Reviews tab
- All reviews this provider received
- Average + 5-sub-rating breakdown chart
- Recent reviews list with full text + sub-ratings
- "Flag review" action — admin can mark abusive review for hiding (audit-logged)

### 4.5 Disputes tab
- All disputes involving this provider
- Resolution outcomes summary (X resolved customer, Y resolved provider, Z draws)
- Click → DisputeDetailPage

### 4.6 Activity tab
- Login history (timestamps, masked IP, masked user-agent — Bug 81 fix)
- App usage events (last 50)
- Status changes
- Tier changes with reasons
- All admin actions on this provider (approve/suspend/etc.)
- Pagination

### 4.7 Notes tab
- Internal admin notes about this provider (visible to admins only).
- Add note: text input (max 2000 chars), category (general/warning/escalation/positive), submit.
- Edit/delete own notes (Bug 80 fix: soft delete with `deleted_at` + `deleted_by` + reason; preserves audit).
- Other admins' notes read-only unless super_admin.

**Actions table:**

| Button | Effect | Confirmation |
|---|---|---|
| Approve | Status pending → active, sets approval timestamp, sends notification, creates admin_action audit row | Modal: "Approve Juan dela Cruz?" + optional note |
| Reject | Status pending → rejected, sends notification | Required reason ≥ 20 chars |
| Suspend | Status active → suspended, marks all upcoming bookings for reassignment | Required reason ≥ 20 chars + impact summary ("3 upcoming bookings will need reassignment") |
| Reactivate | Status suspended → active | Optional note |
| Reset tier | Modal to set tier to specific value (admin override) | Requires reason explaining the override; super_admin only for Pro/Elite/Founding |
| Force re-NBI | Sets nbi_status=expired, notifies provider | Confirmation only |
| Force re-onboard | Resets `onboarding_completed_at`, requires provider to redo onboarding | Required reason; super_admin only |
| Adjust wallet | Credit or debit with reason | Required reason ≥ 20 chars + audit summary preview |

**Acceptance:**
- Test 1: Status mutations create `admin_actions` row in same transaction (Bug 78 fix verified by simulating audit insert failure → wallet UPDATE rolls back).
- Test 2: Notes use soft delete (`deleted_at`, `deleted_by`), not DELETE FROM (Bug 80 fix).
- Test 3: Activity feed shows masked IPs (`x.x.x.123`) and user-agents ("Chrome on macOS") — never raw (Bug 81 fix).
- Test 4: Adjust-wallet button hidden for non-super_admin.
- Test 5: Tab switching uses URL hash (`/providers/:id#financials`) so refreshing preserves tab.
- Test 6: Founding tier toggle creates `admin_actions` with `action_type='founding_tier_assigned'`.

---

## 5. CustomersPage.tsx — Customer list

**Route:** `/customers`
**RBAC:** `customer:view`
**Backend:** `GET /api/v1/admin/customers`, `POST /api/v1/admin/customers/:id/{suspend|reactivate|flag_fraud}`
**Audit findings:** Bug 287 (full phone numbers in churn analytics), Bug 342/343 (phone/email plain — must mask), Bug 74 (flag_fraud action recorded as customer_suspended — misleading audit, fix in API)

**Same pattern as ProvidersPage** — abbreviated description here:

**Columns:** ☐ | Photo | Name | Phone (masked) | Email (masked) | Status | Total bookings | Total spent | Suki tier | Last booking | Joined.

**Filters:** search (name/phone/email), status, suki tier, joined date range, "has open dispute" toggle.

**Bulk actions:** suspend, reactivate, flag fraud, send message, export.

**Specific to customers:**
- Suki tier badges: New, Returning, Loyal, Champion (matches `suki.tiers` config).
- "Has B2B contract" indicator — links to BusinessAccountsPage if applicable.

**Acceptance:** same trust patterns as ProvidersPage. Bug 74 fix verified: `action_type='customer_flagged_fraud'` not `customer_suspended` in `admin_actions`.

---

## 6. CustomerDetailPage.tsx — Customer 360°

**Route:** `/customers/:id`
**RBAC:** `customer:view`. Adjust-wallet requires `customer:adjust_wallet` (super_admin).
**Backend:** Similar to provider detail.
**Audit findings:** Bug 75/76 (activity feed IPs/UAs — mask), Bug 287 (PII in churn data — mask in this page).

**Tabs (6):** Profile, Bookings, Payments, Disputes, Referrals, Activity.

Same pattern as ProviderDetailPage. Specific differences:
- **Payments tab** — saved payment methods (masked), top-up history, refund history, total spent.
- **Referrals tab** — code (`MARIA-2024`), referrals made, referrals redeemed, credits earned, payout history.
- **Manual credit** action (super_admin only) — opens wallet adjust modal. Same transaction safety as provider wallet adjust.

**Acceptance:** all PII masked except on explicit reveal action; reveals audit-logged.

---

## 7. BookingsPage.tsx — Booking list

**Route:** `/bookings`
**RBAC:** `booking:view`
**Backend:** `GET /api/v1/admin/bookings`, socket.io subscription to `admin:bookings` for live status updates
**Audit findings:** Bug 1244 area (auto-refresh respects visibility), Bug 1257 (no real-time status badges), Bug 73 (image_type returned as caption — fix in API)

**Layout:** standard list page. Real-time status badges update via Socket.io.

**Columns:** ☐ | Booking # | Status | Customer | Provider | Service | Scheduled | Total | Created | Has dispute | Surge applied.

**Status badges (17 statuses):** each has unique colored badge from `bookingStatusBadges` map. Updates live via socket.io `booking:status_changed` event.

**Filters:** status (multi), service category, area, date range (scheduled), customer, provider, "active right now" toggle, "has dispute" toggle.

**Map view tab:** every active booking pin on map; pin color = status; click pin → mini card with details + "View detail".

**Bulk actions:** export only (manual booking changes happen on detail page).

**Acceptance:**
- Real-time status updates within 2 seconds of socket event (verified by socket mock).
- Map view performs <1s with 500 markers.
- "Active right now" filter shows only `status IN ('confirmed','provider_en_route','provider_arrived','in_progress')`.

---

## 8. BookingDetailPage.tsx — Booking 360°

**Route:** `/bookings/:id`
**RBAC:** `booking:view`. Money actions require `booking:money_action` (super_admin).
**Backend:** `GET /api/v1/admin/bookings/:id`, `POST /admin/bookings/:id/{release-escrow|refund|reassign|cancel}`
**Audit findings:** Bug 69 (cancelBookingAsAdmin escrow refund OUTSIDE transaction), Bug 70 (manualReleaseEscrow + admin_actions OUTSIDE transaction), Bug 71 (refundBookingEscrow same), Bug 9 (refundFromEscrow after commit — DOCUMENTED design, not a bug per Phase 08 paper-trace)

**Header:**
- Status pill (with live updates via socket)
- Booking #, dates (created, scheduled), age
- Action buttons (super_admin): [Reassign] [Refund] [Force complete] [Cancel] [⋯]

**Sections:**

### Parties
- Customer card: avatar, name (link to CustomerDetailPage), phone (masked + reveal), wallet balance, total prior bookings, dispute history badge
- Provider card: avatar, name (link), phone (masked + reveal), tier, rating, distance from booking, current load

### Timeline
- Every status transition with timestamp (Asia/Manila), actor (system/admin/customer/provider), reason if applicable.
- Lucide checkmark for completed steps, gray for upcoming, animated for current.

### Evidence
- Photos: thumbnails, click to view full S3 URL (Bug 461 fix verification)
- Chat: snippet preview + "View all messages" → opens chat viewer modal
- GPS log: timestamps + coords (linked to map preview)
- Checklist: progress bar, items completed/total

### Money breakdown
- Service price, service fee, surge (with rule applied), total
- Escrow status (held / released / refunded)
- Provider commission (% by tier)
- Provider receives, platform retains, VAT (12%)
- All values to centavo precision.

### Admin audit (this booking only)
- Every admin action affecting this booking, in chronological order.
- Each entry: timestamp, actor, action, reason, before/after state.

**Money actions (super_admin only):**

| Action | Effect | Confirmation |
|---|---|---|
| Release escrow | Force-releases held escrow to provider | Required reason ≥30 chars; preview shows wallet impact ("Will move ₱435 to provider wallet, ₱115 to platform"); double-confirm typed booking ID |
| Refund (full) | Releases escrow back to customer wallet | Same |
| Refund (partial) | Custom amount, with reason | Amount input + reason; cannot exceed escrow balance |
| Reassign | Modal: select new provider (filter by area + category + availability), reason | Confirmation showing impact on both providers |
| Cancel | Cancels booking, computes refund per cancellation policy | Reason ≥30 chars; preview refund amount; double-confirm |
| Force complete | Marks completed without provider checklist (rare admin override) | Required reason; logged separately as `force_completed` for compliance |

All money actions use `db.transaction` covering: state UPDATE + wallet UPDATEs + audit INSERT (Bug 69/70/71 fix). Failure rolls back all.

**Acceptance:**
- Test 1: Force-release simulated with audit insert failure rolls back wallet movement (Bug 70 fix).
- Test 2: Reassign blocked when no eligible provider in area + category.
- Test 3: Money breakdown matches `bookings.service_price + service_fee + surge_amount = total_amount` exactly to centavo.
- Test 4: Photos viewer shows actual S3-uploaded photos (not local file URIs — Bug 461 fix verification).

---

## 9. DispatchConsolePage.tsx — Real-time ops console

**Route:** `/dispatch`
**RBAC:** `dispatch:view`. Dispatch actions require `dispatch:action`.
**Backend:** `GET /api/v1/admin/dispatch/active`, socket.io `admin:dispatch` room, `POST /admin/bookings/:id/{reassign|cancel|message}`
**Audit findings:** Bug 272 (reassign/cancel/message buttons were window.alert stubs in Phase 10 — must be wired), LAUNCH-LIMITATIONS §1 (reassign dialog provider eligibility not filtered)

**Reassign dialog (Bug 272 + LAUNCH-LIMITATIONS §1 fix):**
- Modal title: "Reassign Booking #BK-1234"
- Filter providers by: same service area as booking, has matching service category, online now, available at booking time, no scheduling conflict.
- Show 5 best candidates with: photo, name, distance from booking, current load (jobs today), avg rating.
- Required reason ≥30 chars.
- Confirmation modal showing impact on both providers.
- Real reassign mutation (not window.alert).

**Cancel dialog:** Bug 272 fix + LAUNCH-LIMITATIONS §2 fix.
- Real-time refund preview computed server-side via `POST /admin/bookings/:id/cancel-preview` showing exact refund amount per cancellation policy (server-side computation, not client-side — Bug 1170 reconciliation).
- Required reason ≥30 chars.
- Double-confirm.

**Message dialog:** real send to customer + provider via in-app message.

**Acceptance:**
- All three dialogs perform real mutations (no `window.alert` stubs — Bug 272 fix).
- Reassign filters by eligibility (LAUNCH-LIMITATIONS §1 fix verified).
- Cancel shows real-time refund preview (LAUNCH-LIMITATIONS §2 fix verified).
- Map updates within 2s of socket event.
- Performs at 60fps with 100 active markers.

---

## 10. CatalogPage.tsx — Service catalog management

**Route:** `/catalog`
**RBAC:** `catalog:view`. Mutations require `catalog:edit` (super_admin only).
**Backend:** `GET /admin/catalog/categories|subcategories|addons`, mutations on each.
**Audit findings:** Bug 237 (catalog mutations missing audit), Bug 251 (cache flush failures silently ignored), Bug 266 (addon price no upper bound).

**Tabs:** Categories | Subcategories | Add-ons.

**Categories tab:** list with toggle is_active, edit name/icon/display_order. Activate/deactivate audit-logged. Lucide icon picker (constrained to allowed icon set).

**Subcategories tab:** list grouped by category. Each row: name, pricing_type (fixed/quote/hourly), base_price, min, max, duration. Edit modal with all fields. Server validates base_price ≥ min ≤ max; client also enforces.

**Add-ons tab:** list grouped by subcategory. Each: name, price, is_required toggle. Bug 266 fix: client validates price ≤ ₱50,000 (anti-typo); server enforces same.

**Acceptance:** all mutations create `admin_actions` row (Bug 237 fix). Cache bust failures surface to user as warning toast (Bug 251 fix). Addon price input has max attribute and shows error if exceeded.

---

## 11. PricingRulesPage.tsx — Surge / rush / holiday rules

**Route:** `/pricing-rules`
**RBAC:** `pricing:view`, mutations `pricing:edit` (super_admin).
**Backend:** `GET|POST|PATCH|DELETE /admin/pricing-rules`
**Audit findings:** Bug 269 (platformSurgeShare not validated 0-1), Bug 268 (no confirmation on delete), Bug 48 (deletePricingRule allows in-use deletion).

**Layout:** list of rules with type (rush/holiday/peak), multiplier, scope (categories + areas), priority, platform_surge_share, status (active/scheduled/expired).

**Add/edit form:** 
- Multiplier input with min=1.0, max=5.0, step=0.05.
- platformSurgeShare 0–1 with input pattern (Bug 269 fix).
- Priority for overlap resolution.
- Scope multi-select.
- Schedule (start, end, recurring days).

**Delete:** warning modal — "This rule was applied to 47 bookings in the last 30 days. Deleting will not affect those past bookings but will stop applying to new ones." Required reason. (Bug 48 fix: server checks usage count and surfaces; prevents deletion if active and applied to in-progress bookings.)

**Preview tool:** "What would this booking cost with current rules?" — input service + datetime + area, server simulates pricing engine and shows breakdown.

**Acceptance:** all validations enforced both client and server. Delete is soft (preserves history) with admin_action audit. Confirmation modals on every mutation (Bug 268 fix).

---

## 12. ServiceAreasPage.tsx — Service-area lifecycle

**Route:** `/service-areas`
**RBAC:** `service_area:view`, mutations `service_area:edit` (super_admin).
**Backend:** `GET|POST|PATCH /admin/service-areas`
**Audit findings:** Bug 320 (centerLat/centerLng not validated to PH bounds), Bug 322 (radiusKm/minProvidersToLaunch no range check), Bug 325 (mutations missing audit).

**Layout:** Two views (toggle): table | map.

**Table view:** columns: name, status (planned/recruiting/soft_launch/active/paused/retired), city, region, provider count, customer count, bookings_today, lifetime bookings.

**Map view:** map with circles for each area (radius_km). Click circle → side panel.

**Add/edit form:**
- Name, slug, city (autocomplete from PH cities — must include Boracay per Bug 706 fix).
- center_lat / center_lng with PH bounds CHECK 4.5–21.5 / 116–127.5 (Bug 320 fix).
- radius_km (1–100, Bug 322 fix).
- min_providers_to_launch (1–50).
- Status transition rules: planned → recruiting → soft_launch → active → paused → retired (one-way except paused↔active).

**Heat map overlays:** provider density, customer demand (toggle).

**Waitlist view:** customers in `area_waitlist` who registered interest.

**Acceptance:** all coords validated against PH bounds (Bug 320 fix). All mutations audit-logged (Bug 325 fix). Boracay present in city autocomplete (Bug 706 fix).

---

## 13. DisputesPage.tsx — Dispute queue

**Route:** `/disputes`
**RBAC:** `dispute:view`. Resolutions require `dispute:resolve`.
**Backend:** `GET /admin/disputes` paginated, socket.io `admin:disputes`.
**Audit findings:** Bug 333 area, Bug 199 (no audit on dispute view).

**Layout:** standard list with **SLA timer column** (auto-color: green <24h, yellow 24-48h, red >48h, flashing red >72h). Sort by priority (amount × age) by default.

**Filters:** status, type, area, age, "stale only", customer, provider, refund amount range.

**Bulk actions:** export only (resolutions happen on detail).

**Acceptance:** SLA timer recomputes every 60s. Stale filter shows `>48h since opened AND status='opened'`.

---

## 14. DisputeDetailPage.tsx — Dispute 360°

**Route:** `/disputes/:id`
**RBAC:** `dispute:resolve`.
**Backend:** Heavy — see audit findings.
**Audit findings:** Bug 83 (adminResolveDispute admin_actions OUTSIDE transaction), Bug 84 (escalateDispute same), Bug 85 (message truncated 500 chars in admin_actions — fix to store full message in separate column).

**Sections:**
- Header: status pill, age, SLA timer (color-coded)
- Booking summary card with link to BookingDetailPage
- Side-by-side customer claim + provider response with photo evidence
- Evidence timeline (chronological, with all GPS + chat + photo timestamps)
- Customer history + Provider history side panels with pattern detection alerts
- Resolution form (super_admin only)
- Admin audit log (this dispute only)

**Resolution flow:**
1. Admin selects outcome (refund customer full / partial / split / release to provider / escalate to NPC / mediated agreement).
2. Decision notes ≥100 chars (Bug 85: full text stored, not truncated).
3. "Preview impact" button shows: "Will refund Maria ₱500. Will pay Juan ₱75. Updates dispute status to resolved_customer."
4. "Resolve" requires typed dispute ID confirmation.
5. Server runs in `db.transaction` covering: dispute UPDATE + booking UPDATE + escrow refund + admin_actions INSERT + customer/provider notifications. Failure rolls back all (Bug 83/84 fix).

**Pattern detection alerts:** customer history shows red flags ("3 disputes in 30 days", "always damages property"). Same for provider.

**Acceptance:**
- Test 1: Resolution failure (e.g., audit insert error) rolls back money movement (Bug 83 fix).
- Test 2: Decision notes stored in full in `admin_actions.full_notes` column (Bug 85 fix).
- Test 3: Preview button accurately predicts money movement.
- Test 4: SLA timer turns red at 48h, flashes red at 72h.
- Test 5: NPC escalation creates referral row + sends email to NPC liaison + sets dispute to escalated state.

---

## 15. FinancialsPage.tsx — Money operations

**Route:** `/financials`
**RBAC:** `finance:view`. Money mutations require `finance:execute` (super_admin).
**Backend:** Many — escrow, payouts, guarantee fund, BIR exports.
**Audit findings:** Bug 117 (consent_records.consent_type lacks CHECK — but financials cross-references this table). PHASE-08 paper-trace re Bug 9 (refundFromEscrow after commit is documented design).

**Tabs (7):** Overview | Escrow | Payouts | Guarantee Fund | Reconciliation | BIR Reports | Receipts.

### 15.1 Overview tab
- Revenue dashboard with charts (daily revenue 30d, by category, by area)
- Top KPIs: today, this week, this month, this quarter
- VAT collected vs paid this month
- Provider payouts pending
- Disputed amounts in escrow (held while resolving)

### 15.2 Escrow tab
- In-flight escrow holds (by booking)
- Aging report (held >24h, >48h, >7d)
- Auto-release queue
- Manual release (super_admin) — same flow as BookingDetailPage release

### 15.3 Payouts tab
- Pending payouts grouped by provider
- Today / this-week / this-month history
- Failed payouts with reasons (also in PayoutsPage)
- Manual trigger payout (super_admin)
- Schedule editor (run frequency: daily / weekly / on-demand)

### 15.4 Guarantee Fund tab
- Balance, allocation rate (1.5% of service fee), monthly trend
- Months runway (vs claims rate)
- Replenishment alert if <3 months
- Claims history (insurance/SiguradoShield Layer 1)

### 15.5 Reconciliation tab
- Daily snapshots (₱ in / ₱ out / discrepancies)
- Discrepancy alerts (>₱100 unexplained delta)
- Bank statement import (CSV)
- PayMongo settlement matching

### 15.6 BIR Reports tab
- Monthly VAT 2550M (downloadable PDF + CSV)
- Quarterly 2307s (per-provider, batched)
- Annual income summary
- Filing calendar with deadlines (lucide `Calendar` icons next to each)

### 15.7 Receipts tab
- Search OR (Official Receipt) by number, customer, date, amount
- Click → view PDF preview, download, email to customer

**Acceptance:**
- All exports include header with onService TIN, RDO, generation timestamp.
- BIR PDFs match BIR template format byte-exact.
- Manual escrow release uses same transaction discipline as BookingDetailPage (Bug 70 fix).

---

## 16. PayoutsPage.tsx — Payout queue

**Route:** `/payouts`
**RBAC:** `payout:view`. Approve requires `payout:approve` (super_admin).
**Backend:** `GET /admin/payouts`, `POST /admin/payouts/:id/{approve|reject|retry}`
**Audit findings:** Bug 309 (approve has no confirmation, no reason capture).

**Layout:** standard list with pending / approved / completed / failed tabs.

**Approve action (Bug 309 fix):**
- Modal: "Approve payout of ₱4,350 to Juan dela Cruz?"
- Required reason field (default "Routine payout — verified" but editable, ≥10 chars).
- Preview: "Will move ₱4,350 from platform wallet to provider wallet, then trigger PayMongo transfer to GCash 0917•••1234."
- "Approve" button.

**Acceptance:**
- All approvals create admin_action row.
- All approvals run in db.transaction covering wallet UPDATE + payout UPDATE + audit INSERT.
- Confirmation modal mandatory.

---

## 17. RecurringPage.tsx — Recurring booking management

**Route:** `/recurring`
**RBAC:** `recurring:view`. Cancel requires `recurring:cancel`.
**Backend:** `GET /admin/recurring`, `POST /admin/recurring/:id/cancel`
**Audit findings:** Bug 315 (cancellation hardcodes reason="Admin cancellation"), Bug 63 (no notification on cancel).

**Layout:** list of recurring bookings with frequency, next instance date, customer, provider, monthly value.

**Cancel action (Bug 315 fix):**
- Modal with required reason ≥20 chars (no hardcoded literal).
- Impact preview: "Will cancel 12 future scheduled bookings, affecting Maria Santos (customer) and Juan dela Cruz (provider). Estimated lost revenue: ₱6,000/month."
- Notifies both parties (Bug 63 fix).
- Audit logs full reason in `admin_actions.full_notes`.

**Acceptance:** Cancellation modal blocks until reason ≥20 chars. Notifications sent to customer + provider. Audit row created with full reason.

---

## 18. BusinessAccountsPage.tsx — B2B accounts

**Route:** `/business`
**RBAC:** `business:view`. Mutations require `business:edit`.
**Backend:** `GET|POST /admin/business`
**Audit findings:** Bug 403 (suspend hardcodes "Admin action"), Bug 105 (removeMember hard delete with no audit), Bug 106 (owner_user_id can drift from members.role='owner').

**Layout:** list of business accounts with: company name, status, monthly_credit_limit, contracts count, members count, total_invoiced.

**Detail page (sub-route `/business/:id`):**
- Tabs: Profile | Contracts | Members | Invoices | Activity.
- Members tab: add/remove (Bug 105 fix: soft delete with audit). Owner change requires migration of `owner_user_id` AND `members.role='owner'` in single transaction (Bug 106 fix).
- Suspend action (Bug 403 fix): required reason ≥20 chars.

**Acceptance:** all suspend/cancel actions audit reason ≥20 chars. Member changes use db.transaction.

---

## 19. AnalyticsPage.tsx — Custom analytics

**Route:** `/analytics`
**RBAC:** `analytics:view`.
**Backend:** `GET /admin/analytics/{revenue|funnel|cohort|abtest|churn}`
**Audit findings:** Bug 286 (A/B Tests tab fully wired but Bug 45 unwired in mobile — variantA.users always 0). Bug 287 (churn analytics shows full phone numbers — must mask).

**Tabs (5):** Revenue | Funnel | Cohorts | A/B Tests | Churn.

**A/B Tests:** **Disable this tab until Bug 45 is fixed** (mobile-side variant assignment exists). Show banner: "A/B test framework is not yet wired into the mobile app. This dashboard will be active once Phase X completes." Per Phase 14 dispatch decision: either wire variant assignment or move tab to LAUNCH-LIMITATIONS.

**Churn tab:** customer list with churn risk score. PII masked (Bug 287 fix). Click customer → detail page.

**Acceptance:** A/B tab gated behind backend variant assignment existing. Churn data PII masked. All exports CSV/Excel work.

---

## 20. MarketingPage.tsx — Promo + campaigns

**Route:** `/marketing`
**RBAC:** `marketing:view`. Mutations require `marketing:edit`.
**Backend:** `GET|POST /admin/marketing/promos|campaigns|notifications`
**Audit findings:** Bug 44 (promo codes never redeemed in mobile), Bug 260 (admin promo CRUD wired but Bug 44 unwired), Bug 376 (promo hard delete), Bug 261 (createPromoCode no client validation).

**Phase 14 decision required:** wire mobile redemption (dispatch 04 or later) OR mark feature as LAUNCH-LIMITATIONS §X. Until decision, promo creation page shows banner: "Promo code redemption is not yet wired in the mobile app. Codes can be created but customers cannot use them."

**Tabs:** Promo codes | Email campaigns | Push campaigns | SMS campaigns | Referrals.

**Promo codes:** standard CRUD with soft delete (Bug 376 fix). Validation client+server (Bug 261 fix).

**Campaigns:** template selection, audience filter, schedule, A/B testing if available, send-now / send-scheduled.

**Acceptance:** all CRUD audit-logged. Soft delete preserves history. Client validates discountValue ≤100% (Bug 261 fix).

---

## 21. NotificationTemplatesPage.tsx — Notification CMS

**Route:** `/templates`
**RBAC:** `template:view`. Mutations require `template:edit`.
**Backend:** `GET|POST|PATCH /admin/notification-templates`
**Audit findings:** Bug 392 (templates hard delete), Bug 735 (template body's variables not validated against variables array).

**Layout:** list of templates by category (transactional, marketing, system). Each template: name, channels (sms/push/email/in-app), preview.

**Edit form:**
- Name, channels, body (with handlebars `{{name}}` syntax).
- Variables list (declared) — server validates body's `{{vars}}` ⊆ declared variables (Bug 735 fix).
- Live preview with sample data.
- Send-test action (sends to admin's own contact info).

**Soft delete (Bug 392 fix):** archive instead of delete; preserves history of past notifications using this template.

**Acceptance:** body variable validation server-side. Send-test produces actual notification. Soft delete reversible from "Archived" filter.

---

## 22. CompliancePage.tsx — DSR + NPC compliance

**Route:** `/compliance`
**RBAC:** `compliance:view` (DPO role only).
**Backend:** `GET /admin/compliance/{dsr|consent|breaches|npc-referrals}`, mutations on each.
**Audit findings:** Bug 153 (DSR actions consolidated into 4 endpoints — RESOLVED), Bug 397/398 (DSR rejection/escalation accept empty reason — fix client+server), Bug 401 (audit log CSV export doesn't audit itself), Bug 402 (searchConsent accessible to all admins — must be DPO-only).

**Tabs:** DSR Queue | Consent Versions | Breach Log | NPC Referrals.

### DSR Queue
- Pending requests with: customer ID, type (access/correction/erasure/portability/objection), submitted date, days remaining (15-day SLA), assigned DPO.
- Filter: type, status, days remaining bucket.
- Actions per request: Mark complete, Request more info, Reject (Bug 397 fix: reason ≥30 chars), Escalate to NPC (Bug 398 fix: reason ≥30 chars + NPC reference).

### Consent Versions
- See ConsentVersionsPage (separate page). Cross-link.

### Breach Log
- Each breach: type, scope, dates (occurred / discovered / NPC notified — must be ≤72h), affected users count, status. Per RA 10173.

### NPC Referrals
- Disputes / DSRs escalated to NPC. Each: NPC case number, our reference, status, last update.

**Acceptance:**
- Bug 402 fix: page entirely gated behind `compliance:view` permission AND DPO role tag. Other admins see 403.
- Bug 397/398 fix: reject/escalate actions block until reason ≥30 chars.
- Bug 401 fix: CSV export action creates `admin_actions` row with `action_type='compliance_audit_export'`.
- 72h breach notification timer prominent for any breach <72h old.

---

## 23. DataProtectionLogPage.tsx — DPO actions log

**Route:** `/data-protection`
**RBAC:** `compliance:view` (DPO).
**Backend:** `GET /admin/data-protection-log`
**Audit findings:** Bug 153 (action types — RESOLVED).

**Layout:** read-only log of every DPO action. Filters: actor, action type, date range, customer, type.

**Each row:** timestamp, actor (DPO admin), customer (masked), action type (request_completed / info_requested / rejected / escalated_to_npc), reason, NPC reference if any.

**Export:** CSV download (audit-logged via admin_actions per Bug 401 fix).

**Acceptance:** read-only enforced (no edit/delete). All exports audit-logged. PII masked except in detail-view modal (which itself audit-logs reveal).

---

## 24. ConsentVersionsPage.tsx — Privacy policy / ToS versioning

**Route:** `/consent-versions`
**RBAC:** `compliance:view`. Publish requires `compliance:publish` (super_admin + DPO).
**Backend:** `GET|POST /admin/consent-versions`
**Audit findings:** Existing 30-char minimum publish summary (good). Bug 117 (consent_records.consent_type lacks CHECK).

**Layout:** tabs for Current (active) | History | Drafts.

Each version: type (privacy_policy / terms_of_service / marketing_consent), version number, effective date, change summary (≥30 chars), full text (Markdown editor), publish action.

**Publish action:**
- Confirmation modal showing diff vs previous version.
- Required acknowledgment: "This will require all existing users to re-consent within 30 days."
- Server creates new consent_records entries with `acknowledged=false` for all active users.
- Email + push notification to all users.

**Acceptance:** publishing creates re-consent requirement for all users. Diff viewer shows side-by-side text comparison.

---

## 25. AuditLogPage.tsx — System-wide audit log

**Route:** `/audit-log`
**RBAC:** `audit:view` (super_admin only).
**Backend:** `GET /admin/audit-log`
**Audit findings:** Bug 66 (raw PII to admin browser), Bug 68 (no rate limit on audit log endpoint), Bug 311 (raw UUID in entity_id column — link to entity), Bug 332/337/338 (no date/user filter — fix), Bug 401 (export doesn't audit itself).

**Layout:** standard list with: timestamp, actor, action_type, target_type, target_id (linked to entity page — Bug 311 fix), reason (truncated), details (expandable JSON viewer).

**Filters:** actor (autocomplete admin users), action_type (multi-select from enum), target_type, target_id, date range, free-text search in reason. (Bug 332/337/338 fix.)

**Export:** CSV with full details. Audit-logged (Bug 401 fix).

**PII masking:** Bug 66 fix — IPs (`x.x.x.123`), user-agents simplified ("Chrome on macOS"), no raw phone/email in main view; reveal via 👁 icon (audit-logged).

**Rate limit (Bug 68 fix):** server-side 60 requests/min per admin user.

**Acceptance:**
- Test 1: PII masked in main view; reveals audit-logged.
- Test 2: target_id links to entity detail page (e.g., booking_id → BookingDetailPage).
- Test 3: All filters URL-encoded for shareability.
- Test 4: CSV export creates self-audit row.
- Test 5: 100 RPS sustained traffic returns 429 after rate limit hit.

---

## 26. SupportTicketsPage.tsx — Customer support queue

**Route:** `/support-tickets`
**RBAC:** `support:view`. Internal note actions require `support:internal_notes`.
**Backend:** `GET|POST /admin/support-tickets`
**Audit findings:** Bug 116 (getTicketMessages includeInternal default TRUE — flip to FALSE), Bug 113 (createTicket no admin notification), Bug 115 (closed without notes allowed — require notes).

**Layout:** list with status (open / pending_customer / pending_internal / closed), priority, age, assignee.

**Detail (sub-route `/support-tickets/:id`):**
- Customer message thread (public)
- Internal note thread (yellow background, admin-only)
- Reply form with toggle: "Public reply" or "Internal note" (Bug 116 fix: default Public).
- Status change requires resolution notes when moving to closed (Bug 115 fix).
- Assignee dropdown.
- Customer info sidebar.

**Acceptance:**
- Closing a ticket blocks until resolution notes ≥20 chars.
- Public/internal toggle defaults to Public (Bug 116 fix).
- New ticket creation triggers admin notification (Bug 113 fix).

---

## 27. StaffRolesPage.tsx — Staff & RBAC

**Route:** `/staff`
**RBAC:** `staff:view`. Mutations require `staff:edit` (super_admin).
**Backend:** `GET|POST /admin/staff`, `GET|POST /admin/roles`
**Audit findings:** Bug 127 (admin role hard delete — soft delete + audit), Bug 357/358/360 (TOTP setup secret leak risk).

**Tabs:** Staff (admin users) | Roles (5 from migration 047) | Permissions matrix.

### Staff tab
- List of admin users with: name, email (masked), role, last_login, 2FA enrolled, status.
- Add staff: name, email, initial role, send invite email with reset link.
- Reset 2FA action (super_admin only): clears TOTP, forces re-enrollment on next login. Audit-logged.
- Suspend/reactivate. Required reason ≥20 chars.

### Roles tab
- 5 roles: super_admin, admin, dpo, finance, support, dispatcher.
- Each role: name, description, permission count.
- Edit permissions: matrix view (rows = permissions, columns = roles, checkboxes).
- Soft delete (Bug 127 fix) — deactivate role; existing users with that role get `staff:reassign` warning.

### Permissions matrix
- Read-only view of which role has which permission.
- Used by sidebar filtering (Bug 1270 fix).

**TOTP setup security (Bug 357/358/360 fix):**
- During first-time setup, secret displayed in copy-to-clipboard input (not plain `<code>` — clears clipboard after 30s).
- otpauth URI shown only as QR code, not text.
- Generates 8 backup codes during enrollment, shows once for save, never re-shown.

**Acceptance:**
- TOTP setup never shows plain text secret in DOM.
- Backup codes generated during enrollment.
- Role deletion is soft (Bug 127 fix).
- Sidebar permissions correctly applied per role.

---

## 28. SystemSettingsPage.tsx — Runtime config

**Route:** `/settings`
**RBAC:** `settings:view`. Mutations require `settings:edit` (super_admin).
**Backend:** `GET|PATCH /admin/settings`
**Audit findings:** Bug 26 (UPDATE setting + audit OUTSIDE transaction), Bug 27 (bustCache failures silently ignored — surface as warning), Bug 251 (cache flush failures silently ignored — same).

**Layout:** categorized accordion with all platform settings.

**Categories:**
- **Commissions:** rates per tier (founding 10%, new 15%, verified 13%, pro 11%, elite 9%) — currently founding missing in code (Bug 1323). This page is where founding is added in Dispatch 02.
- **Service fees:** rate, min, max
- **Cancellation policy:** 7-tier schedule (single source of truth per Bug 1170 fix — terms.tsx generates from this).
- **Escrow:** dispute window hours (48h), auto-release delay
- **OTP:** length, lifetime, lockout thresholds
- **Withdrawal:** minimum amount, frequency limits
- **Surge:** max multiplier, platform share %
- **Brand colors:** read-only mirror of tokens.json (display only — actual edit in tokens.json)
- **Feature flags:** SiguradoShield Layer 2 wired (currently false), promo codes (currently false), A/B testing (currently false), Boracay (currently true), Kalibo (false), Iloilo (false).

**Each setting row:**
- Label, current value, "customized" badge if differs from default, history (last 5 changes), reset to default action.
- Edit modal: required reason ≥20 chars, preview impact, save.

**Audit (Bug 26 fix):** UPDATE + audit insert in single db.transaction.

**Cache bust feedback (Bug 27/251 fix):** if cache flush fails, show warning toast: "Setting saved but cache flush failed. Changes may take up to 60s to propagate." Error sent to Sentry.

**Acceptance:**
- All settings changes audit-logged.
- Setting transactions atomic (Bug 26 fix).
- Cache flush failures visible to admin (Bug 27 fix).
- Founding tier (10%) settable here once Dispatch 02 lands.

---

# Cross-cutting acceptance for the admin

These apply to the entire admin app:

1. **No emoji as iconography anywhere.** Constitution Article 4.6. Every icon is lucide via `@/components/icons`. Verified by `verify-no-emoji.sh` extended to scan admin/src.
2. **Every screen renders correctly at 1920, 1440, 1280, 768 viewport widths.** Verified by Playwright screenshots in Gate D.
3. **Every list paginates** (default 50/page, configurable 20/50/100/200).
4. **Every mutation creates `admin_actions` audit row** in same transaction. Verified by Gate B.
5. **Every PII display is masked by default** with explicit reveal action that's audit-logged.
6. **Every confirmation modal blocks on required reason fields** (≥20 chars unless specified higher).
7. **Every page has loading / empty / error / success states** with concrete copy and lucide illustrations.
8. **Every page handles auth expiry gracefully** — silent token refresh, redirect to login if refresh fails, preserves URL for post-login redirect.
9. **Console is empty during normal operation.** No warnings, no errors, no Sentry events from admin sessions.
10. **All keyboard navigation works.** Tab order matches visual, escape closes modals, enter submits forms when focus is on submit button only.

---

# What's next: Part 2B (mobile customer screens) and Part 2C (mobile provider screens)

This catalog covered the 28 admin pages. When Ken says "continue," I'll deliver:

- **Part 2B** — Mobile customer screens (~50 screens including: auth, onboarding, 4 tabs, search, booking flow 12 screens, recurring, address management, payment methods, account, chat, support, terms, privacy, safety, suki, referral)
- **Part 2C** — Mobile provider screens (~40 screens including: provider onboarding 10 screens, 4 tabs, job execution flow 6 screens, schedule + availability, services, skills, certifications, portfolio, payouts, withdraw, suki-customers, tier-progression, navigate, reviews)

Each follows the same template as this admin catalog: route, RBAC (or auth requirement for mobile), backend endpoints, audit findings, layout wireframe, fields/components, every action's behavior, four required states, acceptance criteria.

After Parts 2B and 2C, Part 3 is the bug remediation manual (every one of the 1,371 bugs with file:line + exact fix + test signature).
