# 11. Admin System Training Manual

Purpose: teach a new office staff member how to log in to the onService admin app, understand what their role can and cannot do, run the day-to-day tasks on each admin page, and pass a competency check before getting full access.

This doc is the page-by-page guide. For the deeper SOPs behind the work (recruiting, vetting, support, dispatch, disputes, money), see the sibling docs:

- `04-provider-vetting-and-filtering.md` - the vetting scorecard and tiering rules behind the Approve/Reject buttons.
- `06-customer-support-sop.md` and `07-provider-support-sop.md` - support triage, SLAs, scenarios.
- `08-dispatch-and-live-operations.md` - how dispatch works and the no-provider playbook.
- `09-trust-safety-and-disputes.md` - the dispute decision tree and refund logic.
- `10-money-and-compliance-ops.md` - escrow, payouts, commission math, PayMongo, BIR, NPC.
- `13-policies-codes-and-templates.md` - the copy-paste templates referenced here.

The admin app lives at https://admin.onservice.ph. It is a browser app (works in Chrome on a laptop). All money is handled in centavos under the hood and shown to you in pesos (₱). Times show in Asia/Manila.

Support hours for the team using this manual are Monday to Saturday, 8:00 AM to 6:00 PM PHT. Sunday is closed at launch; urgent safety issues still escalate through the on-call path.

---

## 1. Login and access

### How to log in

1. Open https://admin.onservice.ph.
2. Enter your admin email and password.
3. Enter your 6-digit code from your authenticator app (TOTP 2FA). 2FA is mandatory for every admin account. If you have never set it up, the app shows a QR code and a manual secret on first login. Scan it with Google Authenticator or Authy, then enter the code.
4. You land on the Dashboard.

Only three account roles can enter the admin app at all: `super_admin`, `admin`, and `dpo`. Any other account gets "Access denied. Admin privileges required."

If the app sends you straight to a "Change Password" screen, your password was flagged for forced rotation. Set a new one before you can do anything else.

> **Set (editable):** Super-admin accounts are Ken plus one Operations Lead only. Everyone else is `admin`, a support-agent-style limited login, or `dpo`. Keep the super_admin count low because those accounts can move money. _Recommended default. To change it, edit here and anywhere this value is referenced._

### The role map (read this before you touch anything)

There are two role systems in the codebase and they do not line up. Here is the honest version.

What actually controls what you can click is your single account role on the `users` row. In practice that means two real tiers:

| Your account role | What you can do |
|---|---|
| `super_admin` | All currently enabled money and destructive actions: escrow release/refund, booking force-complete/cancel/reassign, dispute resolve/escalate/reopen, payout internal-review decisions and approve/reject/complete, provider wallet adjust, reconciliation run, settings edit/reset, staff and roles management, cancellation-policy edit, service-area set-default, delete notification templates. BIR issuance/finalization remains disabled for every role under E22. |
| `admin` | Read and operational access. You can view every page and do non-money operational work such as provider vetting and support case handling. Catalog publishing is read-only because the API reserves category, service, pricing, add-on, and intake-field changes for `super_admin`. On money, destructive, and catalog-publishing surfaces you see a read-only banner. |
| `dpo` | Admin-tier, plus the compliance powers: search consent records and handle Data Subject Requests under the Data Privacy Act. This is a real, separate role required by NPC rules, not a nickname for super_admin. |

There is also a second, finer permission system in the database (`admin_roles` / `admin_staff`) that seeds named roles: `super_admin`, `admin`, `support_agent`, `finance`, `moderator`, plus a permission vocabulary like `bookings.view`, `payouts.manage`, `disputes.manage`. Useful to know:

- `support_agent` - dashboard, customers (view), bookings (view), support tickets (view + manage).
- `finance` - dashboard, financials, payouts (view + manage), analytics, audit.
- `moderator` - dashboard, disputes (view + manage), customers (view), providers (view).

Those finer named roles function today as organizational metadata for how we describe a person's job. They do NOT by themselves grant or block API access, because the live gate reads the single `users.role` value. So when this manual says "super_admin only," it means the single account role, not the named DB role. Giving someone the `finance` named role does not let them approve payouts unless their account role is `super_admin`.

> **Set (editable):** Live money actions remain gated to the single `super_admin` account role. Do not treat the named `finance` metadata role as authority until the fine-grained authorization architecture is explicitly approved and implemented. Support agents use an `admin` account and cannot reach payout, refund, escrow-release, reconciliation, or settings mutation controls. _Recommended default. To change it, edit here and anywhere this value is referenced._

Bottom line for a new admin: if a button is greyed out or you see a "requires a super-admin account" banner, that is expected. Ask a super_admin to do that step, or escalate per the SOP.

---

## 2. Page-by-page guide (35 routed page components)

The left sidebar lists the pages in this order. The version label at the bottom is build-derived; do not use a version hardcoded in this manual to identify a live deployment. For each page below: what it is for, the common tasks, and a short how-to.

