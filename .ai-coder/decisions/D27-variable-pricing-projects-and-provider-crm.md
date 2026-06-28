# D27 — Variable pricing, custom quotes, projects, remote help, and the provider CRM

Date: 2026-06-29
Status: APPROVED by Ken 2026-06-29 — "build it all in order, don't stop until done." Building the §4 phases in sequence. The §5 money/architecture/external-dep decisions are still Ken's to make; per CLAUDE.md hard-stops, each is surfaced at the point its phase is reached rather than guessed. Three verified bugs already fixed this session (see end). Phase 1 (lead discovery) is in progress.
Raised by: AI coder, from Ken's request to support contractor/handyman/painting/design/construction-scale work, remote help, and a provider business-management system.

Grounded in a code audit of quoting, pricing, parts, job lifecycle, media, provider tools, remote help, and catalog (2026-06-29, parallel-agent workflow). The headline: **the custom-quote engine is ~80% built and genuinely good, but it has a dead middle and no project layer.**

---

## 1. The model: onService is a spectrum, not one job type

| Tier | Examples | Pricing | Status today |
|---|---|---|---|
| 0 Remote help | "No hot water" -> it's the breaker | free / advice fee / per-min | ❌ none |
| 1 Fixed job | aircon clean, basic clean | one catalog price | ✅ works |
| 2 Custom-quote job | roof repair, paint job, handyman | quote after photos/measurements | ⚠️ built but can't start (dead middle) |
| 3 Project | interior design, renovation, room build | milestones / by area / staged | ❌ no project layer |
| 4 Large / multi-trade | home build, condo/apartment-complex | phased contract, multiple trades, org client | ❌ no project layer |

The app should detect the tier from the chosen category and adapt the flow, pricing, and management tools. Tiers 3 and 4 need a **project** entity above individual jobs. That is the single biggest missing piece.

---

## 2. What already exists (do NOT rebuild)

The custom-quote primitives are real and server-canonical (the customer never sets their own price):

- **Quote-based bookings.** A `quote` subcategory routes the customer to a job-request: free-text description, 2-10 photos, urgency, optional budget range. Booking is created `quote_based / requested`.
- **Provider itemized quotes.** A real line-item builder: each line has type (labor/materials/equipment/other), qty, unit, unit price; plus estimated days and notes. Stored in `quote_line_items`, rolled into labor/materials subtotals.
- **Customer compares + accepts.** Multiple competing quotes, line-item breakdown, expiry, single-accept lock, accepted price becomes the booking price (server reads it from the quote row).
- **Change orders.** Provider adds a mid-job amount with photos, capped at 50% of service price + a ₱10k cap, customer approves and pays into escrow.
- **Surge/dynamic pricing** (rush/holiday/peak, admin-CRUD, audit-logged), **recurring services** (weekly/bi-weekly/monthly with auto-charge), **B2B contracts** (negotiated rate), **B2B invoices** (`business_invoices` + items), and **team/crew foundation** (`provider_staff`, a `performer_staff_id` on a job).

Key files: `booking.service.ts` (createBooking, submitQuote, acceptQuote, change orders), `booking/from-quote.service.ts` (server-canonical accept price), `quote_line_items`/`change_orders`/`booking_quotes` (migration 018), `pricing_rules` (024), `recurring_bookings` (020), `business_contracts`/`business_invoices` (021).

---

## 3. The gaps and the solutions

### 3.1 The dead middle: providers never see quote requests (HIGHEST LEVERAGE, no decision needed)
`createJobRequest` writes the request but calls NO dispatch or matching. Matching is fixed-price-only. There is no provider "open requests" screen or endpoint. So a customer's custom-quote request goes nowhere unless a provider already has the booking ID. The whole tier-2 product is built but starved.
**Solution (buildable now):** (a) on job-request, fan out a notification to approved providers matched by category + service area (reuse the existing matching score + `booking_offers` + notification engine); (b) a provider **"Open Requests / Leads" inbox** screen + `GET /api/v1/providers/me/job-requests`; (c) surface the request's budget/urgency/photos/video to the provider when quoting (the booking serializer currently omits them).

