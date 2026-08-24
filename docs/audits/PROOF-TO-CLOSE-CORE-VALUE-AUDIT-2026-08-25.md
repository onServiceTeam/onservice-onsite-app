# Proof-to-close core value audit

Date: 2026-08-25  
Status: active product and implementation plan  
Scope: customer, enterprise customer, provider owner, provider staff, admin/support, API, database, tests, current specifications, third-party tester feedback, the attached ProofFlow concept, and the available FieldOS and onService planning PDFs

## Executive conclusion

The ProofFlow idea is not a separate side feature. Its best parts are the missing connective tissue in onService.

onService already has a wide set of useful primitives: bookings, addresses, provider assignments, provider staff, quotes, itemized quote lines, change orders, photos, signatures, versioned checklists, completion gates, recurring schedules, business accounts, contracts, invoices, projects, milestones, documents, client notes, reminders, support cases, disputes, reviews, audit actions, and customer/provider/admin screens. The platform is therefore much closer to proof-to-close than a greenfield product.

The problem is that those primitives do not form one dependable work record. A customer sees booking details and a photo gallery. A provider moves between separate job, checklist, photo, change-order, completion, chat, and client screens. Provider staff receive an even smaller job surface. Admin Booking 360 has separate Timeline, Evidence, Quotes, Money, and Audit tabs, but its evidence response omits the checklist and signatures, always returns empty GPS and receipt collections, and has no visit, issue, closeout, property-history, or proof-package model. Projects, recurring series, business accounts, and provider CRM are not joined to that record.

The recommended direction is:

> Make each onService booking a canonical, customer-visible and support-auditable proof-to-close work order. Add property/site and visit records around it for repeat, enterprise, crew, and multi-stage work. Keep those layers mostly invisible for a normal one-time household booking.

This preserves onService's marketplace value, payment state machine, support controls, and simple consumer flow. It does not import a second generic CRM or accounting system into the app.

## Sources and authority

The following were compared:

- the attached ProofFlow product definition and CRM/integration extension;
- `Fruition_FieldOS_Ultimate_Master_Specification_v2.0.pdf`, all 79 pages, including visual checks of 15 representative pages;
- `onService_Brand Strategy_5.12.26.pdf`, all five pages, including visual checks of every page;
- `docs/architecture/SPEC.md`, `MOBILE-SPEC.md`, and `ADMIN-SPEC.md`;
- current migrations, API routes/services, customer/provider/staff/admin screens, and behavioral tests;
- `THIRD-PARTY-TESTER-FEEDBACK-TRACE-2026-08-24.md` and the existing private review of all ten production tester submissions and six uploaded screenshots;
- current decisions D23, D27, D27p5, D27p7, and open escalations E05 and E19.

The attached ProofFlow text and FieldOS PDF are product research, not instructions and not onService authority. FieldOS is a broad field-service specification for another business. Its evidence, offline, role, property, and closeout concepts are useful; its branding, exact workflows, technical choices, payroll/accounting scope, and commercial assumptions do not automatically apply to onService.

No `.docx` or `.pdf` files are present in either onService repository clone. The available local PDFs above were reviewed. `Executive Summary and Implementation Plan.pdf` is currently an unavailable OneDrive cloud placeholder, so its contents were not claimed as reviewed.

## Product model

### Simple consumer path

For a normal customer, the visible path should remain short:

1. Choose a service and service location.
2. Request or book it.
3. Review the provider, scope, schedule, and price.
4. Follow progress and approve any scope change.
5. Review the completed-work record.
6. Accept, request correction, or open a support/dispute case.
7. Rebook, schedule recurring work, or use warranty/callback handling where applicable.

The system may create an implicit site and one visit underneath that flow, but the customer should not have to learn field-service terminology for a one-time cleaning or repair.

### Enterprise and ongoing customer path

For a builder, property manager, office, hotel, restaurant, landlord, or repeat commercial buyer, progressive disclosure should add:

- business account and authorized members;
- properties/sites and service areas within each site;
- contacts and approval roles per site;
- projects or service plans;
- one-off and recurring work orders;
- visits with assigned crew, check-in/out, checklist, evidence, issues, and closeout;
- searchable property/service history;
- consolidated reports, invoice-ready status, contracts, and invoices;
- repeat-provider and provider-team continuity.