### 2.1 Dashboard (`/`)

Platform overview and the start of every shift. Pick a date range (Today / 7d / 30d / 90d / YTD). It auto-refreshes every 60 seconds.

KPI cards: Revenue, Active Bookings, Pending Disputes, New Signups, Provider Approvals, Today's Bookings, Escalated Disputes, Stale Disputes (48h+). Charts: revenue trend, booking volume, acquisition funnel. There is an Operational Alerts list (including overdue/near-due DSR rows), Quick Actions to jump to pending providers/disputes/financials/audit, three platform wallet cards (Escrow, Revenue, Guarantee Fund with a runway warning), and a cities grid.

How to start a shift:
1. Set the range to Today.
2. Read Pending Disputes, Stale Disputes, and Provider Approvals first. These are the things waiting on a human.
3. Glance at the Guarantee Fund card. If it shows a replenishment warning, flag it to a super_admin.
4. Click a Quick Action to go where the work is.

### 2.2 Providers (`/providers`)

The provider list. Search by business name / phone / email. Filter by status (`pending`, `approved`, `rejected`, `suspended`, `deactivated`) and tier (`founding`, `new`, `verified`, `pro`, `elite`).

Row actions depend on status: a pending provider shows Approve / Reject; an approved one shows Suspend; a suspended one shows Reactivate; Change Tier is available in any state. Status badges: green = approved, amber = pending, red = rejected/suspended/deactivated.

How to approve a provider:
1. Open the provider's detail page first (click the row). Do not approve from the list without reviewing the documents.
2. Confirm the three required documents are present and readable: NBI clearance, government ID front, selfie. The system refuses approval and lists what is missing if any are absent.
3. Back on the list (or from detail), click Approve.
4. The provider flips `pending` to `approved`, gets an "Account Approved" notification, and the action is written to the audit log.

How to reject a provider:
1. Click Reject on a pending provider.
2. Type a reason of at least 10 characters. The provider sees this reason, so write it plainly (for example, "NBI clearance image is blurry and unreadable, please re-upload").
3. The provider flips to `rejected` and gets an "Application Declined" notice with your reason.

How to suspend a provider (use carefully):
1. Click Suspend on an approved provider, give a reason (at least 10 chars).
2. The provider is removed from dispatch immediately. Any in-flight jobs are flagged so escrow will not pay out until a super_admin resolves them. Reactivate restores them to `approved`.

There is no "delete provider" button. Removal from operation is done by Suspend or the `deactivated` status. See `04-provider-vetting-and-filtering.md` for the full vetting scorecard and tier rules.

Provider tiers and commission (for reference while changing tiers):

| Tier | Commission | Requirements (auto-eligibility signal) |
|---|---|---|
| `founding` | 10% | Invite-only launch batch. Parallel tier, not a step in the ladder. |
| `new` | 15% | Default on signup. |
| `verified` | 13% | 5+ jobs, 4.0+ rating. |
| `pro` | 11% | 25+ jobs, 4.5+ rating, no open disputes. |
| `elite` | 9% | 100+ jobs, 4.7+ rating, TESDA-verified cert, no open disputes. |

Tier promotion is NOT automatic. A super_admin changes a tier with Change Tier (reason at least 10 chars).

### 2.3 Provider detail / Provider 360 (`/providers/:id`)

Everything about one provider, in 8 tabs:

- Profile - KYC documents (NBI with expiry, gov ID front/back, selfie, avatar), selected subcategory services with canonical catalog customer pricing, service areas, account info. Historical provider-entered prices are not an active booking source under E16 containment. KYC images load through an admin-only proxy, so you see them but raw file links are never exposed.
- Jobs - that provider's bookings with status, totals, fees, ratings, dispute flags.
- Financials - total earned, commission paid, wallet balances, recent payouts. Super_admin can Adjust Wallet (writes an audited ledger entry, reason at least 5 chars).
- Reviews - show/hide individual reviews.
- Staff - the provider's team members. Approve / Send back / Reject (with reason) the ones in `pending_review`; suspend or reactivate approved ones.
- Disputes - disputes involving this provider.
- Activity - audit trail plus login history (IP and user-agent are masked for junior admins).
- Notes - internal notes by category (general/quality/financial/legal), pin or delete. The provider never sees these.

How to read a KYC document during vetting: open Profile, click the NBI / ID / selfie thumbnail. It opens through the secure proxy. Check the name matches across all three, the NBI is recent (issued within the last 6 months), and the selfie is the same person as the ID.

### 2.4 Customers (`/customers`)

The customer operations queue. Search by full name, phone, email, or customer ID. Filter account state as `active` or **Inactive (includes suspended)**. Fraud review is a separate signal, not an account status.

The cards at the top describe the whole matching queue, not just the visible page: total customers, active accounts, inactive accounts, and accounts flagged for fraud review. The default sort puts support attention first. Other sorts prioritize active bookings, completed gross booking value, or newest accounts. Each row shows active and lifetime bookings, open support cases, and open/all booking-linked disputes.

