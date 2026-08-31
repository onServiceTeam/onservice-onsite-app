# ADMIN-SPEC — The Commercial-Grade Admin Panel

This document describes what each admin module must contain to be considered "commercial-grade" — comparable to ServiceTitan, Jobber, or Housecall Pro. Phases 04 through 12 build to this spec.

---

## Module 0 — Layout (foundational, exists)

`apps/admin/src/components/AdminLayout.tsx` is the shell. It wraps every page with sidebar, header, and content area.

**Header (top bar):**
- Logo on left
- Search (`Cmd+K`, `Ctrl+K`, or `/`) preserves page destinations and adds bounded server-backed customers, providers, bookings, support tickets, disputes, and payouts. Result contact is masked, each result opens its canonical workspace, and DPO search remains page-only pending the E34 access decision.
- Date/time in Asia/Manila
- Active environment badge (production / staging / development)
- Notification bell with badge count
- User avatar + dropdown (profile, settings, logout)

**Sidebar (left rail):**
- Dashboard, Providers, Customers, Bookings, Catalog, Pricing Rules, Disputes, Financials, Payouts, Templates, Recurring, Business, Service Areas, Analytics, Audit Log, Support, Staff & Roles, Settings, Marketing (new in P09e), Compliance (new in P11), Dispatch (new in P10)
- Each item: lucide icon + label
- Active state: blue background, blue accent bar on left
- Collapsed mode toggle (icon-only)

**Content area:**
- Fluid width, max 1600px
- Default padding 24px
- Page title + breadcrumbs at top of each page
- Sticky filter bar on list pages
- Standard empty states, loading states, error states

## Module 1 — Dashboard (Phase 04)

See `phases/PHASE-04-admin-dashboard.md` for full layout. Key requirements:
- Date range selector affects all widgets
- 60s auto-refresh
- 8 KPI cards with lucide icons
- 3 charts (Revenue Trend, Booking Volume, Acquisition Funnel)
- Operational alerts feed
- Quick actions panel
- 3 wallet cards
- One tile per active service area
- Real-time updates via socket.io (Phase 10)

## Module 2 — Providers (List + 360, Phase 05)

**List view (existing, enhanced):**
- Table columns: photo, name, business name, phone (click-to-call), email, status badge, tier badge, rating, total jobs, area, last active, profile completion %
- Filters: status, tier, area, category, rating range, has-active-NBI, joined date range
- Saved filters per admin user (saved in user prefs)
- Search by: name, phone, email, NBI number, tax ID
- Bulk actions: approve, reject, suspend, send message, export
- Column show/hide toggle
- CSV/Excel export
- Map view tab (toggle from table)

**Detail view (new in Phase 05):** 7 tabs
- Profile / Jobs / Financials / Reviews / Disputes / Activity Log / Notes
- All actions audited
- Manual wallet adjust (super admin only)
- Document request flow (re-NBI etc)

## Module 3 — Customers (List + 360, Phase 06)

**List view (existing, enhanced):** similar pattern to providers
**Detail view (new in Phase 06):** 6 tabs
- Profile / Bookings / Payments / Disputes / Referrals / Activity
- Manual wallet credit (audited)
- Manual refund (super admin)
- Suspend with reason

## Module 4 — Bookings (List + 360, Phase 07)

**List view (existing):**
- Standard table
- **Add:** real-time status badges (Phase 10)
- **Add:** "Active right now" filter
- **Add:** map view tab (every active booking as pin)

**Detail view (new in Phase 07):**
- Header with status pill, money summary, quick actions
- Parties column: customer + provider summaries
- Timeline column: every event
- Evidence column: photos, chat, GPS log
- Money breakdown card
- Admin audit trail at bottom
- Manual escrow release / refund / reassign / cancel (super admin)

## Module 5 — Disputes (List + Detail, Phase 07)

**List view (existing, enhanced):**
- SLA timer column (auto-color: green <24h, yellow 24-48h, red >48h)
- Sort by priority (amount × age)
- Bulk filter: stale only

**Detail view (new in Phase 07):**
- Side-by-side customer claim + provider response
- Evidence timeline
- Customer + provider history with pattern detection
- Resolution form: 6 outcome options, reason required, internal notes
- Confirm modal showing money movement before resolve
- Paired audit evidence for the supported resolution, escalation, reopen, and participant-message actions; E37 tracks incomplete global mutation coverage

## Module 6 — Service Catalog (Phase 09e refines)

Existing `CatalogPage.tsx` (644 lines) — verify and extend:
- Add/edit/disable service categories
- Add/edit/disable subcategories with full pricing model (fixed/quote/hourly)
- Per-category icon assignment (from approved icon list)
- Per-area pricing overrides
- Per-tier pricing overrides
- Bulk import via CSV
- Preview as customer would see it

## Module 7 — Pricing Rules (existing, 624 lines)

- Rush, holiday, peak-hours rule types
- Multiplier 1.0-5.0
- Category and area scoping
- Platform surge share configurable
- Preview tool: "What would this booking cost with current rules?"
- Rule priority and overlap resolution

## Module 8 — Service Areas (existing, enhanced in P09e/P11)

**Add:**
- Map view tab (Mapbox/Leaflet)
- Drag-to-resize radius
- Provider density heat map
- Customer demand heat map (booking pins)
- Waitlist view per area

## Module 9 — Financials (Phase 08 deep rebuild)

7 tabs:
- Overview (revenue dashboard with charts)
- Escrow (in-flight, aging, auto-release queue)
- Payouts (pending, completed, failed, manual trigger, schedule editor)
- Guarantee Fund (balance, runway, replenishment alert)
- Reconciliation (daily snapshots, discrepancy alerts)
- BIR Reports (Monthly VAT, Quarterly 2307s, Annual)
- Receipts (search OR by number/customer/date)