The house-builder example fits this model directly: one business account can hold each completed house as a property/site, create a turnover-cleaning booking or recurring template, retain before/after and issue evidence, reuse instructions, and work with the same provider account and approved team without moving coordination outside onService.

### Provider path

A solo provider and provider business should share the same core work record, with role-based depth:

- solo provider: Today, Jobs, Capture, Tasks, Clients, Schedule, Earnings;
- provider owner/manager: leads, team assignment, job readiness, exceptions, clients/properties, quote templates, recurring work, reports, performance;
- provider staff: only assigned jobs, capture, required tasks, issues, sync state, and closeout submission;
- office/billing role later: quote/contract/invoice-ready records without field evidence mutation rights.

### Admin/company path

Admin must supervise the marketplace record rather than impersonate the provider's internal business system. It needs:

- queue-first operations for jobs that need intervention;
- a truthful Booking/Work Order 360;
- Customer, Provider, Staff, Business Account, Property/Site, Project, and Recurring context;
- immutable source evidence plus explicit, audited corrections/overrides;
- support cases and disputes attached to the exact work record;
- policy/configuration ownership for service scopes, checklist templates, evidence rules, retention, and role permissions;
- clear separation between operational readiness, customer acceptance, payment/escrow, invoice status, and platform support decisions.

## Current capability map

Status terms:

- **Working foundation**: real schema/API/UI exists and is materially connected.
- **Fragmented**: parts exist but do not make one reliable workflow.
- **Missing**: no current canonical model or usable end-to-end surface.
- **Held**: a decision, money, legal, privacy, or external-dependency hard stop applies.