Ordinary admins see masked phone and email values in this queue. Open Customer 360 and use its audited reveal control only when the complete value is needed for support. A super-admin may see the raw queue value under the existing role policy.

How to work from the queue:
1. Start with **Support attention** and the fraud-review badge, open-support count, open-dispute count, and active-booking count. Account state and risk are independent, so an active customer may still require fraud review.
2. Open the customer name for Customer 360. Use **Bookings** to open the booking queue searched by that customer ID, or **Support** to open the support queue prefilled for that person.
3. Treat **Completed gross value** as completed booking value before refund or payment reconciliation. Use Customer 360 Payments and the booking Money record for gateway, wallet, refund, or net-value questions.
4. The list is read-only. Account suspension, fraud review, and wallet actions belong in Customer 360 and remain role-gated.

### 2.5 Customer detail (`/customers/:id`)

6 tabs: Profile, Bookings, Payments, Disputes, Referrals, Activity. Profile shows saved addresses and any "suki" loyalty memberships with points.

Super_admin actions: Suspend customer account, Flag for fraud review, and a wallet credit/adjust. Use the templates in `13-policies-codes-and-templates.md` when you message a customer about a suspension.

### 2.6 Bookings (`/bookings`)

The all-bookings exception and handoff monitor. Search by booking/customer/provider ID, customer or provider identity, the specific booked service, or city. Customer and provider names open their canonical 360 workspaces. Booking, Support, Customer 360, and Provider 360 links preserve the current case context. The list live-updates as bookings change and remains read-only; open Booking 360 for actions.

Use the summary cards and queue views to separate routine records from operational work. **Paid needs assignment** means exactly `paid` with no assigned provider. **Open support**, **Dispute review**, and **Past scheduled** open their matching whole-queue views. The default Attention order puts urgent or unassigned support cases first, then disputes, verified-paid assignment gaps, past-scheduled work, and other open support. Scheduled, Newest, and Gross value sorts are available, and the URL preserves the view/search/status/sort for shift handoff.

The owner shown on a booking row is the assignee of a linked support case. There is no separate booking-owner field. If several open cases exist, inspect Support before assuming one person owns every issue. Gross booking value is not net revenue and is not proof of payment, refund, wallet, gateway, or escrow state; use Booking 360 for money conclusions.

The statuses are not one reliable linear payment sequence. The approved fixed-price target is `requested/payment_pending` to `paid` with held escrow, then provider matching and `provider_en_route` to `provider_arrived` to `in_progress` to `completed_by_provider` to `confirmed` to `payout_ready` to `paid_out`. Quote jobs use `quoted`; historical or E33-affected records may show `matched` before `paid`. A dispute branches from completion into `disputed` to `resolved`, and cancellations use the customer/provider/admin terminal states. Always read payment/escrow and provider assignment separately. See `10-money-and-compliance-ops.md` for the money meaning of each state.

Note for support staff: E03 approved payment into held escrow before provider matching, but E33 found that the current fixed-price creation path can start an offer cycle before payment when auto-dispatch is enabled. An offer, provider notification, `requested`, `matched`, or `payment_pending` state is not proof of funds. Verify `paid` plus held escrow before treating work as assignment-ready; do not change the production setting or booking state as a workaround. E14 separately proves the current external PayMongo hosted checkout is invalid. Do not ask a customer to retry that link with real money, say payment succeeded from a redirect, or manually mark it paid. Preserve the identifier and escalate.

### 2.7 Booking detail / Booking 360 (`/bookings/:id`)

One booking, 5 tabs: Overview (linked customer/provider blocks, partial or complete service address, and direct conversation/support-case exits), Timeline, Evidence (photos, recorded check-ins, chat count, receipts), Money, and Audit. Money shows the booking totals, payment-gateway attempts, booking-linked wallet ledger entries, retained official-receipt/sales records, and linked dispute. It never exposes a PayMongo client key.

Super_admin action panel: Manual escrow release, Refund (peso amount), Reassign provider (from the named accepting-work provider picker), Cancel (with required hours-until-scheduled, provider-arrived, and customer-no-show inputs), and Force-complete. Every action has an in-app confirmation and a reason counter; most reasons need at least 10 chars and force-complete needs at least 20. The reassignment API independently rejects inactive, unapproved, unavailable, service-ineligible, out-of-radius providers and bookings without exact coordinates. Cancellation uses the stated inputs in the live refund calculation. The displayed policy editor still does not govern that calculation; follow the E09 warning and quote only the live outcome.

Ordinary admins can send a **Support message** from Booking 360. The system creates or reuses the booking conversation, writes the audited system message, and notifies the customer plus the assigned provider. Before provider assignment it reaches only the customer. Use the direct Conversation and Support-case links to preserve full context; this is not a replacement for the owned Support Ticket queue.