### 3.2 No structured intake (the photos-to-quote pipeline)
Everything the customer tells the provider is one free-text box. No typed fields for measurements (sqm / linear m), room/unit count, brand/model, **color codes**, finishes, or a **"do I already have the part"** flag. The `job_video_url` column exists but no screen captures video.
**Solution:** a **per-category intake form engine**. Each subcategory gets a configurable question set (typed fields: number+unit, choice, photo, video, yes/no), rendered dynamically on the job-request screen, stored as JSONB on the booking, and shown to the provider in the quote builder. This is what makes "accurate quote" real and is the foundation for design selections (door type, colors, materials) in projects. Admin-editable (per the standing "admin-editable default" rule).

### 3.3 Parts & materials are not first-class
"Materials" is only a tag on quote line items. Change orders carry a single lump amount with NO itemized parts, no customer-supplied-vs-provider-sourced flag, no markup, no receipts. The materials-list endpoint exists but is shown on no screen.
**Solution:** give change orders the same line-item shape as quotes; add `sourced_by` (customer/provider), optional brand/model/color, and a receipt image per part; surface a merged materials list (quote + change orders) to both sides. Mark up + commission-on-materials is a money decision (see §5).

### 3.4 Pricing models beyond fixed + lump-quote
Today: fixed and custom-quote work. **Hourly is a trap** (selectable in admin, hard-rejected at booking with an opaque error). No per-sqm / per-unit / by-size / milestone / progress billing.
**Solution:** add quantity-driven types (`per_unit`, `per_sqm` with a unit label + rate, price = rate x quantity computed server-side in BOTH preview and create), and decide hourly (implement with actual-hours truing-up, or remove). All money-path; topic-branch + PR + a "preview total == create total" regression test.

### 3.5 The project layer (tiers 3 and 4) — the big one
No multi-visit / phased / milestone job. A booking is one row = one visit (address + scheduled_at are required). Recurring and B2B each spawn independent single visits; neither models a staged project.
**Solution: a `project` entity** that links several jobs/phases under one scope, with:
- **Milestones** (ordered phases: e.g. design -> permits -> rough-in -> finishes -> handover), each with a target date, % complete, before/during/after photos, and a **QA sign-off** before the next phase unlocks.
- **A design brief + selections board** (the intake engine, extended): the customer states requirements; the provider proposes options for door type, colors, materials, fixtures, finishes; each selection is approved and logged. This is how requirements get across cleanly and disputes shrink.
- **Documents:** blueprints, floor plans, permits, contracts, bill of quantities — versioned, shareable, approvable. (Today the app stores only job photos, not documents.)
- **Milestone-based escrow:** the customer funds the project and escrow releases per approved milestone instead of one lump release. This is the core money-path change.
- **Multiple stakeholders:** architect + contractor + interior designer on one project, plus the client, who may be a person OR an organization (condo corporation / property manager). **Business accounts already exist** and are the right foundation for the condo/complex case.
- **Progress feed + reporting** so the owner or property manager always sees status without calling.
- **Change orders** already exist and extend naturally to a project.

### 3.6 Remote help / live diagnosis (tier 0)
None exists. Bookings force a physical address and only two booking types.
**Solution:** a third booking type `remote_consult` (reuses booking, chat, escrow, payout, review, moderation), with a "Get help now" entry, immediate chat (relax the booking-gated chat so it opens at request time), and **live video** (the D26 self-hosted LiveKit work). Needs its own short/flat/per-minute price and a fast escrow-release-on-resolve path, plus a `resolved_remotely` status, and optional remote-then-onsite linkage. Money + external-dep decisions (see §5).