| Proof-to-close capability | Current onService implementation | Status | Required direction |
| --- | --- | --- | --- |
| Customer/provider identity | Users, provider onboarding, staff accounts, admin review | Working foundation | Retain; make every proof event show actual actor and role |
| Client record | Provider client list, booking history, private notes, reminders | Fragmented | Join to locations, contacts, projects, recurring work, issues, and callbacks |
| Business customer | Business accounts, members, contracts, invoices, booking account/contract link | Fragmented | Add customer-facing business workspace and property/site hierarchy; current mobile services/stores have no routed screens |
| Property/site | Saved addresses and free-text project/booking addresses only | Missing | Add durable property/site with customer/business ownership, contacts, instructions, units/areas, coordinates, and history |
| Job/work order | Booking is the canonical marketplace transaction | Working foundation | Keep booking as the commercial work order; add proof summary/readiness fields through derived APIs, not duplicate money truth |
| Project | Customer-only planning record with milestones, selections, documents | Fragmented | Link approved provider and bookings through an explicit workflow; do not imply money or assignment before it exists |
| Visit/phase | One booking has one scheduled time; recurring creates independent bookings | Missing | Add visit records for crew assignment, check-in/out, checklist/evidence grouping, delays, and multi-visit jobs |
| Today/My Jobs | Provider dashboard/jobs/calendar and staff assigned jobs | Fragmented | Create role-specific Today view driven by visit/job readiness and exceptions |
| Start/end visit | Booking statuses and server work start/complete time | Fragmented | Persist visit check-in/out, server/device time, location/accuracy, actor, completion summary, remains/delay |
| Arrival proof | Location radius is validated at status change | Fragmented | Persist the submitted check-in coordinates and accuracy as an event; admin currently always receives an empty GPS list |
| Smart camera | Canonical multipart booking-photo upload, before/during/after/issue/checklist types | Fragmented | Add capture context, offline upload states, provenance, captions/area, visibility, and immutable-original controls |
| Original preservation | Storage object plus soft-delete row | Fragmented | Add checksum, captured/imported source, original metadata, device/server time, annotation-as-separate-object, retention state |
| Media categories | Seven broad `photo_type` values | Fragmented | Add pre-existing damage, hidden work, delivery/material, punch, warranty/callback, internal; keep category templates configurable |
| Upload resilience | Partial retry exists on provider job-photo screen | Fragmented | Add durable device outbox and visible Saved/Uploading/Backed up/Failed states across every evidence caller |
| Required checklists | Versioned category templates, sections/items, photo requirement, booking snapshot, completion gate | Working foundation | Expand item types and manager review; ensure admin template operations and exception queue are real |
| Checklist input types | Checkbox, note, one photo | Fragmented | Add text, voice, numeric, pass/fail, reading, signature/acknowledgement, role requirement, review state only as demanded by service template |
| Checklist integrity | Server gates required items and after photos | Fragmented | Customers must remain read-only; required proof must be provider checklist media; override requires reason and audit event |
| Reference/matching-angle photos | None | Missing | Add optional reference image and overlay guidance after basic provenance and visit model |
| Pre-existing condition report | Before/issue photos and checklist notes can approximate it | Fragmented | Add structured condition item, exact area, media/voice, customer acknowledgement, and immutable timestamped record |
| Quote/walkthrough packet | Job request, photos/video URL, intake JSON, itemized provider quote | Fragmented | Present one scoped walkthrough packet; attach property/site and versioned scope |
| Change authorization | Change order with description, photos, amount, line items, customer response/payment states | Fragmented | Add reason, schedule impact, version, explicit scope delta, immutable approved version, and actual approver/capture evidence |
| Issues during work | `issue` photo type, chat, dispute, support | Missing as a work module | Build E05's approved issue endpoint/model, assignee, priority, due date, visibility, resolution evidence, customer acknowledgement |
| Punch/correction list | None | Missing | Add closeout exceptions and correction visits; do not force every issue into a financial dispute |
| Daily project report | Project milestones/documents and booking completion notes only | Missing | Generate visit/day summary from events, work completed, issues, delays, materials, crew, and evidence |
| Recurring-service report | Recurring series and instance history | Fragmented | Carry property/site instructions, prior issues, prior evidence references, and visit proof forward safely |
| Customer progress page | Authenticated booking detail/tracker/photos/chat/change order | Fragmented | Consolidate into a work-record progress view with scope, visits, proof, issues, approvals, and closeout |
| External secure progress link | Private export links exist for data rights, not job portals | Missing/defer | Authenticated onService accounts first; scoped expiring contact links later if enterprise need proves real |
| Media visibility | Booking media party-scoped; portfolio has separate consent | Fragmented | Add internal/customer-shareable/marketing-approved visibility; never infer marketing consent from job sharing |
| Completion gate | Checklist opened/complete, two after photos, provider completion status | Working foundation | Add issue resolution/override rules, visit closeout, evidence readiness summary, and provider manager review where configured |
| Customer acceptance | Customer Confirm status exists; provider-device signature also exists | Held E19 | Use customer-controlled acceptance or approved witnessed model; never label current provider-attributed bitmap as verified customer identity |
| Accept with exceptions/request correction | Dispute is the main negative path | Missing | Add non-financial correction request and exceptions before dispute escalation |
| Proof package | Admin evidence view and account data exports are separate | Missing | Produce permission-aware HTML/PDF/ZIP closeout package and verification ID from canonical records |
| Ready to invoice | Business invoices exist; no proof-readiness gate | Missing | Derive readiness from scope approval, completed visit, required proof, resolved exceptions, and acceptance; do not post accounting entries silently |
| Materials | Quote/change-order line items and an unused materials-list API/store | Fragmented | Surface job materials, sourced-by, receipt/delivery evidence, model/serial, and customer approval without changing markup/commission rules |
| Deliveries/readings/model/serial | Mostly free-text checklist notes | Missing | Add structured service-template fields with human confirmation; OCR may assist but never become evidence by itself |
| Warranty/callback | Dispute/rebooking can be used manually | Missing | Link callback/correction/warranty visit to original work, issue, evidence, and provider; do not automate liability |
| Crew accountability | Provider staff account, approval, assignment, status transitions, performance rollup | Fragmented | Finish same proof permissions for assigned staff; owner/manager visibility and per-event actor attribution |
| Role permissions | Broad customer/provider/provider_staff/admin roles | Fragmented | Add proof-specific capabilities and role matrix after D28; avoid shared logins and blanket admin mutation |
| Unified activity/audit | Admin actions and a small assembled booking timeline | Fragmented | Add append-only work events for status, visits, checklist, media, issues, changes, signoff, and overrides |
| Proof verification | Storage row, actor, timestamp | Fragmented | Add checksum, provenance, original/annotation relationship, verification page, and explicit confidence limits |
| Search | Booking/customer/provider/admin search surfaces | Fragmented | Search by business, property, booking, provider, staff, date, issue, model/serial, and proof category with role/PII controls |
| AI assistance | No proof-specific AI workflow | Missing/defer | Later: transcription, OCR draft, classification, redaction suggestions, summaries, translation; human confirm; never alter/fabricate evidence |
| Accounting integrations | Internal business invoice records only | Missing/defer | Export draft/invoice-ready data first; integrations require authority separation, idempotency, reconciliation, and error inbox |
| Calendar/CRM integrations | None | Missing/defer | Outbound calendar/webhook first only after event and permissions model is stable |