How to do a manual escrow release (super_admin): open the booking, go to the action panel, click Manual escrow release, type a reason. Use this only when a booking is stuck in `confirmed` but did not auto-release. See `09-trust-safety-and-disputes.md` before touching the money panel.

### 2.8 Dispatch Console (`/dispatch`)

The operations console has three working areas: a Leaflet/OSM map, the active-bookings list (capped at 50), and a derived **Dispatch Attention** queue for unassigned, overdue, or coordinate-incomplete bookings. Booking markers show service locations. Provider markers show saved service bases for approved providers whose accepting-work toggle is on. Neither marker is live device GPS. The header shows active-booking and accepting-work-provider counts, socket connection status for booking refreshes, and city/status/service filters.

Ordinary admins can open the canonical Booking, Customer, Provider, Conversation, and Support workspaces and send a 5–2,000-character **Support message** to the booking participants. Super_admin adds **Reassign** and **Review cancellation**. Review cancellation opens Booking 360; Dispatch never performs an unreviewed quick cancellation.

How to watch the dispatch console during a shift:
1. Confirm the socket status shows connected.
2. Filter to your launch city (default market is Metro Cebu).
3. Work the Dispatch Attention queue. For an unassigned or overdue booking, inspect its timeline and current offers in Booking 360 before deciding whether auto-dispatch exhausted candidates. Follow the no-provider playbook in `08-dispatch-and-live-operations.md`: confirm accepting-work providers actually cover the service and radius, then reassign, send a participant support message, or escalate a reviewed cancellation/refund.

The default map center comes from the configured default service area, with Cebu City only as a safe fallback when that configuration is unavailable. Use the city filter to move between active service areas; adding another market remains an admin data change, not a code change.

### 2.9 Catalog / Service Catalog (`/catalog`)

Manage the customer-facing service taxonomy: Categories (name, description, icon, order), Subcategories/services (customer scope, pricing type `fixed`/`range`/`quote`/`hourly`; base/min/max price in pesos; estimated duration; order), Add-ons (name, price, order), and intake fields. Prices are stored as centavos. Ordinary admins can inspect this workspace; only `super_admin` can publish or change it.

Start with the three status cards. **Need customer scope** opens the publishing queue for active services whose description is blank or too short. These services show customers an honest fallback until approved copy is published. Do not treat that fallback as finished catalog content.

How a `super_admin` adds or repairs a service:

1. Open the right category and add or edit the service.
2. Write the customer service scope first. State what work is covered, the expected deliverable, important exclusions or limits, and anything the customer or provider must prepare. Do not add guarantees, prices, parts, response times, or legal promises that have not been approved.
3. Use the customer preview to check the exact name, scope, and pricing presentation the customer receives.
4. Set the canonical pricing type and applicable base/range/hourly/per-unit values, estimated duration, and order.
5. Save. Active services require at least 30 trimmed characters of scope. This is a blank-copy safety check, not approval of the wording.

At the 2026-08-24 production audit, all 29 active services needed scope (17 fixed-price and 12 quote), and there were no add-ons. The business content task remains open until each service is reviewed and published; do not invent copy simply to clear the counter.

### 2.10 Pricing Rules (`/pricing-rules`)

Surge/multiplier rules of three types: `rush`, `holiday`, `peak_hours`. Each has a multiplier, optional scope (category or service area), priority, platform surge share, and an active toggle.

> **Set (editable):** Surge pricing is off at launch. Turn on a modest `peak_hours` rule only after the live booking curve shows a real demand pattern, and decide which holidays count at that point. _Recommended default. To change it, edit here and anywhere this value is referenced._

### 2.11 Disputes (`/disputes`)

The dispute queue. Search by dispute or booking ID. Filter by status (`open`, `under_review`, `escalated`, `resolved`) and tier (1/2/3). Live-updates when a dispute is filed.

Super_admin actions: Resolve (choose a resolution type) and Escalate (reason at least 10, only when tier < 3). Plain admins see a read-only banner.

Resolution types and what they mean:

| Resolution | Refund | Side effect |
|---|---|---|
| `full_refund` | 100% | Customer fully refunded. |
| `refund_with_warning` | 100% | Customer refunded, provider warned. |
| `refund_with_suspension` | 100% | Customer refunded, provider suspended. |
| `partial_refund` | choose 0-100% | Remainder released to provider. |
| `split_decision` | choose 0-100% | As above, framed as shared fault. |
| `no_refund` | 0% | Full escrow released to provider. |
| `free_redo` | 0% | No refund; provider redoes the job. |

Resolution decision notes must be at least 20 characters. Follow the decision tree in `09-trust-safety-and-disputes.md`. Do not improvise refund percentages.

### 2.12 Dispute detail / Dispute 360 (`/disputes/:id`)

One dispute. Header shows tier, age, priority score. Side-by-side customer claim and provider response. Evidence grouped by who uploaded it. Customer and provider 90-day history with a risk flag (`OK` / `REVIEW_REQUIRED` / `AT_RISK`).