### 3.7 Provider CRM (make the provider area a business system)
Today the provider area is a job list: availability toggle, 3 stat tiles, active jobs, a view-only repeat-client (suki) list. No leads pipeline, no client notes/tags/history, no calendar, no materials/inventory, no follow-ups, no per-category numbers.
**Solution (mostly buildable without money decisions):**
- **Leads/quote pipeline:** open requests -> quoted -> won/lost (built on §3.1).
- **Client book:** every past customer with job history, private notes, tags, and a one-tap "offer a rebook / send a deal" (reuses chat + the stay-on-platform rails).
- **Calendar/schedule** of upcoming jobs and project milestones.
- **Materials list / simple inventory** per category, reusable across quotes.
- **Earnings + per-category P&L** they already half-have.
- **Follow-ups / reminders** (NBI expiry already exists; extend to "follow up with this lead", "rebook this client in 3 months").
- **Per-category creativity:** an aircon pro wants a service-history-per-unit log; a painter wants a color/finish library; a contractor wants a project board; a cleaner wants recurring-route management. The intake-engine + project layer make these category-specific without forking the app.

### 3.8 Admin visibility (a money-path blind spot)
No admin page shows quotes, line items, or change orders. Support can't see why a booking is priced as it is or audit a disputed change order.
**Solution:** add a Quotes / Line-items / Change-orders / Project section to the admin booking detail (and a project view). Buildable now; pairs with the moderation work already shipped.

---

## 4. Phased build plan (recommended order)

1. **Unblock tier 2 (no decisions):** lead/quote-request dispatch + provider leads inbox + show request details to provider + admin quote visibility. Makes custom quotes actually work. *(Recommend building first.)*
2. **Structured intake engine (no decisions):** per-category typed fields + video capture. Powers accurate quotes and, later, design selections.
3. **Parts/materials line items on change orders + materials screen (mostly no decisions; markup/commission is a decision).**
4. **Pricing models** (per-sqm/per-unit; hourly decision) — money-path, PR.
5. **Project layer** (project + milestones + selections + documents + milestone escrow) — the big one; money + architecture; needs a decision file of its own.
6. **Remote consult + live video** — rides on D26; money + external-dep.
7. **Provider CRM depth** (client book, calendar, follow-ups, per-category tools) — layered on 1-5.

---

## 5. Decisions only Ken can make (money / architecture / external dependency)

1. **Deposits & milestone billing (money).** For big jobs, does the customer pay a deposit up front + balance on completion, or stage payments per milestone with escrow released per phase? Today acceptQuote charges one lump sum and escrow holds/releases once. This is the core change for projects.
2. **Hourly pricing (money).** Implement (rate x hours with actual-hours truing-up at completion) or remove it from the catalog? It is currently a trap.
3. **Materials markup + commission base (money).** If a provider sources a part, can they mark it up, and does the platform take commission on materials or labor-only?
4. **Remote consult pricing + the video dependency (money + external dep).** Per-minute, flat advice fee, or credited toward an on-site visit? And greenlight the self-hosted LiveKit + coturn stack from D26 (you already chose "our own"; this is the go-ahead to stand it up).
5. **Video at intake (storage/architecture).** Enable customer video upload on requests? It adds S3 storage + size/transcoding + moderation cost.
6. **Project umbrella shape (architecture).** Project-as-parent-row vs project-as-tag-on-bookings. Two materially different designs; needs its own decision file before building.

---

## 6. Fixed this session (verified, no decision needed)

- **Money-safety:** `change_orders` could not be auto-expired. The MED-N70 expire worker writes `status='expired'` but the live CHECK only allowed pending/approved/declined/paid, so the worker would throw on every eligible row and an approved-but-unpaid change order would never cancel (a provider could read "approved" as paid authorization). Migration 139 adds `'expired'`. No approved change orders exist on prod yet, so this is pre-emptive.
- **Routing bug:** the customer category screen checked `pricingType === 'quote_based'` but the catalog value is `'quote'`; a quote subcategory with a base_price set mis-routed to the fixed-price flow. Fixed.
- **Admin `range` crash:** the catalog editor offered a `range` pricing type the DB rejects, so saving threw a constraint violation. Removed the broken option; `range` (price band + custom quote) is a future pricing model in §3.4.