## Confirmed implementation defects found in this audit

The following are current-code defects, not aspirational feature gaps:

1. **Assigned staff checklist access:** provider staff could open their assigned job and were sent to the provider checklist route, while the checklist API authorized only the provider owner. Fixed as Bug UX-301.
2. **Completion timer reset by proof upload:** minimum on-site time used `bookings.updated_at`; photo writes update that field and could restart the wait. Fixed to prefer server-clocked `work_started_at` as Bug UX-302. A read-only production check found five legacy `in_progress` rows with no work-start marker, so only those rows retain the prior timestamp fallback instead of being stranded.
3. **Category-only booking checklist:** checklist category came through the optional subcategory join instead of `bookings.category_id`, so a category-only quote request could not obtain its template. Fixed as Bug UX-303.
4. **Customer checklist mutation:** the customer PATCH path could alter the provider execution checklist. Fixed as Bug UX-304; customers retain read access after provider creation.
5. **Unrelated photo satisfies checklist:** any non-deleted booking photo could satisfy a photo-required provider item. Fixed as Bug UX-305; new checklist attachments must be provider-role `checklist` proof.
6. **Admin evidence actor mislabel:** an admin-uploaded canonical photo was presented in Booking 360 as provider evidence because the API collapsed every non-customer uploader to provider. Fixed as Bug UX-306; the canonical recorded role now reaches the admin UI.

Targeted result: the six initial proof-integrity suites and 19 tests pass, the focused Booking 360 actor regression and its 51-test neighboring admin service suite pass, and both API and admin TypeScript checks are clean. Full regression and deployment are still required before these are called shipped.

## Existing proof-chain weaknesses requiring planned work

### Booking and visit time

- `work_started_at` and `work_completed_at` are server-clocked, which is sound.
- Arrival validates current coordinates but discards the coordinates and accuracy after validation.
- A booking has no visit rows, so multi-day work, return trips, diagnostic visits, corrections, and crew handoffs cannot be represented accurately.
- `completed_at` identifies provider completion but no structured end-visit summary exists.

### Photos and media

- Canonical `booking_photos` records actor, broad role, type, storage key/URL, MIME, byte sizes, and upload time.
- They do not record capture time, device time, location/accuracy, capture/import source, checksum, caption/area, visibility, consent, original/annotation relationship, upload state history, or review state.
- Legacy arrays and `booking_images` remain alongside the canonical table, increasing read complexity and duplicate risk.
- Admin currently derives uploader as only customer/provider; an admin upload is presented as provider evidence.

### Checklist

- Template version and item text are snapshotted, which is strong historical behavior.
- Section identity itself is not snapshotted independently; historical rendering still joins current template section rows.
- Empty templates allow completion as long as two after photos exist. That is an honest fallback but must create an admin quality/configuration exception, not disappear silently.
- Admin has no complete checklist execution view or audited override record.

### Change orders

- Itemized amount and payment state are stronger than a chat agreement.
- The model has no explicit reason code, schedule change, stop-work state, version number, approver identity snapshot, signed terms version, or immutable rendered authorization.
- Photos are URL arrays rather than canonical evidence records.

### Customer completion and signature

- Customer-confirmed booking status is the strongest current acceptance event.
- E19 correctly blocks treating a bitmap uploaded inside a provider/staff session as authenticated customer acceptance.
- Closeout needs accept, accept-with-exceptions, request-correction, and dispute escalation as separate choices.

### Admin/support evidence

- Booking 360's Timeline is assembled from create/complete/confirm/cancel timestamps, admin actions, and first/last chat. It is not a full activity record.
- Evidence includes legacy/canonical photos and chat count, but omits checklists, signatures, change evidence, issue history, closeout, and actual actor detail.
- GPS and receipts are permanently empty arrays because no source table exists.
- The Quotes tab does expose quote and change-order line items, but the operator must mentally reconstruct the work history across tabs.
- Support cases link to booking/customer/provider records, which is a good base for proof-linked case handling.