Admin actions: Assign to a named active admin, Resolve & notify (shows an estimated-refund preview and a confirm step, super_admin), Escalate (at least 10 chars), Message parties (customer/provider/both, 5-2000), Reopen a resolved dispute (super_admin, reason at least 20).

How to resolve a dispute:
1. Read both sides and all evidence.
2. Check both parties' 90-day risk flags. `AT_RISK` on the complainer matters.
3. Apply the decision tree from `09-trust-safety-and-disputes.md`.
4. Click Resolve & notify, pick the resolution type, write decision notes (at least 20 chars), check the refund preview, confirm. Both parties are notified.

### 2.13 Financials (`/financials`)

7 tabs: Overview (GMV, revenue, refunds, net revenue, avg ticket, breakdowns by category/city/tier/payment-method), Escrow (total held plus aging buckets and a pending-release list), Payouts (pending/completed/failed counts), Guarantee Fund (balance, 30d in/out, runway, replenishment status), Reconciliation (PayMongo vs expected balance; super_admin can Run reconciliation and Acknowledge discrepancies), Tax Workpapers (Held) (internal VAT summaries and retained 2307 data), Legacy Sales Records (search retained OR-labelled records).

Most of this is read-only for plain admins. Run reconciliation remains a
super_admin action. BIR generation/finalization actions are disabled for every
role while E22 is open. Staff must not treat workpapers, OR identifiers, or
historical PDFs as approved returns/invoices. See
`10-money-and-compliance-ops.md`.

### 2.14 Payouts (`/payouts`)

The provider payout request and compliance queue. Filter by provider ID and status (`aml_review_pending`, `pending`, `approved`, `processing`, `completed`, `rejected`, `failed`). Each row shows provider, amount, method, destination account, status context, and any failure or rejection reason.

Super_admin actions: Clear internal large-payout review or directly Reject (reason at least 10) on internally held requests; Approve / Reject (reason at least 10) on pending requests; Complete (reason at least 10, optional transfer ID) on approved ones. Plain admins are read-only. These controls do not claim an AMLA filing or legal classification.

How to run a payout (super_admin):
1. Open the request. Confirm the provider is approved, amount matches the reserved pending wallet balance, and destination account looks right (GCash/Maya is an 11-digit 09xxxxxxxxx number; bank is 8-16 digits).
2. If the status is `aml_review_pending`, complete the required review. Clear with a written reason to move it to `pending`, or reject directly with a written reason to return the reservation. Neither action sends money.
3. Click Approve and record what was checked (at least 10 characters). The provider is notified.
4. Send the money through the authorized external PayMongo/bank process. Only after that succeeds, click Complete, record how/when it was sent (at least 10 characters), and paste the transfer ID if available. The provider gets "Payout Sent."
5. If something is wrong while pending, Reject with a clear reason; the transaction returns the full reserved amount to the provider's available balance. If the reservation is inconsistent, the action rolls back and Finance must investigate rather than manually compensating around it.

Note: a payout at or above the internal review threshold (default ₱500,000) lands in `aml_review_pending`. It counts as the provider's one-in-flight request and needs a reasoned super_admin clear-or-reject decision before ordinary approval can continue. This state does not itself mean a legal report was filed or required. See `10-money-and-compliance-ops.md`.

### 2.15 Notification Templates (`/notification-templates`)

Edit the message templates (push, SMS, email, in-app) by type (`booking_update`, `payment`, `dispute_update`, `tier_upgrade`, `payout`, `referral`, `suki`, `promo`, `system`). Each has a title and body template with `{{variable}}` placeholders and an active toggle. Delete is super_admin only.

How to change a message customers receive: find the template by slug, edit the body, keep the `{{variable}}` placeholders intact, save. (Reminder: the in-app Help/FAQ text is NOT here, it is hardcoded and needs a code release to change.)

### 2.16 Marketing (`/marketing`)

3 tabs: Overview (KPIs and channel breakdown), Promo Codes (super_admin create/edit/deactivate; percentage or fixed discount, max discount, min order, usage limits), Campaigns (super_admin create/edit; spend and attribution). A/B-testing features are hidden behind a flag.

### 2.17 Recurring (`/recurring`)

Recurring-booking subscriptions. Filter by status (`active`, `paused`, `cancelled`). Shows frequency (weekly/bi-weekly/monthly), preferred day/time, next booking date, total instances, amount. Read-only monitoring page.

### 2.18 Business Accounts (`/business-accounts`, detail `/business-accounts/:id`)

B2B accounts (office, condo, restaurant, hotel, retail, school, hospital, other). Filter by status (`pending`, `active`, `suspended`, `closed`). Fields include company, contact details, payment terms, volume discount, monthly credit limit. The detail page manages the account.

### 2.19 Service Areas (`/service-areas`)

The "cities are data, not code" control surface. This is how we turn markets on and off. Stats cards show total areas, active areas, total providers, waitlist count.