Every report is downloadable as PDF or CSV.

## Module 10 — Payouts (existing, 289 lines)

- Pending payouts table
- Today's, this-week, all-time payout history
- Failed with reasons
- Manual trigger per provider
- Bulk batch payout
- Payout schedule editor

## Module 11 — Notification Templates (existing, 390 lines)

- Templates per event type × channel (SMS, push, email, in-app)
- Variable interpolation editor
- Preview with sample data
- Send test message
- Versioning (track template changes)

## Module 12 — Recurring (existing, 219 lines)

- All recurring booking schedules
- Per-customer view: their active subscriptions
- Failed-charge handling
- Schedule editor (admin can pause/resume on customer's behalf)

## Module 13 — Business Accounts (existing, 238 lines)

- B2B accounts list
- Account detail: parent company, multi-property, authorized users, billing terms (Net-7/15/30)
- Recurring contract templates
- Monthly consolidated invoicing
- Per-account special pricing

## Module 14 — Analytics (implemented boundary and roadmap)

Implemented today:

- Manila-month customer cohort booking activity and recorded gross booking face value, with explicit source/freshness/decision boundaries.
- Active-customer retention attention signals with Customer 360 linkage. This is a deterministic index, not churn prediction.
- Read-only legacy provider quality snapshots with every stored component, period, calculated time, pagination, and Provider 360 linkage. E47 blocks recomputation until the approved score model is reconciled.
- Read-only provider-tier commission evidence using the current configured rate and 90-day operational samples. E48 prohibits automated rate advice or writes from this module.
- A/B controls remain hidden while assignment and exposure reporting are held.

Roadmap, not current capability: repeat-booking windows, provider activation
funnel, category/city trends, channel LTV/CAC, and NPS reporting. Marketing and
Dashboard may expose adjacent data, but those pages do not make these Analytics
reports implemented.

## Module 15 — Audit Log (existing 250 lines + Phase 11 depth)

- Searchable by admin user, entity type, entity ID, action type, date range
- Diff viewer (before/after JSON, syntax highlighted)
- Filter by sensitivity (financial > security > config > general)
- CSV export (5-year retention)
- Hash-chain integrity verification (Phase 11 adds)

## Module 16 — Staff & Roles (existing, 442 lines)

- 8 standard roles per `STRATEGY.md`
- Per-role permission matrix (which routes / actions / approval limits)
- TOTP MFA mandatory for SA + Finance
- Role-scoped views (city scope)
- Activity feed per staff member
- Last login, IP, suspicious activity flags

## Module 17 — Support Tickets (existing, 401 lines)

- Triage view (open tickets sorted by SLA breach risk)
- Ticket detail with full conversation thread
- Assign to staff member
- Internal notes
- Linked entities (booking, customer, provider, dispute)
- SLA timer per ticket type
- Macro responses for common questions

## Module 18 — System Settings (Phase 03 rebuild)

Per `RUNTIME-CONFIG-SYSTEM-SPEC.md`:
- Categorized settings (Commissions, Fees, Escrow, Cancellation, Auth, Provider, Security, Cache)
- Inline edit with validation
- Reset to default
- Audit history per setting
- Force cache flush
- Recent changes feed

## Module 19 — Dispatch Console (NEW, Phase 10)

Real-time view of every active booking with provider locations on a map. See `phases/PHASE-10-11-12.md` for full layout.

## Module 20 — Marketing Dashboard (NEW, Phase 09e)

- Promo code CRUD with redemption tracking
- Campaign tracker per channel (FB ads, billboards, kiosks, influencers)
- CPA by channel
- LTV:CAC ratios
- A/B test results

## Module 21 — Compliance Center (NEW, Phase 11)

- Compliance control center for open holds, evidence boundaries, and links to
  canonical operational workspaces
- DSR queue in the segregated Data Protection Log, using the stored 15-day
  date as an internal response target while E40 remains open
- Consent log search
- DPO action log
- Consent version manager
- Held BIR workpaper link; no authoritative filing calendar or document
  issuance while E22 remains open

---

## Cross-cutting requirements (every module)

### Real-time refresh
Every list and dashboard updates without manual refresh:
- Dashboard alerts: socket.io push
- Booking status changes: socket.io push to BookingsPage and DispatchConsolePage
- New disputes: push to DisputesPage
- Provider online/offline: push to relevant views

### Export
Every table view supports:
- CSV export (with current filters applied)
- Excel export
- PDF report export (formatted)

### Bulk actions
Every list view supports multi-select with:
- Bulk approve/reject
- Bulk message
- Bulk status change (where appropriate)
- Bulk export

### Filtering
Every list view has:
- Standard filters (status, date range, etc per entity)
- Saved filters per admin user
- Quick search by ID
- Reset filters button

### Pagination
- Standard 25/50/100 per page
- Cursor-based for tables >10K rows

### Audit trail
Target contract: every privileged state-changing action must be attributable through `audit_log`, `admin_actions`, or a canonical domain event. Current coverage is partial under E37 and must not be described as a global request or mutation trail. Recorded evidence should include:
- Actor (admin user ID)
- Entity (table + ID)
- Action (verb)
- Before / After (JSON)
- Reason (free text where collected)
- Timestamp, IP, user agent

### Permissions
Every admin endpoint enforces RBAC at the API layer:
- Read permissions per role
- Write permissions per role
- Approval limits per role (e.g., CS Agent can issue ≤₱500 credit, super admin unlimited)
- Per-city scope for ops managers

### Empty / Loading / Error states
Every page handles all four states:
- Initial load: skeleton with right shape
- Loaded with data: rendered table/cards
- Loaded empty: empty state with illustration + CTA
- Error: clear message + retry button