### Enterprise and repeat work

- Business account APIs, client services, and mobile stores exist, but there are no customer-routed business screens.
- Bookings can link a business account and contract, but not a property/site, service plan, project, or visit.
- Recurring instances create individual bookings but do not carry a durable service-location history, prior issues, equipment record, or proof template forward.
- Projects are explicitly planning-only and cannot assign a provider or convert to bookings. That honesty should remain until D28 is decided.

### Provider business value

- Client notes, reminders, quote templates, category insights, team management, calendar, and materials-list APIs are useful foundations.
- The materials list service/store has no provider screen caller.
- There is no unified lead-to-job-to-proof-to-close client/property timeline.
- Provider staff currently have jobs/invites only; the field navigation intentionally remains small but needs durable sync and issue capture.

## Third-party tester feedback applied

The private tester review supports this direction in concrete ways:

- unclear service scope means the proof record must begin with an exact, versioned scope, not only completion photos;
- dead-end custom quote concerns support a unified walkthrough/quote/authorization record;
- duplicate bookings after payment failure reinforce idempotent lifecycle and visible state;
- hard-to-find help and disputes support issue/correction/support entry from the exact job step;
- failed checklist persistence and job-photo behavior directly validate the need for one canonical evidence path;
- provider dashboard confusion supports a Today/readiness/exception hierarchy;
- provider team, certification, payout, and admin concerns reinforce truthful roles, evidence ownership, and queue-first operations;
- address failures reinforce durable property coordinates and coverage validation rather than free-text location reuse.

Tester suggestions do not authorize new payment rails, automatic refunds, warranties/guarantees, off-platform messaging, invented rankings, or unsupported service-level promises.

## Admin overhaul for proof-to-close

### Primary operations queues

Admin navigation should expose work that needs action, not merely tables:

- Work Orders needing dispatch or provider response
- Visits due/today/late with factual state only
- Proof exceptions: missing checklist template, failed uploads, unmet required evidence
- Issues and corrections awaiting owner/customer/support action
- Change orders awaiting response, payment, or expiration handling
- Closeout awaiting customer decision
- Warranty/callback records requiring triage
- Ready-to-invoice exceptions for business accounts
- Support/dispute cases linked to the work record

Exact SLA labels must remain unimplemented until staffing and policy define them.

### Booking / Work Order 360

Recommended tab structure:

1. **Overview:** people, business/property, service scope/version, schedule, provider/team, current readiness and blockers.
2. **Scope & approvals:** intake, quote, contract, selections, authorizations, immutable change versions.
3. **Visits & crew:** each check-in/out, assignment, server/device times, location evidence, delays, completion summary.
4. **Proof:** categorized originals, checklist execution, provenance, review/visibility, missing requirements.
5. **Issues & corrections:** provider issues, punch items, customer exceptions, callbacks, support ownership.
6. **Closeout:** provider submission, customer acceptance/correction/dispute action, final package readiness.
7. **Conversation & support:** linked chat, reports, cases, moderation context.
8. **Money:** authorization, held/released/refunded state, quote/change totals, invoice link. Money controls remain separately permissioned.
9. **Audit:** append-only events, admin access/mutations, override reasons, source links.

Admin must never silently rewrite original field evidence. A correction should be a new event or annotation with actor, reason, timestamp, and before/after value.

## Proposed canonical hierarchy

```text
Customer or Business Account
└── Property / Site
    ├── contacts, instructions, units/areas, service history
    ├── Project or Service Plan (optional)
    │   └── Booking / Work Order
    └── Booking / Work Order
        ├── versioned scope, quote, contract, change authorizations
        ├── Visit 1..n
        │   ├── assigned provider staff
        │   ├── check-in/out and time/location events
        │   ├── checklist execution
        │   ├── media/evidence
        │   ├── issues, materials, readings, daily summary
        │   └── visit closeout
        ├── customer closeout decision and corrections
        ├── payment/invoice references
        ├── support/dispute/warranty links
        └── append-only activity and proof package
```

An ordinary one-visit household booking can receive an implicit site and visit automatically. The UI need only show the familiar booking language.

## Delivery plan

### Phase 0: integrity and truth