How to add a service area (a new city):
1. Click Add Area.
2. Fill in name, city, municipality, province, region.
3. Set center lat/lng (must be inside the Philippines: lat 4.5-21.5, lng 116-127.5).
4. Set radius (1-100 km) and min providers to launch (1-50).
5. Set a target launch date. Save. The area starts in `planned`.

How to launch / pause / set default a city:
- Activate: a `planned`/`recruiting`/`soft_launch` area to `active`.
- Pause: an `active` area to `paused` (stops new work without deleting it).
- Set default: makes that area the app's default. The mobile apps center their map and default the location pickers here. Only available for `active`/`soft_launch` areas, and only one area can be the default.

Default market today is Metro Cebu (Cebu City, Mandaue, Lapu-Lapu, Talisay). Markets Ken has in mind to add later: Boracay, General Santos, Davao, Metro Manila, Bacolod, and others.

Provider change requests appear above the market table. Each card links to Provider 360 and shows the current and requested market, old and proposed radius, proposed location pin, provider reason, and request time. Support, admin, DPO, and super-admin staff may inspect the queue; only `super_admin` may decide it. Before approval, verify that the pin is the provider's real operating location, lies inside the requested active/soft-launch area, and that the radius is appropriate. Enter a specific decision reason. Approval atomically changes the provider's primary area, radius, coordinates, city, and province; rejection leaves current matching coverage unchanged. The server rechecks the area, pin, live **Max Service Radius** setting, provider approval status, and original area/radius snapshot at decision time. If newer coverage exists, reject the stale request and ask for a new one instead of overwriting it. Every decision writes the audit trail and notifies the provider; a provider-withdrawn request simply leaves the queue and preserves active coverage.

### 2.20 Analytics (`/analytics`)

5 tabs: A/B Tests (hidden by default in v1.0), Cohort Analysis, Churn Prediction, Quality Scores, Commission. Read-only reporting. See `12-quality-standards-and-kpis.md` for which numbers we actually track.

### 2.21 Audit Log (`/audit-log`)

The unified read-only log. It combines request-level entries (badge "request") and privileged admin operations (badge "admin op," which carry the typed reason). Filterable. When you need to know who did what and why, this is the page. Every money/destructive action you take is recorded here.

Booking conversation interventions appear as **Booking support message sent**. This participant-neutral label is intentional because an assigned provider can see and receive the same system message as the customer.

### 2.22 Compliance (`/compliance`)

5 tabs: NPC Compliance (the Data Subject Request queue; filter by status and overdue-only; open a DSR to change status, add notes, set the response URL, or reject; Consent Records search is restricted to super_admin/dpo), BIR Calendar (held under E22 and not an authoritative filing schedule), Audit Log (same data as the Audit Log page plus CSV export), Tax Documents (redirects to held/internal Financials records), Regulatory Reports (a v1.1+ stub).

DSRs have a 15-day SLA. Overdue ones show on the Dashboard alerts too. The DPO owns this work. See `10-money-and-compliance-ops.md`.

### 2.23 Data Protection Log (`/data-protection-log`)

A DPO surface over Data Subject Requests: Mark complete (with a response URL), Request more info, Reject (reason at least 20, super_admin), Escalate to NPC (with an NPC reference, super_admin).

### 2.24 Consent Versions (`/consent-versions`)

A DPO surface listing current consent types and versions with active-user counts. The DPO can publish a new version, which is audited.

### 2.25 Support Tickets (`/support-tickets`)

The ticket queue. Types: `booking_issue`, `payment_issue`, `provider_no_show`, `app_bug`, `account_issue`, `general_inquiry`. Statuses: `open`, `in_progress`, `waiting_on_customer`, `waiting_on_provider`, `escalated`, `resolved`, `closed`. Priorities: low/medium/high/urgent.

Customers and providers can open and follow their own tickets in the shared in-app Support screens. Those tickets enter this queue automatically. Contacts received through email (support@onservice.ph for customers, providers@onservice.ph for providers) or Messenger still need an agent-created ticket so they use the same case record.

How to work a ticket:
1. Find it by ticket number, subject, customer/provider name, phone, email, or provider business. Account and Booking 360 link back to their exact case views.
2. Open it, confirm priority, and assign it from the active-agent list. Provider cases link to Provider 360; customer cases link to Customer 360.
3. Reply to the user, or post an internal note (internal notes are admin-only).
4. Update status as you go. To mark `resolved` or `closed` you must add resolution notes of at least 10 characters.

When a user replies to a waiting case, it returns to the active queue. Automated reminders and five-day auto-close are not implemented. Staff must review waiting cases manually and must not assume reminders were sent. See `06-customer-support-sop.md` and `07-provider-support-sop.md` for triage and SLA targets.

### 2.26 Staff & Roles (`/staff`)

Super_admin only. Plain admins get an "access required" notice. There are three tabs:

- **Staff:** search and select an existing active admin-tier account by name, email, or phone; attach an operations-directory profile; and activate, deactivate, or archive that profile. Every write requires a reason. Never paste a raw user ID. These profiles do not grant or revoke panel access.
- **Role Profiles:** create, edit, or archive organizational role metadata. Every change requires a reason and records before/after values. The `super_admin` profile cannot be edited or archived, and a profile with active staff cannot be archived. Permission labels here remain metadata; `users.role` and server route checks are the live access source.
- **DPO Management:** inspect the actual Data Protection Officer seat, assign one active admin account when vacant, or complete a reasoned handover. This is a real account-role change. The server serializes assignment and refuses a second active DPO.

The last-active-super-admin check on this page protects the directory profile only; it does not replace governance of the real account role. Use the Audit Log after any staff, profile, or DPO change.

### 2.27 Settings / Platform Settings (`/settings`)

The settings registry is grouped by operational category. Inactive legacy insurance/protection settings are hidden under D04; do not infer a launch product from rows that remain in historical storage. Each active row shows its value, allowed range, unit, whether it is customized vs default, its change history, and one of three impact badges: **Live control**, **Launch hold**, or **Not connected**.

Super_admin can Edit and Reset only a **Live control**. Each change requires an audited reason of at least 10 characters. **Launch hold** and **Not connected** rows are read-only for every role, including super_admin. This prevents a stored value from making customer/provider wording disagree with API, worker, money, or security enforcement. Plain admins are read-only for all rows.

How to change a setting (super_admin): find it by category, confirm the **Live control** badge and read its impact text, click Edit, set the new value within the allowed range, type a reason, and save. Cache-backed consumers refresh within about 60 seconds; Flush cache forces those readers to fetch again. Common live controls include commission rate per tier, service fee rate, `auto_dispatch_enabled`, and the internal large-payout review threshold. The escrow auto-confirm and filing-window rows are now visibly read-only because E18 makes that pair a money-path hard stop and their authoritative workers still use deployed configuration. Never change a money setting without Ken's go-ahead. See `10-money-and-compliance-ops.md`.

### 2.28 Cancellation Policy (`/settings/cancellation-policy`)

Super_admin only. Edits the customer-facing cancellation policy (refund tiers, intro text, legal disclaimer, provider-no-show credit), with versioning. The mobile app's Help screen and Terms read this live.

Honest caveat to flag in support: this displayed policy is NOT the same set of numbers that actually moves the refund money. The live refund math runs off the `cancel_refund_*` knobs in Settings, and the brackets differ from what this page shows. Until the two systems are reconciled (a known open issue), quote the live refund money-path numbers to customers, not the policy page. If a customer quotes the policy page back at you and the refund does not match, do not argue, escalate it. See `09-trust-safety-and-disputes.md` and `13-policies-codes-and-templates.md`.

### 2.29 Change Password (`/change-password`) and 404

Change your own password here. If your account is flagged for forced rotation, every page redirects you here until you set a new password. The 404 page is the catch-all for any unknown URL.

### 2.30 Communications (`/communications`)

Company-wide conversation oversight. Use the queue and statistics to find conversations that need review, open the linked booking context, review reported messages, and redact a message only when policy requires it. Redaction and review actions are audited. This page is for oversight; normal customer/provider replies belong in the Support queue or the role apps.

### 2.31 Tester Feedback (`/feedback`)

The owned queue for third-party customer, provider, and admin testing. It is separate from Communications, which moderates user chat, and Support Tickets, which handles individual customer/provider cases.

How to triage a submission:

1. Start in New. Use the app-area filter to separate customer, provider, and admin feedback.
2. Read the original issue, reproduction steps, expected result, ratings, written answers, price reactions, ideas, and real screenshots. A tester's severity label is evidence, not the final company priority.
3. Choose `Triaged` only after selecting an active named admin owner and writing what was verified or where the work is linked.
4. Choose `Done` only when the verified work is actually complete. Keep the owner and record the result.
5. Choose `Dismissed` for spam, stress input, duplicates, or non-actionable content and explain why. Do not silently delete feedback.

Ordinary admins see masked contact details and masked personal data inside free text. Status, owner, and note changes are permanent audit-log events. The key-protected exports remain available for private research and backup, but they are not the operating queue.

### 2.32 Projects (`/projects`)

Oversight for larger multi-stage customer projects. Use it to inspect project status, milestones, linked bookings, participants, and exceptions that need operations support. Milestone escrow is not launch-approved until the legal and accounting decision in escalation E12 is resolved, so do not describe a planning milestone as protected escrow.

---

## 3. New-admin onboarding: Week 1 shadowing plan

The goal of week 1 is read-only confidence: you can find anything, you understand what each button does, and you know when to escalate instead of clicking. You do not get write/super_admin access until you pass the competency check in Section 4.

| Day | Focus | What you do |
|---|---|---|
| Day 1 | Login, roles, Dashboard | Set up 2FA. Log in. Read this whole manual. Sit with a senior admin and read the Dashboard for the day. Learn what each alert means. |
| Day 2 | Providers + vetting | Shadow 5+ provider reviews. Open Provider 360, read KYC docs through the proxy, walk the vetting scorecard in `04-provider-vetting-and-filtering.md`. Watch a real Approve and a real Reject (you observe, senior clicks). |
| Day 3 | Bookings + Dispatch | Watch the Dispatch Console through a busy window. Trace 3 bookings end to end in Booking 360. Learn the no-provider playbook in `08-dispatch-and-live-operations.md`. |
| Day 4 | Support + Disputes | Work the Support Tickets queue with a senior reviewing your replies. Read 5 disputes in Dispute 360 and write (do not submit) a recommended resolution for each. Compare with the decision tree. |
| Day 5 | Money + Compliance (observe only) | Walk Financials, Payouts, Settings, Compliance with a super_admin. Watch one payout run and one DSR handled. Do not touch money. Read `10-money-and-compliance-ops.md`. |

Throughout the week: every privileged action you would have taken, say out loud what reason you would type and why. The reason field is permanent and the audit log is real.

---

## 4. Competency checklist (pass before full access)

A super_admin signs off each item. Until all are checked, the new admin stays read-only.

Navigation and roles
- [ ] Can log in, including completing 2FA, and can change own password.
- [ ] Can explain the difference between the account role and the named DB role, and why "super_admin only" buttons are greyed out for them.
- [ ] Can find every current sidebar page and the detail/change-password routes without help.

Providers
- [ ] Can open a Provider 360 and view KYC docs through the proxy.
- [ ] Can state the three required KYC documents (NBI, gov ID front, selfie) and why approval fails without them.
- [ ] Can name the five tiers and their commission rates from memory.
- [ ] Knows there is no delete; removal is Suspend or `deactivated`.

Bookings and dispatch
- [ ] Can read the booking status flow and explain escrow hold vs release.
- [ ] Can describe the no-provider alert and the first 3 steps of the playbook.
- [ ] Can distinguish E03's fixed booking/escrow ordering from E14's open hosted-checkout blocker, and knows never to retry, mark paid, or dispatch a merely pending external attempt.

Support and disputes
- [ ] Can create a support ticket on a user's behalf and set priority/assignment.
- [ ] Can separate Tester Feedback from a user support case, assign an owner, and record a defensible triage or dismissal note.
- [ ] Can walk the dispute decision tree and write defensible decision notes (at least 20 chars).
- [ ] Knows the displayed cancellation policy can differ from the actual refund math, quotes the live numbers, and escalates the mismatch.

Money and compliance (awareness, not access)
- [ ] Can locate Escrow aging, the Payouts queue, and the DSR queue.
- [ ] Knows which actions are super_admin only and never to attempt a money action without sign-off.
- [ ] Knows the audit log records every privileged action with the typed reason.

Sign-off: ___________________________ (super_admin)    Date: ____________

> **Set (editable):** New admins stay read-only for a minimum of 2 weeks. They move to full `admin` tier after this checklist passes. `super_admin` is granted only by Ken's named approval for a specific individual; new admins do not reach super_admin by default. _Recommended default. To change it, edit here and anywhere this value is referenced._

---

## 5. Quick-reference card

- All times Asia/Manila. Support hours are Monday to Saturday, 8:00 AM to 6:00 PM PHT. All money in pesos (centavos under the hood).
- Reason fields are permanent and public-to-audit. Most need at least 10 chars; dispute resolve, reopen, and force-complete need at least 20.
- "Accepting work" provider = approved AND `is_available = TRUE`; this is a provider-controlled availability setting, not proof of app presence or live location. Suspension removes a provider from matching instantly.
- Current code auto-confirms/releases after 24h while dispute filing remains open for 48h. This is the E18 money-path contradiction: do not call it settled policy, change either timer independently, or assume a later accepted case still has held funds. DSR SLA is 15 days.
- Waiting support tickets require manual follow-up. The proposed five-day auto-close and two reminders are not implemented.
- If you are not super_admin and a money/destructive button is locked, that is correct. Escalate, do not work around it.
- When unsure, stop and ask. The audit log remembers everything.

---

## Open decisions set in this doc

Each is a recommended default that Ken can override. Edit the value here and anywhere it is referenced.

- **Super-admin accounts (Section 1):** Ken plus one Operations Lead only. (editable)
- **Granular admin role gating (Section 1):** live money authority is the `super_admin` account role; named finance/support permissions remain metadata pending an explicit authorization architecture. (editable)
- **Surge pricing (Section 2.10):** off at launch; enable a modest `peak_hours` rule only after the live demand curve justifies it. (editable)
- **Cancellation numbers in support (Section 2.28):** quote the live refund money-path numbers until the policy page and the money path are reconciled. (editable)
- **Read-only period and tier (Section 4):** minimum 2 weeks read-only, then full `admin` tier after the checklist; `super_admin` only by Ken's named approval. (editable)