- ship Bugs UX-301 through UX-306 after full regression;
- keep E05 checklist issue reporting and E19 customer-signature identity visible;
- remove any claim that current admin GPS/receipt arrays are populated;
- show actual evidence role/type and current completion blockers;
- preserve Suki E25 and all money-path holds.

### Phase 1: consolidated proof read model

No new money behavior and minimal schema risk:

- one booking proof-summary API assembled from scope, quote/change order, checklist, photos, completion, customer confirmation, support/dispute, and audit records;
- customer progress/closeout view and provider job record use the same summary;
- Admin Booking 360 shows checklist, photo type/actor, signatures with E19 warning, change evidence, completion notes, and explicit unavailable fields;
- define proof readiness and blockers as derived facts, not a mutable boolean.

### Phase 2: property/site and visit foundation

Additive schema after D28 approval:

- properties/sites, business/customer ownership, contacts, areas/units, instructions, coordinates;
- booking `property_site_id`;
- visits with booking, schedule, actor/crew, server check-in/out, submitted coordinates/accuracy, status, completion summary;
- migrate no historical meaning silently: old bookings may keep null site and receive a derived one only through an explicit safe process.

### Phase 3: evidence and issue model

- media provenance, checksum, visibility, caption/area, capture/import source, device/server times, original/annotation relationship;
- checklist item types and audited override events;
- E05 issue/punch/correction model with notifications and role ownership;
- durable mobile/browser upload outbox and status;
- pre-existing condition acknowledgement.

### Phase 4: closeout and enterprise repetition

- accept/correction/exception/dispute closeout state machine after E19 decision;
- callback/warranty linkage without automated liability;
- customer business workspace for accounts, properties, members, contracts, recurring plans, history, and reports;
- recurring visits carry approved site instructions and references without copying stale unresolved facts as truth;
- provider owner Today/readiness/exception and property-aware client record.

### Phase 5: proof package and invoice readiness

- versioned, permission-aware HTML/PDF/ZIP package;
- verification ID and audit manifest;
- invoice-ready derived gate and business invoice linkage;
- customer/provider/admin export according to role and retention policy.

### Phase 6: advanced assistance and integrations

- OCR, transcription, classification, translation, search, and drafting with human confirmation;
- calendar and outbound webhook exports;
- accounting draft sync only after authority, idempotency, reconciliation, retry, and error-inbox contracts are approved;
- reference-photo overlays and advanced trade templates after the core record proves useful.

## Deliberate boundaries

The following should not be copied wholesale into onService's first proof-to-close release:

- full general-purpose CRM, payroll, tax filing, or accounting ledger replacement;
- milestone fund movement while D27p5 remains open;
- automatic payment/refund/guarantee behavior;
- provider-private notes exposed to customers;
- public or marketing reuse of job media without separate recorded consent;
- AI-generated or AI-altered source evidence;
- AI decisions about code compliance, liability, job acceptance, or financial approval;
- unbounded external integrations before the internal event/permission model is dependable;
- complex field navigation for staff when Today, Capture, Tasks, and Sync are sufficient.

## Acceptance criteria for the product direction

This direction is complete only when:

1. Customer, provider owner, assigned staff, and authorized admin see the same underlying work record with role-appropriate detail.
2. Every scope, visit, checklist action, proof artifact, issue, approval, override, closeout decision, and support action has a truthful actor and server time.
3. Source evidence is preserved; annotations and corrections do not overwrite it.
4. Required proof and unresolved blockers are enforced server-side and visible before submission.
5. A normal household booking remains simple on phone, tablet, and desktop.
6. Enterprise customers can organize work by business and property/site without duplicating personal accounts or coordinating off-platform.
7. Provider staff can complete assigned field work without receiving owner finance/settings permissions.
8. Admin can answer who requested, approved, performed, changed, completed, accepted, disputed, and paid for the work from one linked record.
9. Closeout/package and invoice readiness are derived from canonical records, not manually asserted.
10. Full API, mobile, admin, responsive-browser, and production-deployment checks pass, with held money/legal decisions still fail-closed.

## Decision boundary

The safe integrity fixes and Phase 1 read-model work can proceed without changing money. The property/site/visit schema and whether projects become booking parents require D28 approval. E05, E19, E25, D27p5, and other recorded money/legal holds remain separate and cannot be silently bundled into this product direction.
