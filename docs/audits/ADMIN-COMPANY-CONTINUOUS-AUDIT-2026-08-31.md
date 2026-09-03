# Admin and company continuous audit, 2026-08-31

## Purpose and honesty boundary

This is the resumable record for the suspicion-first admin/company stage that follows the provider and customer desktop/linkage audits. It records what was inspected, what was changed, what was proven by executed tests, and what remains. It does not treat the existence of a route, table, button, or old test as proof that an operator workflow is feasible.

The current stage is not a declaration that every admin screen is complete. Completed or safely contained checkpoints cover the Business Account 360 read/linkage layer, business projects, the current two-workflow notification-template boundary, promo redemption controls, customer-home banners, marketing campaign records, communications moderation, support operations, Booking 360/Dispatch integrity, financial-operations truth outside the E55 business-billing hold, Customer/Provider 360 account-support authority, Catalog publishing, and the unambiguous parts of Service Areas operations. Checkpoint AB supersedes any implication that Business Account 360 is a launch-ready commercial write console. Checkpoint AC supersedes any implication that Notification Templates is already a per-channel publishing system. The remaining admin surfaces continue after these checkpoints.

Production synchronization is not claimed. Escalation E32 still records that the supplied SSH identities are rejected by the production host. Local and GitHub code may be aligned after CI, but production cannot be updated until an authorized server identity is available.

## Operating questions used on every screen

1. What real customer, provider, booking, payment, support, or company record owns the data?
2. Can an operator move from a summary to the exact underlying record and back without copying an opaque identifier?
3. Does every displayed status mean the same thing in the customer app, provider app, API, and admin workspace?
4. Does an action explain its immediate customer/provider impact, require the right authority, reject no-op or malformed input, and leave an audit trail?
5. Are empty, loading, failed, partial, stale, paginated, tablet, and desktop states honest and usable?
6. Does the screen distinguish implemented delivery from planned, manual, staged, or reference-only configuration?

## Checkpoint A: business account and project operations

### Findings

- Business Account 360 showed contracts, invoices, members, projects, and support in separate sections but did not give staff one work ledger connecting bookings to the account, customer member, provider, invoice, contract, and support case.
- Booking search could not be scoped by the canonical business account relationship.
- Invoice detail data did not expose the booking/customer/provider work lines needed to investigate a billed amount.
- Member rows and operational identifiers were frequently dead text.
- Projects implied execution controls that are not backed by a project/job workflow. The useful current function is planning and oversight, not dispatch or financial settlement.
- Dense project and Business 360 layouts did not collapse safely at tablet widths.

### Implemented boundary

- Added canonical business-account booking scope to the API and admin booking workspace.
- Added a Business 360 work tab joining booking, customer member, provider, invoice, contract, and support exits.
- Added admin invoice detail linkage to the underlying billable work.
- Converted displayed member and operational identifiers into canonical links where the related admin route exists.
- Reframed Projects as planning-only oversight and removed UI implications that it is a second job-execution or payment source of truth.
- Added responsive single-column behavior before multi-column tablet/desktop layouts.

Executed regression coverage: Bugs UX-665 through UX-671, plus the updated UX-133 project/support linkage behavior.

## Checkpoint B: notification templates

### Findings

- The editor accepted a separately entered variables list that could drift from placeholders actually used in the title/body.
- A template could be created as inactive in the UI while the service persisted it active.
- Connected runtime workflows did not declare the variables they actually supply, so syntactically valid templates could fail only when a real notification was sent.
- Missing runtime variables could silently produce incomplete customer/provider text.
- Template changes did not consistently produce a transactional admin audit record.
- The UI did not distinguish live runtime-connected slugs from reference-only rows, allowed an immutable slug to appear editable, lacked a useful preview, and had undersized or desktop-only dialog behavior.

### Implemented boundary

- Placeholder inventory is derived from the actual title and body. Malformed or excessive placeholders are rejected.
- Runtime contracts are declared for the two currently connected slugs, `new_job_available` and `booking_matched`; unsupported variables are rejected for those workflows.
- Rendering fails closed on missing runtime variables so the notification service uses its existing safe fallback rather than sending broken copy.
- Create honors `isActive`; create and update write `admin_actions` in the same transaction as the template mutation.
- API rows expose runtime connection status and allowed runtime variables.
- The admin editor locks the slug on edit, distinguishes connected from reference-only templates, previews the rendered structure, provides loading/error/retry states, and uses responsive dialogs and 44-pixel controls.

Executed regression coverage: Bugs UX-672 through UX-679.

## Checkpoint C: marketing, promo codes, and customer-home banners

### Three systems that must not be conflated

| Company record | Real client effect | Current operational truth |
| --- | --- | --- |
| Promo code | Would reduce a booking price | Launch hold. The customer entry point is hidden and the API now enforces the same server-side feature flag. Rows are staged only. |
| Customer-home banner | Text card in the customer home carousel | Connected for the `all` customer audience. Images are stored but not rendered. New/returning/provider audience labels exist in the database but no client requests them. |
| Marketing campaign | Staff-entered spend and attribution summary | Manual tracking record only. It does not send SMS, email, or push and it is not a payment ledger or verified acquisition feed. |

### Findings and changes

- Direct API calls could redeem a promo while the documented feature flag was off. `resolvePromo` now rejects redemption before database lookup when the flag is disabled.
- Promo administration omitted the per-customer limit, used raw centavos in operator fields, lacked pagination/error states, and described held rows as active. The workspace now exposes the real limit, uses PHP input, paginates, retries, and labels held rows as staged.
- Campaign channels were hardcoded in the client while the API uses configured settings. The admin now loads the server channel contract and disables creation if it cannot be verified.
- Campaign attribution counters could be overwritten directly, destroying reporting provenance. Direct edits are now rejected. The UI describes the evidence-backed adjustment trail that must exist before staff attribution editing is enabled.
- Marketing overview and campaign labels implied verified economics. They now say recorded/reported and identify the manual source.
- Reversed overview date ranges were accepted by the client. They are now blocked before a request.
- The customer app already requested `/promotions/active`, but no admin page managed those records. A separate Home Banners workspace now exposes customer-facing copy, safe CTA destinations, Manila schedules, display order, delivery truth, preview, pagination, and explicit publish/pause actions.
- Banner creation previously defaulted to live. It now defaults to draft. Unsafe CTA schemes and reversed schedules are rejected by the server.
- Clearing a banner subtitle, badge, CTA, image reference, or end date previously retained the old value because update code used null-coalescing instead of field presence. Those fields can now be cleared.
- Legacy targeted banner rows are shown as not connected rather than falsely described as delivered.

Executed regression coverage: Bugs UX-680 through UX-689.

## Checkpoint D: communications moderation

### Findings

- Conversation rows contained a provider user ID, while the Provider 360 route requires the provider profile ID. The resulting operator link could open the wrong resource or fail.
- A moderation review could be submitted without an open flag/report, and a reviewed conversation could be reviewed again. That made the review action neither stateful nor immutable.
- Repeated redaction could overwrite the original reason and actor context.
- Moderation reasons had no useful server length contract and route inputs were not consistently validated before service/database work.
- A failed statistics request was rendered as zero flagged conversations, hiding an unavailable moderation signal.
- Booking filters, tabs, and recovery controls did not collapse safely for tablet-width operator use.

### Implemented boundary

- Conversation results now expose the canonical provider profile ID and the admin exits to Provider 360 use that ID.
- Review requires an open flag/report and is rejected after review. Redaction is rejected after the first redaction so its original reason remains immutable. A valid review rationale is preserved in full in the audit record.
- Conversation IDs, queue filters, review bodies, and redaction bodies are validated at the route boundary. Reasons are limited to 3–2,000 characters.
- Failed moderation statistics are shown as unavailable with retry, not as a clean zero. List, queue, thread, and statistics failures each provide a local recovery action.
- Booking scope and moderation tabs now use responsive controls suitable for tablet and desktop browsers.

Executed regression coverage: Bugs UX-690 through UX-693 and UX-703, plus the existing communications and moderation suites.

## Checkpoint E: support operations

### Findings

- A selected case fell back to the queue row while its complete record was loading or unavailable. Staff could therefore see and act on incomplete or stale status, ownership, message, and account data.
- Queue-summary failure appeared as four zero signals. Agent-load and decision-history failures lacked complete recovery and did not consistently block dependent actions.
- Case assignment allowed no-op reassignment and ownership changes on terminal cases, did not lock the current row before deciding, and omitted the previous owner/status from its audit details.
- Participant replies automatically resumed waiting cases without adding that transition to case-decision history.
- Staff could attempt a participant-visible reply on a resolved/closed case. Conversely, the admin screen provided no way to add a private post-closure handoff or investigation note.
- Priority affected queue ordering and urgent signals, but support staff could not change it after intake and no reasoned priority history existed.
- Ticket path parameters were not consistently UUID-validated, allowing malformed identifiers to reach database-backed handlers.

### Implemented boundary

- Case detail now fails closed: until the current complete record loads, status, owner, priority, and reply controls are unavailable. The detail request has a local retry.
- Queue summary, active-agent choices, decision history, and the main queue have truthful loading/error states and recovery. Status/priority decisions are disabled if their decision history cannot be verified.
- Assignment locks the case, rejects terminal and same-owner changes, validates an active support agent, and preserves prior owner/status in the append-only admin action.
- Customer/provider replies that resume waiting cases write an atomic audit event and appear in Case decisions with the participant actor.
- Terminal cases reject participant-visible replies at the service boundary. The admin workspace offers a forced-private internal-note composer for post-closure documentation.
- Staff can change priority on active cases only after entering a triage reason. The change and reason are atomic and appear beside status and reply-driven decisions.
- All ticket-ID routes now reject malformed UUIDs before service/database work.

Executed regression coverage: Bugs UX-694 through UX-702, plus all existing support route, service, and rendered admin support suites.

## Checkpoint F: Booking 360 and Dispatch integrity

### Findings

- Booking queue summary failure could still be read as clean zero signals, while Dispatch could combine an unavailable feed with zero/empty language. Both patterns could hide active operational work.
- Dispatch used fixed viewport/map/panel heights that were brittle on tablet and shorter desktop browsers. Booking 360's six record sections did not provide a safe horizontal section rail at narrow tablet widths.
- Primary Booking 360 and its timeline, proof, quote, dispute, payment, and audit feeds could fail without an in-context recovery action.
- Reassignment offered the already assigned provider and initially implied schedule enforcement that the API did not perform.
- The API enforced approval, account state, accepting-work state, service capability, and service radius but did not reject an overlapping scheduled booking.
- Both reassignment pickers and the Dispatch map silently depended on the first 100 accepting-work provider rows. Operators could not reach a provider outside that page from the action dialog.
- Booking 360 returned raw customer/provider contact to ordinary admins even though Customer and Provider 360 require role-aware masking and audited reveal.
- Booking-admin routes let malformed booking/provider identifiers reach database-backed handlers.
- The direct admin cancellation service bypassed the canonical state-transition table. A crafted super-admin request could relabel a settled `paid_out` booking as cancelled.
- Booking actions appeared available in impossible booking/escrow states and successful actions closed without explicit operator feedback.

### Implemented boundary

- Booking and Dispatch failures now fail closed: unavailable feeds never become zero/empty operational conclusions, each failed feed has a local retry, and dependent tables/attention signals remain unavailable until recovery.
- Dispatch uses tablet-safe map and panel sizing; Booking 360 uses a scrollable, touch-sized section rail and touch-sized action fields.
- Booking 360's primary and secondary records recover in place without sending support staff away from the case.
- Reassignment excludes the current provider, explains the exact server gates, and now rejects double-booking conflicts for scheduled work.
- Both action dialogs add server-backed accepting-work-provider search. Dispatch identifies when its map is showing only the first page and preserves the API total rather than presenting the page length as the whole supply count.
- Dispatch never compares a locally filtered loaded count with the unfiltered API total, avoiding a mathematically false queue/supply summary.
- Ordinary admins receive masked booking-participant contact. Canonical Customer/Provider 360 remains the place for an audited contact reveal.
- All Booking 360 path identifiers and reassignment provider IDs are UUID-validated before service/database work.
- Admin cancellation now uses the canonical booking transition table. Settled/completed money states cannot be relabelled through cancellation; operators are directed to dispute or settlement handling.
- Visible super-admin actions are gated by booking and escrow state, all mutations prevent concurrent action switching, and successful actions provide explicit feedback.

The cancellation timing/arrival/no-show inputs still feed the live System A refund calculation. E09 remains open because the customer-facing policy editor is a different System B source. This checkpoint does not change refund percentages, legal wording, or either source of policy truth. Dispatch also continues to use saved service locations rather than claiming live GPS.

Executed regression coverage: Bugs UX-704 through UX-718, plus the existing Booking 360, Dispatch, reassignment, cancellation-transaction, proof, money-trail, and support-message suites. The reviewed visual contract now includes default/loading/empty/error states at 820, 1024, 1280, 1440, and 1920 pixels for Booking 360 and Dispatch.

## Checkpoint G: financial operations truth and payout feasibility

### Findings

- The Overview headline used commission/service-fee ledger revenue, but every category/city/tier/payment-method chart summed full completed booking value and labelled it revenue. The same screen therefore used two incompatible meanings for company revenue.
- Refund totals summed the absolute value of every refund ledger row. Wallet refunds record a negative escrow debit and a positive customer credit, so one customer refund could be counted twice.
- The payout summary treated only the legacy `processing` state as open. The launch path uses internal-review, pending, and approved states, so real provider money work could appear as zero.
- Payment intents and failed gateway refund/release retries had no company operations workspace. Support and finance could not see attempt truth and unresolved post-commit failures together.
- A manual reconciliation could omit PayMongo balance; the stored null was rendered as ₱0 with an OK/zero-discrepancy conclusion.
- Payout operators had to paste a provider UUID, ordinary admins received full destination account data, list failure still left an empty table visible, and completion called every bank/wallet reference a PayMongo transfer ID.
- Escrow and legacy sales-record APIs exposed complete counts, but the client discarded those totals and silently showed only the capped first list.
- Payout/receipt/reconciliation path identifiers were not consistently rejected before service/database work, and the provider approval notification said processing had begun before the manual transfer step existed.

### Implemented boundary

- All revenue breakdowns now use the same recognized commission/service-fee ledger as the headline. Full completed booking value remains GMV. Unlinked ledger revenue is explicitly **Unattributed** rather than silently dropped or called unknown.
- Financial Overview and the retained legacy revenue-report endpoint count the negative refund debit once. No refund percentage, transfer, escrow, or settlement rule was changed.
- Open payout counts include internal-review, pending, approved-awaiting-transfer, and legacy-processing stages, each visible separately. Missing payout storage and request failures fail closed instead of becoming clean zero/empty signals.
- Added a Payments & Refunds workspace with payment-attempt status, booking/customer exits, active retry counts, permanent-failure errors, a paginated unresolved retry queue, and a clear E14 evidence warning.
- New manual reconciliation snapshots require a verified non-negative PayMongo balance entered in PHP with no more than two decimals; the client converts it exactly to the API's integer-centavo boundary. Historical null-balance snapshots remain retained but display **Not supplied / Not compared / Expected only**.
- Payout search accepts business name, provider account-holder name, or ID and returns a human display-name fallback. Ordinary admins receive masked destination/account-holder data; super_admin retains the complete value needed for the authorized manual transfer.
- Approval copy now says the request is queued for manual transfer, and completion accepts a method-neutral external transfer reference. The action still only records an already completed external send.
- Escrow shows the exact pending count and paginates the complete pending-release queue in bounded 50-row pages. Legacy sales-record search preserves the API total and paginates instead of implying the first page is complete.
- Payout action IDs, payout status filters, receipt IDs, and reconciliation IDs fail at the route boundary when malformed. Cancellation reasons and manual reconciliation notes are bounded.
- Financial navigation is a touch-sized two-row tablet grid so no section label is clipped. Financial and Payout workspaces now have default/loading/empty/error baselines at 820, 1024, 1280, 1440, and 1920 pixels; every financial section is separately captured at 820, 1024, and 1280.

E09, E14, E18, E22, E24, and D27p5 remain open. This checkpoint did not activate external checkout, invent AMLA legal conclusions, authorize BIR documents, change cancellation percentages, release held money, or alter dispute settlement semantics.

Executed focused regression coverage: Bugs UX-719 through UX-743 plus the existing payout atomicity/RBAC/validator, reconciliation, escrow, revenue-degradation, Financials, Payouts, E22, and money-trail suites.

## Checkpoint H: Customer and Provider 360 account-support authority

### Findings

- Both 360 headers omitted support ownership, active-case urgency, and remembered-session context, so staff had to reconstruct account risk from separate screens.
- Customer dispute history omitted provider-filed disputes on the customer's bookings.
- Support-history exits scoped only to the account owner's user ID, omitting cases linked through a booking and provider-staff cases.
- Customer/provider suspension deleted refresh tokens but did not advance the session generation used to invalidate existing access tokens. Some provider-only routes also bypassed the approved-profile workspace gate.
- Provider area requests could not be reliably opened from Provider 360 because the provider filter was not applied before the queue limit.
- Provider note updates/deletes were not provider-scoped, updates lacked a dedicated transactional audit event, and the UI could not edit a note.
- Normal admins received raw provider-staff invite phone/email despite the existing masked-contact policy.
- Dense Customer/Provider 360 tab sets did not provide a stable touch-sized tablet rail.

### Implemented boundary

- Added open/urgent/unassigned support counts, current support owners, remembered sign-ins, reasoned force sign-out, and exact suspension/status effects to both account headers.
- Related customer support includes direct and booking-linked cases. Related provider support includes owner, staff, and booking-linked cases. The Support Tickets page preserves and labels that account scope.
- Customer disputes include every dispute on the customer's bookings and identify the filer; fraud-pattern aggregation remains customer-filed only.
- Customer/provider suspension advances `session_version` and deletes refresh tokens transactionally. Provider service-area and job-request routes enforce approved provider status.
- Provider 360 links into provider-filtered Service Area operations; filtering occurs before the queue limit.
- Provider notes are provider-scoped for update/delete, updates are transactionally audited, and the bounded editor handles failures visibly.
- Provider-staff invite contact is masked for normal admins and explicitly labelled as masked; super-admin retains the authorized raw view.
- Both 360 workspaces use horizontally scrollable touch-sized tab rails and responsive header/action layouts.

E29, E30, E31, E35, E36, E37, and E39 remain documented hard stops. This checkpoint did not invent active staff-assignment behavior, clear fraud markers, change wallet limits, merge onboarding state models, tighten production KYC approval without data evidence, claim global audit coverage, or create privileged admin-account lifecycle actions.

Executed regression coverage: Bugs UX-744 through UX-762. Strict Customer/Provider 360 visual comparison passed 37 tests at 820, 1024, 1280, 1440, and 1920 pixels without baseline updates, including the provider-team privacy/review state. Detailed trace: `docs/audits/CUSTOMER-PROVIDER-360-AUDIT-2026-08-31.md`.

## Checkpoint I: Catalog and Service Areas configuration authority

### Catalog findings and implemented boundary

- The admin catalog loaded through the public active-only endpoint, so an inactive service disappeared from the same workspace needed to restore it. Admin now uses a complete admin projection and can filter active/inactive records.
- Category/service/add-on mutation routes accepted malformed identifiers and generic service updates could change `isActive`, bypassing the reasoned lifecycle actions. UUID/body validation now runs before service work and generic updates cannot change lifecycle state.
- Deactivation and restoration did not consistently require a durable operator reason, lock the current record, validate the parent category, or preserve the mutation and audit in one transaction. These lifecycle actions now do all four and reject no-op changes.
- Service pricing could become internally impossible during update, and hourly editing could send a fixed base price that the client then ignored. The service validates the merged pricing state; hourly uses the hourly rate without inventing a fixed base price.
- Add-on failure had no local recovery and key controls were undersized at tablet widths. The admin workspace now provides retry, responsive composition, touch-sized controls, honest customer previews, and explicit ordinary-admin read-only behavior.

### Service Areas findings and implemented boundary

- Market creation/edit/activation/pause/default changes were available to ordinary admins and did not consistently require a reasoned atomic audit. They are now `super_admin` mutations with 10–2,000-character reasons, row locking where state is decided, and verified audit writes in the same transaction.
- Activation trusted the stored provider count. It now recomputes approved provider supply and refuses launch below `min_providers_to_launch`; the UI explains the exact shortfall. A default market cannot be paused until another active/soft-launch default is chosen.
- Market radius was silently capped by the separate provider travel-radius setting. A valid 1–100 km market boundary is now preserved independently; provider travel requests remain subject to the live provider maximum.
- Customer/public area detail exposed recruiting markets. Public detail is now limited to customer-bookable `active` and `soft_launch` statuses; the separate provider-application market endpoint retains recruiting visibility.
- Automatic waitlist matching used city without province and marked records notified even when no account received an in-app notice. It now matches city plus province, marks only successfully notified registered accounts, reports the actual count, leaves other leads awaiting contact, and provides a reasoned super-admin retry action.
- Waitlist and provider-change queues exposed raw contact data to ordinary admins. Contact and exact waitlist coordinates are now masked for ordinary admins; `super_admin` retains the operational value under the existing role policy.
- Legacy admin provider assignment/removal routes could bypass the canonical provider market/location/radius review queue. Both routes now fail closed, and the unused internal direct-write helpers were removed. Provider changes go through the reviewed request decision only.
- The Service Areas provider-count link pointed at a Providers URL that ignored its market filter. The provider list now validates and applies `serviceAreaId` through `provider_service_areas`, preserves the approved-status filter, explains the scoped view, and can clear it.
- Market, waitlist, and provider-list query/body/path fields now reject malformed pagination, enums, unknown keys, dates, Philippine ZIP codes, and UUIDs before database work. Stats distinguish all waitlist leads, awaiting notice, and notified leads, and the provider KPI counts only approved providers.

### Honest hold

E46 records a material source conflict: the recruiting SOP requires `planned -> recruiting -> soft_launch -> active`, while the current UI/API and the older training text allow direct activation from planned/recruiting/soft-launch and provide no supported intermediate transition actions. This checkpoint does not silently choose a lifecycle. The UI/API compatibility remains, the training manual now warns operators not to treat button availability as permission to skip the approved launch process, and a transition matrix remains open.

Executed focused regression coverage: Bugs UX-763 through UX-792, plus the updated catalog transaction/pricing, Service Areas validator/default/waitlist, provider queue, and public-market suites. The obsolete catalog price and service-area slug source inspections were replaced with rendered or executed behavior.

## Checkpoint J: Cancellation policy support and money-governance containment

- The admin page falsely called the versioned `cancellation_policies` table server-canonical and claimed every pricing path consumed it. The live escrow cancellation path actually reads seven `cancel_refund_*` rows from Platform Settings. E09 remains the controlling money-path escalation.
- The page was a dangerous placebo editor: changing its tiers changed Help and Terms but not the refund. The separate Settings controls could also change the refund without changing what customers read. Both mutation surfaces are now frozen under E09 without changing either set of percentages or any refund calculation.
- Admin and super-admin support staff can now compare System A (actual refund-engine settings) with System B (customer-displayed tiers) in one read-only workspace. It identifies service-price versus service-fee handling, the customer-displayed provider no-show promise, and the display-version history.
- The API gives ordinary admins read access, returns explicit `held`/`displayOnly`/`mutationsAllowed: false` governance metadata, strictly validates policy version paths, and rejects version POST/PUT attempts with 409 before database work. Forged `cancel_refund_*` updates are also rejected before a transaction.
- Support handling now requires booking/payment/timing/arrival/no-show evidence, the case-specific server-calculated outcome, and escalation when customer wording differs. It prohibits improvised percentages and unconfirmed gateway-refund promises.
- Obsolete source-content assertions that called the page wired merely because strings existed were removed. Executed route, settings-service, navigation, and rendered-page tests cover Bugs UX-793 through UX-800.
- Gate A itself still printed "cancellation policy single source" despite the verified two-source mismatch. Its blocking contract and human-readable gate record now state the narrower truth: it prevents client display-tier drift and requires E09 containment on both mutation surfaces; it does not certify unified refund authority.
- The Stitch-aligned comparison workspace was rendered and manually inspected at 820, 1024, 1280, 1440, and 1920 pixels. The first pass exposed a clipped tablet history table; tablet widths now use complete version cards and desktop widths use the table. Default/loading/empty/error contracts total 20 strict screenshots.

This checkpoint is containment, not resolution. Selecting the canonical source and final brackets remains a money/product decision under E09. No customer refund, provider compensation, service-fee rule, policy percentage, provider no-show credit, or legal disclaimer was changed.

## Verification at checkpoints D through H

- All three workspace TypeScript checks: passed.
- Admin production build: passed.
- API production build: passed.
- Full repository ESLint: passed.
- Admin full suite: 213 passed files, 1 skipped file; 323 passed tests and 3 explicit todos.
- API full locally runnable run: 575 passed suites, 1 skipped suite; 3,155 passed tests and 1 intentional skip. The Docker-dependent nginx certificate configuration test was excluded because Docker Desktop is unavailable in the local environment; CI remains the execution gate for that check.
- Mobile full suite: 495 passed suites and 874 passed tests, with 84 explicit device-baseline todos.
- Financials and Payouts strict visual comparison: 61 passed at 820, 1024, 1280, 1440, and 1920 pixels with no baseline updates during the verification run. Customer/Provider 360 strict visual comparison: 37 passed at the same reviewed width range.
- API smoke: 13/13. Environment contract: 80/80. Gate A and Gate C: passed with zero blocking/report failures. All six gate self-tests and the no-phantom-test scan passed. The N+1 heuristic retained the same 30 review locations with no unjustified marker. Money-conservation checkpoint: 115 focused state, pricing, escrow, commission, refund, and wallet assertions passed.
- `git diff --check`: passed.

## Checkpoint I local verification

- Admin full suite: 220 passed files, 1 skipped file; 327 passed tests and 3 explicit todos.
- API full run: 595 suites passed and 3,179 tests passed; one intentional suite/test skip remained. The only failure was the Docker-dependent nginx certificate test because Docker Desktop was unavailable. It is not counted as a pass and requires CI or a running Docker engine.
- Admin and API TypeScript and production builds passed; the admin build transformed 2,841 modules. Full repository ESLint and `git diff --check` passed.
- Gate A passed all 10 blocking fragments, Gate C passed all 6 blocking articles, all six gate self-tests passed, and the phantom-test scan passed. The N+1 heuristic retained 30 reviewed/justified locations and passed.
- Focused tests execute Catalog lifecycle/restoration/pricing, Service Areas RBAC/audit/capacity/default/waitlist/privacy, provider-change bypass prevention, truthful activation partial success, and the real Service Areas to Providers filter. Rendered admin tests exercise ordinary-admin read-only behavior, provider-capacity blocking, waitlist retry, reason payloads, and the scoped provider queue.
- Production remains unclaimed under E32. This verification did not access or mutate production data.

## Checkpoint J local verification

- Admin full suite: 222 passed files, 1 skipped file; 329 passed tests and 3 explicit todos.
- API full locally runnable suite: 596 passed suites and 3,176 passed tests; one intentional suite/test skip remained. The Docker-dependent nginx certificate test was excluded because Docker Desktop is unavailable and is not counted as a pass.
- Cancellation Policy strict visual comparison: 20 passed at 820, 1024, 1280, 1440, and 1920 pixels across default, loading, empty, and error states. The new baselines were generated only for the intentional comparison-workspace redesign, manually inspected, then rerun without updates.
- API and Admin TypeScript production builds passed; the Admin build transformed 2,840 modules. Mobile TypeScript, full repository ESLint, and focused API/Admin containment tests passed.
- Gate A passed all 10 blocking fragments, Gate C passed all 6 blocking articles, all six gate self-tests passed, and the no-phantom-test scan passed. The N+1 heuristic retained 30 reviewed/justified locations and passed.
- Production remains unclaimed under E32. No production data, policy value, refund amount, legal text, or server deployment was changed.

## Checkpoint K — compliance, privacy requests, and consent contracts

The compliance page was not a control center. It duplicated the Audit Log,
kept unreachable legacy NPC/BIR code, redirected one tab, and exposed a report
button that only displayed a toast. The DSR queue mixed legal claims, client-
side filtering, hidden case evidence, inconsistent validation, non-atomic
actions, an unaudited generic patch, and no canonical subject link. Public DSR
history also returned internal DPO fields. Consent publishing accepted types
the role apps could never acknowledge, and current-grant counts included stale
historical grants.

Remediation landed as Bugs UX-801 through UX-822:

- UX-801: strict server-side DSR queue scope, pagination, and request-type filter.
- UX-802: generic DSR patch retired in favor of dedicated actions.
- UX-803: DSR outcome and audit evidence now commit atomically under a row lock.
- UX-804: customer DSR responses use a public projection with internal fields removed.
- UX-805: responsive DPO case review exposes the subject request, evidence, outcome, and 360 link before action.
- UX-806: consent publication is limited to the seven client-supported consent types.
- UX-807: current grants count each user's latest decision rather than old unrevoked grants.
- UX-808: Compliance is now a truthful hold-and-evidence index with canonical workspace links and no fake report generator.
- UX-809: customers can open an HTTPS response and understand a rejection reason without false SLA wording.
- UX-810: a received request has an explicit, audited Start review claim action instead of abusing Request info.
- UX-811: NPC references preserve the actual issued docket/reference family instead of enforcing an invented mask.
- UX-812: breach-notification evidence follows the same exact-reference contract instead of retaining a second invented mask.
- UX-813: consent-source failure is a visible, recoverable error rather than a false empty history; the manager now uses tablet evidence cards, desktop tables, and factual material-change consequences.
- UX-814: the DSR completion dialog validates a complete HTTPS URL instead of enabling submission for an unusable `https://` prefix.
- UX-815: a partial successful DSR response fails closed to the empty-state contract instead of crashing the privacy workspace.
- UX-816: the DPO role can open its segregated Privacy Workspace directly from the Compliance control center.
- UX-817: operations admins see the privacy restriction without a misleading empty queue or inactive filters.
- UX-818: the server rejects completion of a received request until a Start review action has moved it into review.
- UX-819: the admin case dialog matches that lifecycle and does not offer completion before review starts.
- UX-820: malformed legacy response URLs are not presented to customers as secure response links.
- UX-821: pending material-consent route coverage now executes authentication and user scoping instead of inspecting source text.
- UX-822: material consent-publication coverage now executes the admin route and verifies the service input instead of inspecting source text.

E40 remains open. The 15-day date is contained as an internal target, and the
replacement breach-classification workflow remains held for Philippine privacy
counsel. No universal notification determination or deadline was invented.

Manual visual review covered the Compliance Control Center, DSR queue and case
review, both consent tabs, the publish dialog, and loading/empty/error contracts.
The strict follow-up run passed 60 screenshots at 820, 1024, 1280, 1440, and
1920 pixels without baseline updates. Nine obsolete fake loading/empty/error
snapshots were removed from the static Compliance screen.

Latest local verification after the accuracy pass:

- Admin: 230 test files passed, 1 skipped; 322 tests passed and 3 remain explicit `todo` items.
- API: 604 test suites passed, 1 skipped; 3,169 tests passed and 1 skipped. The Docker-dependent certificate-revocation test is not counted as locally verified because Docker Desktop is unavailable; protected CI must run it.
- Mobile: 497 test suites passed; 876 tests passed and 84 remain explicit `todo` items.
- Admin, Mobile, and API TypeScript checks passed. Full repository ESLint, API production build, and the Admin production build passed; the Admin build transformed 2,840 modules.
- The strict 60-screenshot comparison passed again on the final local code with no baseline updates.
- Gate A's exact Node emoji scan and exact tracked-source brand-color scan passed under the Windows runtimes. The Bash aggregate is intentionally not claimed locally because WSL cannot resolve this linked-worktree `.git` pointer and has no WSL Node runtime. The other eight fragments passed earlier; protected CI remains the authoritative aggregate gate.

## Checkpoint L — Analytics evidence and decision boundaries

Analytics mixed live queries, stored snapshots, and unsupported conclusions
without telling an employee which was which. Cohort values did not define
booking activity or distinguish gross booking face value from revenue.
Retention presented a deterministic score as churn prediction, included
inactive accounts, and showed a false zero while data was unavailable. Provider
quality hid one score component and its period, stopped after the first 50
rows, and exposed a recompute action even though its legacy weighting conflicts
with the approved monthly operations scorecard. Commission analytics generated
an unapproved suggested rate from that conflicted quality model. Completed
analytics also omitted the canonical `resolved` booking state.

Remediation landed as Bugs UX-823 through UX-832:

- UX-823: every visible cohort number now carries definition, source, freshness, and a decision boundary; gross booking face value is not labelled revenue.
- UX-824: provider evidence exposes every stored component, snapshot period, calculated time, and a direct Provider 360 exit.
- UX-825: quality results paginate with URL-bound state, labelled controls, and tablet-visible evidence instead of silently clipping later columns.
- UX-826: the conflicting quality recomputation route now returns the explicit E47 hold and never calls the legacy computation service.
- UX-827: automated commission-rate advice is retired; the replacement endpoint returns current settings and operational evidence only, while the old advice route returns the E48 hold.
- UX-828: retention attention signals are limited to active customer accounts.
- UX-829: `resolved` work remains in cohort booking value, quality completion, and commission evidence.
- UX-830: the weekly scheduler no longer enqueues quality recomputation, and any already queued job exits under E47 without writing a snapshot.
- UX-831: the disabled A/B launch flag now blocks list, create, result, and status routes server-side instead of relying on a hidden browser tab.
- UX-832: commission sampling now averages completed-booking counts across every approved provider, including zero-work providers, and averages gross face value per completed booking instead of mislabelling each provider's 90-day total.

E47 and E48 remain open governance decisions. Existing quality snapshots are
read-only evidence and no recomputation is allowed. Commission evidence cannot
change a rate, forecast behavior, or stand in for provider earnings. No live
commission setting, provider tier, booking, payout, or production row changed.

The old Phase 138, 140, 185, and D13 source-content checks were replaced by
executed query, date-boundary, flag, and rendered-tab behavior. Focused
verification passed 6 Admin behavior tests, the focused Analytics API behavior
suite, both Admin/API TypeScript checks, and 35 visual states. The visual contract covers
Cohort default/loading/empty/error plus Retention, Quality, and Commission at
820, 1024, 1280, 1440, and 1920 pixels. Baselines were generated for this
intentional redesign, manually inspected, and the tablet tables were compacted
after that inspection exposed hidden evidence columns.

Final checkpoint verification passed:

- Admin: 234 test files passed, 1 skipped; 326 tests passed and 3 remain explicit `todo` items.
- API after the final aggregate-query correction: 617 locally runnable suites passed, 1 skipped; 3,132 tests passed and 1 skipped. The Docker-dependent certificate-revocation test is not counted as locally verified because Docker Desktop is unavailable; protected CI remains its execution gate.
- Full repository ESLint, Admin/Mobile/API TypeScript checks, API and Admin production builds, Gate A, Gate C, all six gate self-tests, the phantom-test scan, and the strict 35-screenshot follow-up passed. The final service edit also passed targeted ESLint, API typecheck, and API production build.
- The commission evidence endpoint now reads all five live commission settings and correctly defined tier samples in one database query. The N+1 heuristic dropped from 30 to 29 reviewed locations, contains no Analytics finding, and reports no unjustified marker.

## Checkpoint M — System Settings control-plane truth

System Settings previously let stale browsers overwrite newer values while the
audit event could preserve the wrong before-state. Several rows also looked
editable even though deployed code, a launch hold, or another authority owned
the behavior. The generic JSON editor made valid operational controls needlessly
dangerous.

The completed code containment covers Bugs UX-833 through UX-849 and OPS-301:

- Single and bulk updates lock the current rows inside the transaction, reject
  stale `updatedAt` versions and duplicate bulk keys, validate a meaningful
  reason, and preserve update plus audit evidence atomically.
- Successful saves invalidate grouped and per-key caches before later runtime
  readers continue. The browser no longer presents a manual cache-clear action
  that could imply an unsuccessful write became effective.
- Every setting reports whether it is a live runtime control, release-coupled,
  intentionally held, or not connected. Non-authoritative controls are read-only
  and explain what actually owns the behavior.
- Sensitive values remain redacted and cannot be recovered through the editor.
  The history workspace identifies the actor and before/after evidence without
  turning redaction into a disclosure path.
- Marketing channels use a bounded slug list and provider tier ranking uses five
  labelled numeric weights. The page states that new ranking values affect new
  matches only.
- Commission-rate settings remain outside the generic editor. The effective-
  dated Commission Controls work and immutable booking terms are still held from
  deployment by E50's production-inventory and legacy-reconciliation checkpoint.

E49 is resolved in code only. No production setting, fee, rate, AML threshold,
refund rule, dispatch rule, or historical transaction was changed. The page was
manually reviewed and its strict contract covers default, review, loading, empty,
and error states at 820, 1024, 1280, 1440, and 1920 pixels.

## Checkpoint N — Staff & Roles operator integrity

The page correctly had two different concepts, but mutation recovery and source
failure behavior made the distinction unsafe in practice. Directory profile
actions closed before the server confirmed success, several errors instructed an
operator to retry without a retry control, company-wide totals looked filtered,
and the API service allowed an internal caller to omit the reason when adding a
profile.

Remediation landed as Bugs UX-850 through UX-855:

- UX-850: role-profile, activation/deactivation, and archive confirmations remain
  open on failure, preserve the target and reason, display the failure in the
  dialog, and close only after server success.
- UX-851: the directory source has a real retry action and remains fail-closed
  until the refetch succeeds.
- UX-852: the role-profile editor is unavailable until both role and permission
  sources load, bounds its fields to server limits, and exposes pending state
  without allowing cancellation halfway through the request.
- UX-853: the summary explicitly says its counts are company-wide and do not
  follow the result filters.
- UX-854: adding a directory profile now requires a 10-character audit reason in
  the service itself before any transaction starts; route validation remains the
  first boundary.
- UX-855: a failed admin-tier candidate search can be retried without clearing the
  operator's search.

Role-profile permission labels remain operations metadata. They do not grant or
revoke login access. The DPO tab remains the one explicit real account-role
handover on this page and retains session revocation and audit behavior. E39
remains open for governed privileged-account provisioning, deactivation,
emergency recovery, last-super-admin protection, and approval policy. This
checkpoint does not implement an ad hoc identity lifecycle.

Focused regression passed 13 Admin files and 15 tests plus the new API reason
guard. The strict Staff & Roles visual contract passed 20 default/loading/empty/
error states at 820, 1024, 1280, 1440, and 1920 pixels after manual tablet and
desktop inspection.

Broad checkpoint verification also passed:

- Admin: 258 files passed, 1 skipped; 347 tests passed and 3 explicit todos.
- API: 694 locally runnable suites passed, 1 skipped; 3,079 tests passed and 1
  skipped. The Docker-only certificate-revocation test was excluded because the
  daemon is unavailable and is not counted as a pass.
- Mobile: 506 suites and 885 tests passed; 84 device-baseline todos remain.
- Admin, Mobile, and API TypeScript checks; Admin and API production builds; and
  full repository ESLint passed.
- Gate A passed 10/10 blocking fragments, Gate C passed 6/6 blocking articles,
  all six gate self-test groups passed, and the phantom-test scan found no
  forbidden pattern.
- The N+1 heuristic retained 31 reviewed/justified locations and reported no
  unjustified marker. `git diff --check` passed.

## Next admin/company audit queue

The next continuous loop starts from the remaining admin navigation inventory
and rechecks each surface against the operating questions above. Priority order:

1. Trace every cached Tester Feedback item to customer, provider, support,
   product, and admin implications without presenting the cached snapshot as
   current production state.
2. Dashboard, Disputes, Pricing Rules, Recurring Work, Audit Log, authentication,
   Change Password, shell/navigation, and Not Found coverage not already closed by
   the operational checkpoints.
3. Update the full customer/provider/admin linkage ledger, then rerun the broad
   suites and protected CI gates before any merge or deployment decision.

Existing legal, money, production-data, and privileged-identity escalation
boundaries still apply. A page-local visual improvement is not permission to
invent legal wording, mutate production money, or bypass those controls.

## Checkpoint O: Tester Feedback privacy containment

The database-backed tester queue remains separate from marketplace reviews and
support cases. The local gitignored snapshot was rechecked without publishing
tester identities or contact data: it contains seven submissions, four logged
issue rows, and six referenced screenshots, all still marked New in that cached
snapshot. The prior production trace remains the latest production evidence and
recorded ten submissions. E32 prevents a current server/database refresh, so the
local count is not presented as current production state.

The intake and operations contract correctly preserve original evidence, named
ownership, decision notes, and append-only status history. The code audit also
identified recoverability, request-validation, ordinary-admin note-masking,
search-bound, queue-count, and tablet-layout gaps that remain queued.

The higher-severity privacy finding was that feedback images beneath
`uploads/feedback/` were served without authentication and publicly cached for
30 days. The protected Admin page therefore did not protect image evidence that
could contain names, addresses, booking context, messages, or other personal
data.

Ken approved E52 Option A on 2026-09-01. Bugs UX-856 through UX-862 now preserve
every existing file and payload while adding an authenticated record-linked
Admin evidence proxy, a header-only private screenshot pull, local browser
preview during public intake, stable relative storage identifiers, and explicit
Nginx 404 guards in both vhosts. Admin image elements and links no longer contain
raw storage paths. Legacy absolute storage identifiers remain readable through
the protected translation without a data migration.

Production is not claimed. E32 prevents a current row/file inventory and the
required staged deployment. The Nginx guard must not be activated on the server
until database/uploads/config/Git backups exist and API/Admin/form support has
been deployed and verified against old and new evidence. The operational
sequence is recorded in `docs/runbooks/tester-feedback-evidence-privacy.md`.

Local verification passed 10 focused API feedback suites/24 tests, 6 focused
Admin feedback files/8 tests, the full locally runnable API aggregate (699
suites/3,084 tests with one intentional skip), the full Admin aggregate (259
files/348 tests with one intentional file skip and three todos), API/Admin
TypeScript and production builds, full repository ESLint, and
`git diff --check`. The Admin build transformed 2,842 modules. Gate A passed all 10
blocking fragments, Gate C passed all 6 blocking articles, all 6 gate self-test
groups passed, the phantom-test scan passed, and the N+1 heuristic retained 31
reviewed locations with no unjustified marker. Bug UX-860's Docker/Nginx
execution test was attempted twice but is not counted as passed because the
local Docker daemon did not start a container before the bounded timeout;
protected CI or a working Docker host must execute it.

## Checkpoint P: Tester Feedback operator workflow

The page-local audit treated the feedback workspace as an operational case
queue, not a passive survey viewer. It found that malformed query, path, and
triage inputs could reach handlers; searches over 100 characters were silently
truncated; ordinary-admin decision history and current notes were not fully
masked; a missing feedback record appeared to have an empty history; and source
failures could be shown as zero counts, stale rows, or stale selected evidence.
The owner and history dependencies had no local recovery path, and the UI could
permit a decision without both sources being current.

Bugs UX-863 through UX-876, except unused identifier UX-877, plus UX-878 close
those page-local gaps. Request schemas now reject unknown or malformed fields
before service work. Ordinary admins receive
phone/email masking across the contact, summary, nested payload, current note,
and historical notes. Queue, detail, history, and owner failures fail closed and
offer local retry actions. Status counts identify their area/search scope. The
search control and API share the same 100-character limit. A missing submission
returns 404 from history rather than a false empty record.

Operator decisions now carry the selected record's `updatedAt` version. The API
locks the row, rejects a stale overwrite with 409, advances the version by at
least one millisecond, and writes at most one truthful audit transition when two
operators race. The Admin offers an in-place reload of the newer decision and
locks queue, filter, search, and pagination navigation while a save is pending.
Queue failure and page changes cannot leave an unrelated prior record visible.

The responsive contract was also corrected. The split queue/detail layout now
begins only when the available workspace is wide enough; 820- and 1024-pixel
tablet/browser widths use a readable stacked flow. Loading, empty, and error
states no longer include a contradictory `No feedback selected` panel, and
source-wide states use the full desktop workspace. Default, loading, empty, and
error baselines now cover 820, 1024, 1280, 1440, and 1920 pixels.

Verification passed 14 focused API suites/28 tests, 15 focused Admin files/17
tests, and 23 strict Playwright behavior/visual checks. The full locally
runnable API aggregate passed 703 suites/3,088 tests with one intentional skip;
the two Docker-only Nginx suites remain excluded and unclaimed. The full Admin
aggregate passed 268 files/357 tests with one intentional file skip and three
todos. API/Admin TypeScript and production builds, repository ESLint,
`git diff --check`, Gate A's 10 fragments, Gate C's 6 articles, all 6 gate
self-test groups, the phantom-test scan, and the reviewed N+1 scan passed.
Production remains unchanged under E32 and E52's staged privacy rollout.

## Checkpoint Q: cached feedback linkage and intake integrity

The private seven-record workstation cache was traced record by record without
publishing tester identities, contacts, opaque IDs, or raw submissions. The
accurate local count is four structured issue rows, not five: one deliberate
stress/junk row, one incomplete idea row, and two usable defect rows, with one
of the usable rows describing two failures. The earlier production trace remains
the latest server evidence at ten submissions and five structured issue rows;
E32 prevents a current refresh.

The resulting role trace is recorded in
`docs/audits/THIRD-PARTY-TESTER-FEEDBACK-TRACE-2026-08-24.md`. It carries every
cached record into its customer, provider, support, product, and admin
counterpart. It does not implement off-platform contact disclosure, individual
service/price suggestions, undefined top-provider or nearest-provider metrics,
bulk messaging, automation, refund percentages, or legal wording from tester
opinion alone.

The stress row exposed a current intake-integrity defect. Public feedback fields
were silently sliced to server caps, so an oversized submission became a
plausible-looking but incomplete research record. Bug UX-879 makes every
existing cap explicit: the browser applies matching text limits, direct requests
over those limits are rejected with a clear error, too many answer/issue fields
are rejected rather than clipped, and exact-boundary text is retained unchanged.
Historical rows and screenshots are not rewritten or deleted.

The local screenshot folder contains nine filenames but the cached JSON
references six. The three additional files are not assigned to a cached record
and are not counted as issue evidence. No production relationship or retention
decision is inferred from the workstation directory. E52's production inventory
and E21's retention boundary still govern those questions.

Verification passed the UX-879 rendered-form/service regression, the existing
feedback normalization suite, and the protected local-preview regression. The
full locally runnable API aggregate passed 704 suites and 3,087 tests with one
intentional skip. The two Docker-only Nginx suites were attempted separately
and are not claimed as passed because Docker Desktop was unavailable. API
TypeScript and the production build, full repository ESLint, and
`git diff --check` passed. Gate A passed all 10 blocking fragments, Gate C
passed all 6 blocking articles, all 6 gate self-test groups passed, the strict
phantom-test scan found no findings, and the N+1 heuristic retained 31 reviewed
locations with no unjustified marker.

## Checkpoint R: Tester Feedback exact-case handoff

The next page-local pass found that Tester Feedback kept status, app area,
applied search, page, and selected submission only in React memory. A refresh,
copied link, or support handoff reopened the default New queue and silently
selected its first row. That made an operator's case reference non-reproducible
even though the surrounding Booking, Support, Communications, Payout, Customer,
and Audit workspaces already preserve operational URL context.

Bug UX-880 makes the validated URL the queue source of truth. Status, area,
submitted search, page, and `feedbackId` now survive refresh and can be copied
as one exact handoff. Selecting a row updates only the record identifier while
retaining the queue context. A valid exact record can load even when it is not
on the visible queue page; the workspace identifies that condition instead of
replacing the requested record with the first result. Queue failure still hides
the evidence and decision controls, and pending triage still locks navigation.

The real-router regression restores a filtered second-page queue, opens a
different exact linked record, asserts the API inputs and rendered evidence,
then proves a card selection updates the URL without dropping the filters. All
19 Admin feedback test files and 21 assertions pass. The clean full Admin
aggregate passes 269 files and 358 assertions, with one existing skipped file
and three explicit todos. Admin TypeScript, the 2,842-module production build,
full repository ESLint, and `git diff --check` pass. Gate A passes all 10
blocking fragments, Gate C passes all 6 blocking articles, all 6 gate self-test
groups pass, the strict phantom-test scan reports no findings, and the N+1
heuristic retains 31 reviewed locations with no unjustified marker. The first
full Admin attempt ran concurrently with the production build and full lint;
two one-second retry assertions timed out under that machine load. Both passed
immediately together, and the full suite then passed when rerun alone, so the
failed saturated run is retained here rather than misreported as a product
failure or hidden.

## Checkpoint S: Projects planning handoff and Admin authority audit

The project pass treated the feature as the customer planning record that
exists today, not the broader provider/job system contemplated by D28. The
Admin queue loaded only the newest 200 rows, held its expanded row in component
memory, reduced milestone context, and depended on list projections for human
identity. A refresh or support handoff could not reliably restore an older exact
record. The customer detail also said a project had no provider link even when a
pre-containment legacy `providerId` was present.

Bugs UX-881 through UX-884 close the safe linkage and presentation defects:

- A validated `projectId` in the URL is the Admin selection source of truth. An
  exact known project outside the loaded rows renders in an explicit linked-
  record section, and selecting a queue row preserves unrelated URL context.
- Exact project detail now projects the customer name and legacy provider
  business name. Admin receives canonical Customer 360, customer-scoped Support,
  and Provider 360 exits rather than dead names or copied UUIDs.
- Admin milestone evidence includes the written scope and target date. Estimates
  and milestone amounts remain clearly advisory planning values, not charges or
  escrow.
- Customer copy distinguishes a legacy provider link from provider invitation,
  assignment, booking, quote, and payment. The training manual now uses the same
  planning-only boundary and directs real work to Booking 360, Dispatch,
  Financials, and Support.

The authority audit found a separate hard stop. The Admin screen and manual are
read-only, but the shared project service currently treats Admin/super-admin as
an owner for project, milestone, choice, and document writes. Those writes have
no required reason, transactionally coupled audit event, or version conflict
check. E53 records Option A, enforce read-only Admin mutations now, as the
immediate recommendation, with only specifically justified governed corrections
considered later. No authorization change was made while that source-of-truth
conflict remains open.

The responsive Admin page was inspected with fixture-backed data at 820 and
1366 pixels. Both widths had no horizontal overflow and no captured browser
warning or error. The exact outside-list record, participant exits, milestone
scope/deadline, choice, and document were visible; selecting a loaded row changed
only `projectId` and retained `source=support`. The current Stitch handoff archive
does not contain a project-specific screen, so the locked repository design
contract governed this screen: bounded workspace, solid borders, no decorative
shadow, touch-sized controls, and stacked-to-wide responsive composition.

Verification passed:

- Admin: 271 files passed, one intentional file skipped; 360 tests passed and
  three explicit todos remained. An initial full run exposed a one-second
  retry-test timeout under aggregate load; the real asynchronous behavior was
  retained with a five-second bound, the two focused tests passed, and the clean
  full rerun passed.
- Mobile: 507 suites and 886 tests passed; 84 device-baseline todos remain.
- API: 705 locally runnable suites passed, one intentional suite skipped; 3,088
  tests passed and one test skipped. The two Docker/Nginx suites were excluded
  and are not claimed.
- Admin, Mobile, and API TypeScript, full repository ESLint, Admin/API production
  builds, and Expo web export passed. The first export invocation omitted the
  required explicit `EXPO_OS=web` target and failed after bundling; the corrected
  run exported all 4,273 modules.
- Gate A passed 10/10, Gate C passed 6/6, all six gate self-test groups passed,
  the strict phantom-test scan found no forbidden pattern, and the N+1 heuristic
  found no unjustified marker. Its Projects warning is formatting over fetched
  rows, not a query inside the map. `git diff --check` passed.

Open project gaps remain explicit: full server search/pagination, project-scoped
support, customer metadata editing, complete milestone/choice/document creation,
a real provider-side project workflow, accepted provider invitation, and
project-to-booking conversion. D28, D27p5/E12, and E53 block architecture,
money, and hidden Admin-write changes. E32 still blocks production inventory and
synchronization, so no production deployment or production-data conclusion is
claimed.

## Checkpoint T: Projects full-index discovery and missing visual baselines

The next Projects audit found two safe but material defects. Admin still loaded a
fixed newest-record slice, so operators could not discover older plans by project,
customer, provider, city, or status. The newer Projects route was also absent from
the Admin Playwright screen catalog even though F#4's older 29-screen baseline had
been completed.

Bugs UX-885 through UX-887 add a dedicated read-only Admin list contract with
strict status/search/page controls, escaped wildcard search over the full joined
index, deterministic pagination, and result-wide summaries. The Admin screen now
keeps search, status, page, exact project selection, and incoming support context
in one reproducible URL. It never changes the existing customer/provider project
list response. The W15 exact-record detail handoff still works when the selected
record is outside the current result page.

The visual omission is now closed with 16 reviewed Projects baselines: populated,
loading, empty, and error at 768, 1280, 1440, and 1920 pixels. A clean second run
matched every image, and the populated state asserts no document-level horizontal
overflow at every width. The tablet and desktop results retain the Stitch-derived
bounded operator workspace, solid borders, compact evidence hierarchy, and
touch-sized controls.

Verification passed 272 Admin files/361 tests, 707 locally runnable API suites/
3,090 tests, and 507 Mobile suites/886 tests. Existing one-file/test skips and 3
Admin plus 84 Mobile todos remain explicit. The two Docker/Nginx suites remain
excluded and unclaimed. TypeScript, repository lint, Admin/API production builds,
Gate A 10/10, Gate C 6/6, six gate self-tests, strict phantom-test, N+1 review,
Playwright 16/16, and diff checks passed. The first Gate A launcher selected WSL
Bash and failed to resolve the Windows worktree/Node environment; the corrected
Git Bash run passed. E53 still prevents hidden Admin project mutations, D28 still
holds provider/booking conversion, D27p5/E12 still holds milestone money, and E32
still prevents production synchronization.

## Checkpoint U: canonical planning-project support context

The next cross-role trace found that a customer planning record could hand an
operator to the customer-wide Support queue, but the case itself could not retain
which project needed help. A later operator had to infer the plan from free text,
and the customer could not return from the case thread to the exact project. This
was an operational linkage defect, not authority to turn Projects into a second
booking or payment model.

Bugs UX-888 through UX-895 add one canonical, deliberately narrow relationship:

- Migration 164 adds a nullable project foreign key to support tickets, leaves
  every historical row unchanged, and enforces that a case identifies one
  booking or one project, never both.
- The API validates that project-linked intake uses the owning customer, exposes
  project title context in list and detail reads, and supports an exact Admin
  project filter. The Admin create-on-behalf path uses that same ownership check.
- The customer project detail opens a prefilled Support intake. The new-ticket,
  support-list, and support-thread surfaces retain the project title and customer-
  only return link. Providers do not receive access to customer planning records.
- Admin Projects opens the exact project-filtered support queue; Support shows the
  linked planning record and returns to it without losing case context. Every
  surface states that this link does not assign a provider, create a booking,
  authorize a quote, or move money.
- The shared Admin table now exposes API failure text as an accessible alert.
  Forced baseline replacement also removes stale visual evidence that still
  showed a simultaneous false empty-state message within the allowed pixel
  tolerance even though the current component's branches were already exclusive.

Executed coverage calls the real service ownership, insert, filter, join, route,
and rendered customer/Admin handoff behavior. The final local aggregates pass 274
Admin files/363 assertions with one intentional file skip and three todos; 710
locally runnable API suites/3,093 assertions with one intentional suite/test skip;
and the previously completed W17 Mobile aggregate passes 510 suites/889 assertions
with 84 device-baseline todos. The two Docker/Nginx environment suites are still
excluded and are not claimed as passes. All workspaces pass TypeScript, repository
ESLint passes, and Admin/API production builds pass. The 12 Support Queue default,
loading, empty, and error images at 1280/1440/1920 were deliberately re-captured,
visually inspected, then matched on a strict no-update run.

The existing OPS-267 financial render kept every assertion unchanged but now has
a test-local 15-second ceiling. It completed in under one second alone; the prior
five-second ceiling was exceeded only when the unbounded Windows runner saturated
fork workers. The final complete Admin aggregate used four workers and is the
claimed result; invalid process-exhaustion runs are not reported as product passes.

Gate A passes 10/10, Gate C passes 6/6, all six gate self-test groups pass, the
strict phantom-test scan reports no findings, and the N+1 heuristic reports no
unjustified marker. Its 30 broad candidate locations are pre-existing review
output, not a finding introduced by this checkpoint. E53, D28, D27p5/E12, and
E32 remain active; no hidden Admin project write, provider-project workflow,
money change, production migration, or production synchronization is claimed.

## Checkpoint V: customer-owned planning metadata

The next customer trace confirmed that the project API already allowed an owner
to update planning metadata, but the customer UI could neither maintain those
fields nor capture the planning address when creating a project. Operators could
see the record in Admin and Support, while the customer had no direct way to
correct the title, description, location, or advisory budget. That was a safe UI
and linkage gap, not permission to expand the project into execution or money.

Bugs UX-896 and UX-897 close that narrow gap:

- Project creation now accepts a planning address and states that any future
  booking confirms its own service address.
- The owner-only overview exposes title, description, planning address/city, and
  advisory budget, then saves those same fields through the existing
  ownership-checked API contract.
- Advisory pesos are converted to server centavos and bounded from zero through
  PHP 20,000,000. Blank optional values clear to `null`.
- The customer mutation deliberately omits status, provider ID, booking
  conversion, quotes, escrow, and every payment field. Existing Admin project
  writes remain held by E53.
- Exact project and project-list queries are invalidated after save so Customer,
  Admin discovery, and later project-linked Support intake use current metadata.

Focused executed renders cover desktop owner editing and tablet project creation.
A fixture-backed real browser session at 820 pixels saved and re-rendered the
updated title, address, city, and advisory budget without horizontal overflow.
The 1366-pixel desktop session rendered the full customer navigation workspace,
exact project context, and support exit without browser errors. Full aggregate
Mobile verification passes all 512 suites and 891 assertions with 84 existing
device-baseline todos. Every workspace TypeScript check, repository ESLint, and
the 4,273-module production web export pass. Gate A passes 10/10, Gate C passes
6/6, all six gate self-tests pass, the strict phantom-test scan reports no
finding, and the N+1 heuristic reports no unjustified marker among its 30
pre-existing review locations.

E53, D28, D27p5/E12, and E32 remain active. This checkpoint does not authorize a
provider project workspace, Admin mutation, project-to-booking conversion,
milestone money, production migration, or production synchronization.

## Checkpoint W: complete customer milestone and choice context

The next customer trace found that project milestones and choices could be
created, but the milestone form captured only a title and the choice form omitted
its existing detail field. That left scope, planning budget, target date, model,
finish, and supplier context trapped outside the planning record. The work stayed
within Option A: projects organize planning, while bookings remain the source of
truth for provider work, schedules, quotes, transactions, payments, refunds, and
support adjustments.

Bugs UX-898 and UX-899 add optional milestone description, bounded advisory
amount, real-calendar planning target date, deterministic ordering, and optional
choice detail. The advisory amount is converted to centavos but is explicitly not
a quote, charge, escrow hold, or approved price. The mutation omits status,
booking, provider assignment, and every money-authority field. Bug UX-900 closes
a defect found during live browser inspection: the API retained milestone scope,
but the customer card did not render it back after save.

Focused executed renders cover tablet milestone validation/submission, desktop
choice detail submission, and saved milestone-description visibility. A
fixture-backed browser session created and re-rendered both records at 820 pixels,
then verified the role-aware customer workspace at 1366 pixels. Both widths had
zero horizontal overflow and the browser recorded no error. The complete Mobile
aggregate passes 515 suites and 894 assertions with 84 existing device-baseline
todos. All workspace TypeScript checks, repository ESLint, the 4,273-module
production web export, Gate A 10/10, Gate C 6/6, all six gate self-test groups,
the strict phantom-test scan, the N+1 review, and `git diff --check` pass. The
first Gate A launcher followed the Windows WSL file association and could not
resolve the linked worktree or Windows Node runtime; the direct Git Bash rerun is
the claimed gate result.

Existing milestone/choice editing or removal and document creation remain open.
E53 still holds conflicting Admin project writes, D28 still holds provider and
booking conversion architecture, D27p5/E12 still holds milestone money, and E32
still prevents production synchronization.

## Checkpoint X: customer planning-record maintenance

The next trace closed only the correction actions that are safe under Option A.
Customer owners can now edit or remove planning choices and edit or remove a
milestone before it starts. Every removal uses an in-app impact confirmation
that says the planning item cannot be restored and that removing it does not
cancel a booking or payment. Started and completed milestones remain visible
history and expose no customer edit/remove action.

Bugs UX-901, UX-902, UX-904, and UX-905 execute the exact customer payloads,
date validation, pending-only milestone controls, and confirmation-before-delete
behavior. Bug UX-903 executes the strict bounded API route and rejects blank or
unknown booking/status fields. SEC-016 proves the new choice-update service is
customer-owner-only; an Admin account does not inherit authority from the older
E53-held project contract. Correction payloads contain no status, provider,
booking, quote, commission, refund, escrow, or payment field.

The 820-pixel browser pass exposed a cramped milestone action row. The repaired
layout moves those actions below the milestone content, keeps the full action
words visible, and has zero document-level horizontal overflow at 820 and 1366
pixels. The accumulated development log includes expected framework warnings
and transient Metro-disconnect entries caused by restarting the local server, so
this checkpoint does not claim a zero-log browser session.

Mobile passes 519 suites and 898 assertions with 84 existing device-baseline
todos. The locally runnable API passes 712 suites and 3,095 assertions with one
intentional suite/test skip; the two Docker/Nginx environment suites remain
excluded and unclaimed. All workspace TypeScript checks, repository ESLint,
API/Admin production builds, the 4,273-module Expo web export, Gate A 10/10,
Gate C 6/6, all six gate self-test groups, the strict phantom-test scan, the
30-location N+1 review, and `git diff --check` pass.

Bad news retained: the older server deletion and Admin-write paths do not yet
provide an approved immutable/versioned history contract. E53 therefore remains
open. Document creation, provider planning, project-to-booking conversion,
milestone money, production migration, and production synchronization also
remain outside this checkpoint under D28, D27p5/E12, and E32.

## Checkpoint Y: private project planning images

This trace closes first-party image attachment without making Projects a second
work-order, provider-assignment, or money system. The customer owner can attach
a labelled JPG, PNG, or WebP reference. The API performs extension, MIME, size,
and image-content checks, stores the object privately, and persists an opaque
storage key. Every project projection now redacts `file_url`, including old
external references, and returns only a secure access endpoint.

The customer owner and Admin can mint a tamper-evident link with a 120-second
lifetime. A legacy linked provider cannot. The Admin operator sees the image in
the exact project record through an in-console preview, not a popup, direct
storage address, edit control, or delete control. Closing the preview revokes
the temporary browser URL. Existing Nginx configuration already rejects direct
requests to `/uploads/private-artifacts/`.

Bugs UX-906, UX-907, and UX-908 execute the customer picker/upload/open flow,
strict multipart route, and Admin preview. SEC-017, SEC-018, and SEC-019 execute
owner-only persistence, provider denial plus signed download verification, and
raw URL redaction. Customer browser checks at 820 and 1366 pixels and Admin
checks at 820 pixels report zero horizontal overflow. The form exposes Plan,
Permit, Contract, Photo, and Other as human labels and remains disabled until a
label and image are selected. Existing development-only React Native Web and
reduced-motion warnings remain, so this checkpoint does not claim a warning-free
browser log.

Mobile passes 520 suites and 899 assertions with 84 device-baseline todos. Admin
passes 275 files and 364 assertions with one skipped file and three todos. The
locally runnable API passes 716 suites and 3,099 assertions with one intentional
skip. Its complete local run had only the two Docker-dependent Nginx failures
because Docker Desktop is unavailable; those are not counted as passes.
TypeScript, repository lint, API/Admin production builds, the 4,273-module Expo
web export, Gate A 10/10, Gate C 6/6, all six gate self-test groups, strict
phantom-test scanning, the N+1 review, and diff checks pass.

Bad news retained: PDFs are not yet accepted; legacy external rows are hidden
but cannot be opened until production inventory and migration; and the older
raw-URL creation/deletion routes remain under E53/D28 without approved
immutable/versioned audit history. Provider planning, project-to-booking
conversion, milestone money, and production synchronization remain outside W21
under D28, D27p5/E12, and E32.

## Checkpoint Z: recurring customer-to-support linkage

This trace keeps bookings as the commercial, work, and money source of truth.
A recurring series only plans future visits. It does not rewrite a source
booking, generated booking, payment, refund, commission, or transaction.

The prior Admin page was only a list plus cancellation action. It did not let a
support operator inspect the completed source booking, generated booking
history, current provider link, or booking-specific support records. Its queue
counts described only the current page, full customer-name search failed, and
the customer list and detail silently stopped after 20 records. Cancellation
also committed before its Admin action, so an audit-write failure could leave a
changed series behind an error response.

Bugs UX-909/910/913 and OPS-321 add whole-result support metrics, strict
URL-preserved discovery, an exact-series workspace, canonical Customer 360,
Provider 360, source-booking, generated-booking, and Support exits, plus atomic
reasoned cancellation. Bugs UX-911/912 expose all customer series and generated
history through explicit pagination. Bug UX-914 preserves the customer's typed
cancellation reason after a server rejection so retry does not erase their
work. SEC-020 blocks provider, provider-staff,
and Admin identities from the customer recurring API. SEC-021 requires an owned,
customer-confirmed, completed fixed-price source booking for the same service.
SEC-022 rejects malformed Admin controls before database access. SEC-023 does
the same for customer UUID, pagination, calendar-date, cancellation, and
attempt-history controls before service or payment-method access.

The operator cancellation dialog explicitly says that only the future recurring
series stops. Existing generated bookings and transactions stay in their
canonical workflows. The exact-series panel also labels the E20 manual-payment
boundary and D29/E41 provider-assignment hold instead of presenting legacy
stored preferences as active behavior.

Fixture-backed Admin browser checks at 820 and 1366 pixels covered the queue,
exact-series support workspace, linked records, failure/support history, and
cancellation impact dialog with zero horizontal overflow. A warning-free
console is not claimed. Admin passes 276 files and 365 assertions with one
skipped file and three todos. Mobile passes 522 suites and 901 assertions with
84 device-baseline todos. The locally runnable API passes 723 suites and 3,106
assertions with one intentional skip; the two Docker/Nginx suites remain
excluded and unclaimed.

All workspace TypeScript checks, repository lint, API/Admin production builds,
the 4,273-module Expo web export, Gate A 10/10, Gate C 6/6, all six gate
self-test groups, strict phantom-test scanning, the 30-location N+1 review, and
diff checks pass. The initial export command omitted `EXPO_OS=web` and correctly
failed the native EAS configuration guard; the deterministic web-target rerun
is the claimed pass. E20, D29/E41, and E32 remain active. No automatic charge,
provider-assignment redesign, master promotion, or production deployment is
claimed.

## Checkpoint AA: pricing-rule publication control

The former Pricing Rules page could omit category and service-area scope, which
made a new row global; database defaults activated it immediately; a valid 0%
platform surge share was converted to 50%; ordinary admins could mutate it;
published terms could be edited or hard-deleted; and no booking-authoritative
preview explained the winner or provider/platform allocation.

Ken approved E28/E54 Option A. Bugs OPS-322 through OPS-326 implement an
inactive audited draft, draft-only editing, canonical service/area preview
through the booking resolver, preview-bound atomic publication, and reasoned
retirement without deleting rule or booking history. SEC-024 restricts every
mutation to super-admin. SEC-025 rejects a preview after the active rule set
changes. SEC-026 retires the old direct create/update/toggle/delete entry points.
SEC-027 rejects stale browser edits. Bugs UX-915/916 add explicit scope and
lifecycle evidence, a global-scope warning, responsive tablet cards and desktop
table, read-only ordinary-admin posture, representative sample controls, winner
and overlap evidence, exact customer/provider/platform amounts, and separate
publication and retirement reasons. Existing booking financial snapshots are
not updated.

The code checkpoint is `db98bbb` on the money-path topic branch. All workspace
TypeScript checks, repository ESLint, and API/Admin production builds pass.
Admin passes 278 files and 367 assertions with one skipped file and three todos.
Mobile passes 523 suites and 902 assertions with 84 device-baseline todos. API
passes 732 suites and 3,109 assertions; its only two failures require Docker to
launch Nginx and are environmental, not counted as passes. Docker Desktop was
started but its engine did not become ready, so migration 165 and those two
Nginx checks remain honestly unexecuted.

Production is not changed. The runbook at
`docs/runbooks/pricing-rule-publication.md` requires a private inventory of
every existing rule, global scope, overlap order, and referencing booking count
before migration. E32 still blocks server inspection and synchronization. No
master merge, GitHub push, production migration, or live publication is claimed
at this checkpoint.

## Checkpoint AB: Business Account 360 commercial-control re-audit

Checkpoint A correctly improved navigation and read linkage, but it did not
prove the financial workflow behind the screen. This suspicion-first re-audit
traced the customer business client/store, public business routes, booking
price resolver, account/member/contract services, invoice generator, Admin
routes, Business Accounts queue, Business Account 360, Booking Operations,
database migrations, tests, D-phase200, D28, E14, E22, and operator guidance.

### Screen and field findings

| Surface or control | Actual behavior | Audit result |
| --- | --- | --- |
| Business Accounts search/status/page | Searches company, city, or contact and filters known statuses | Useful read queue; API query validation remains manual |
| Approve | Direct ordinary-admin `pending -> active` update | No reason, transaction audit, stale guard, or reviewed contract/billing readiness |
| Suspend + reason | Direct ordinary-admin `active -> suspended`; reason overwrites/generalizes `notes` | UI falsely says audit + notification; neither exists; existing work is not cancelled |
| Owner/member links | Opens canonical Customer 360 record | Useful linkage; Admin cannot govern member permissions or view membership history |
| Account manager | Super-admin, active account/profile validation, reasoned transactional audit | Correct implemented boundary; does not reassign support cases or grant business access |
| Volume discount | Account-level percentage read later by generator | UI is super-admin-only, API is ordinary-admin; no reason/audit/version/notice/effective date |
| Monthly credit limit | Stored account value | No enforcement was found in booking or invoice generation; label implies a control that is not operational |
| Contracts | Read-only Admin list of service, provider, type, frequency, rate, discount, estimate, dates, renewal flag, status | No Admin lifecycle evidence; customer API permits reasonless status changes from any state; auto-renew is not implemented |
| Bookings & support | Exact `bookings.business_account_id` scope with customer/provider/support/dispute/invoice exits | Correct read relationship and safest part of the workspace |
| Generate invoice | Immediately inserts a `sent` prior-month record | No preview, readiness gate, reason, approval, manifest, or exact-account booking predicate |
| Invoice detail | Opens line items and underlying Booking/Customer/Provider records | Useful retained evidence; can reveal legacy unlinked or incorrectly selected work |
| Mark paid | Any ordinary admin supplies arbitrary non-empty text | No amount, method, date, currency, gateway/bank evidence, uniqueness, reason, version, or transactional audit |
| Customer enterprise workspace | API service and Zustand store only | No routed screens; former route constants were removed as dead links |
| Checkout business selection | Optional API field only | No client sends it; unresolved account/contract silently falls back to a personal booking |

### Cross-role and financial-truth findings

1. The invoice CTE joins `business_members` to bookings by customer. It does
   not require `bookings.business_account_id = account.id` and does not exclude
   removed members. This can invoice personal work, duplicate one member's work
   across accounts, and make later selection depend on current membership.
2. Migration 129, D-phase200, Business Account 360, and Booking Operations all
   establish the explicit booking account link as source of truth. The invoice
   generator is the contradicting implementation.
3. Contract price is correctly snapshotted into the booking and the financial
   terms record. Existing booking amounts are not recalculated when a contract
   later changes. The unsafe part is eligibility/publication and downstream
   invoice selection, not retroactive booking repricing.
4. Account discount is applied only when an invoice is generated. Generated
   invoice totals remain stored, but there is no effective-dated approval
   evidence tying the discount version to the billed work.
5. E22 means these retained records cannot be presented as proof of an
   authorized Philippine principal invoice. E14 means a typed external
   reference cannot be treated as verified PayMongo collection.
6. D28's property/site, visits, proof readiness, corrections, and invoice-ready
   gate remain planned. Their absence must not be disguised with extra Admin
   fields or a second money source of truth.

### Test-quality finding

The existing per-account generation test proves only that an account UUID is
passed as SQL parameter three. It does not execute invoice selection against a
real schema, and it preserves the unsafe current-member join. The
contract-booking test proves the positive contract case and ordinary no-account
case, but has no explicit-account/no-contract fail-closed case. No test proves
payment evidence or an admin audit because neither exists.

### Result and hold

No B2B financial behavior was changed in this checkpoint. E55 records the
required hard stop, exact production inventory, and recommended Option A. The
operator manual and launch limitations now remove the false claim that this is
a ready billing console. Existing records must be preserved. E32 prevents the
production inventory, so no account link, invoice item, payment reference,
contract, or status was backfilled or edited.

## Checkpoint AC: Notification Templates runtime and publication re-audit

Checkpoint B fixed placeholder integrity, fallback safety, audit coupling, and
the page-level preview, but it did not prove the channel labels or publication
authority. This re-audit traced the Admin page, validators, routes, service,
schema, seeded rows, notification resolver, in-app persistence, Expo push, and
operator manual.

### Findings

- Only `new_job_available` and `booking_matched` consult the template table.
- Both feed one in-app notification record and its best-effort push. No template
  path sends SMS or email.
- The stored `channel` field is not read by those delivery calls. Calling `all`
  multi-channel or changing a connected row to SMS/email was false authority.
- Inactive, missing, malformed, or deleted connected rows do not suppress the
  notice. The built-in title/body continues to send.
- Ordinary admins could create and edit customer/provider copy even though the
  documented role boundary makes configuration publication read-only for that
  tier. Only delete was previously super-admin-only.
- Create/update/delete audit JSON did not uniformly require an operator reason,
  and a no-op update could still manufacture a change record.
- The one-row-per-slug schema has no channel variant, locale, immutable version,
  draft/published state, effective date, test-send evidence, outbox attempt, or
  delivery receipt. ADMIN-SPEC Module 11 remains a target, not present behavior.

### Implemented containment

- Runtime projections now declare both actual channels independently of the
  legacy stored marker. Connected channel mutation to SMS/email is rejected.
- The Admin page says in-app plus push, labels all other channels metadata-only,
  explains fallback behavior, and lists unsupported test-send/version features.
- Ordinary admins retain support visibility but every lifecycle mutation is
  hidden and independently rejected by the API. Super-admin create, edit,
  activate, deactivate, and delete require a 10-to-2,000-character reason.
- Route validation and service validation agree, no-op updates fail before
  database work, and the reason is stored with the transactional Admin action.
- Existing rows, recipient selection, fallback copy, and send behavior remain
  unchanged. No migration or external provider was introduced.

Executed coverage is Bugs OPS-365 through OPS-370, SEC-035, and rendered Bugs
UX-1020 through UX-1022, plus the updated UX-672/674/676/677 and historical delete tests.
API TypeScript and `git diff --check` pass locally. Local Jest still fails before
test loading on an EPERM dependency read; Admin TypeScript fails before project
code because `node_modules/vitest/globals.d.ts` is missing; local Vitest has the
same OneDrive dependency traversal failure. These are not passes.

The first clean GitHub run `33598842096` caught that the new delete request used
an Axios-style `data` option unsupported by the native fetch wrapper. Bug
UX-1022 corrects it to `body` and executes the exact reason payload. The next
run `33599191970` passed Admin typecheck/build but caught that UX-1020 asserted a
loaded row before its query settled; the assertion now waits for the real row.
Commit `78877fc` passes GitHub CI `33599836234` and Gates `33599836315`, including
complete API, Admin, Mobile, Docker image build/liveness, and all five gates.
Neither workflow supplies authenticated browser or production evidence.

E66 records the unresolved scalable architecture and recommends staged,
immutable event/locale/channel versions with preview, test-send, outbox,
idempotency, consent/preference enforcement, and delivery evidence. No SMS,
email, locale, migration, or production publication is authorized. Master and
production remain unchanged under E32.

## Checkpoint AD: Analytics and Marketing accuracy re-audit

The later accuracy pass found that the Analytics Quality footer used the first
score-sorted row as its freshness timestamp. A lower-scoring provider with a
newer snapshot therefore remained invisible in the page-level freshness claim.
UX-1028 now derives the newest timestamp across the visible evidence rows.

Marketing's route and screen already omitted direct attribution editing, but
the underlying service still accepted and overwrote signup, first-booking, and
revenue counters from an internal caller. OPS-373 rejects those fields before
database work, preserving provenance until an evidence-backed adjustment
ledger exists. Campaign creation rejected an end date before its start date,
but editing did not. OPS-374 validates the proposed end date against the stored
start date before applying an update.

The current operational boundary is now explicit:

- campaign rows are manual tracking records, not a messaging delivery system,
  payment ledger, or verified acquisition feed;
- attribution counters are immutable through ordinary edits;
- Home Banners is the connected customer-home surface;
- promo redemption remains feature-flagged off even if staged rows exist;
- budget approval, audience execution, sends, and attribution adjustments are
  not implemented authority.

Commits `95f4cc9`, `d8e99f4`, and `c87169a` pass GitHub CI
`33616036732`, `33616743937`, and `33619612610`, plus Gates
`33616036700`, `33616743915`, and `33619612351`. API TypeScript passed
locally. Local Jest and Vitest failed before target loading because OneDrive
denied dependency or config reads, so those attempts are not counted.

The committed Marketing Playwright images do not show the current Home Banners
tab or manual-attribution warning and are stale for this branch. An attempted
local Admin render reached the login page, but no production credential or
unsafe authentication bypass was used. Fresh authenticated Marketing and
Analytics capture remains open. No production campaign, attribution, booking,
payment, or budget record changed.

## Checkpoint AE: Data Protection operator linkage re-audit

Checkpoint K correctly established the segregated DPO queue, dedicated atomic
actions, public/private response boundary, internal-target wording, and
customer/provider 360 exits. Two company-operation gaps remained in the actual
case dialog.

First, `provider_staff` is a real authenticated subject role, but the DSR query
resolved only a provider owner through `providers.user_id`. Staff privacy cases
therefore had no company-record exit. OPS-375 now uses the same deterministic
single-provider precedent as Support to resolve the staff membership, and
UX-1029 opens the employing Provider 360 record. Second, claimed cases showed
only a raw handler UUID. OPS-376 joins the current handler identity and UX-1030
shows the name and email needed for DPO handoff and collision avoidance.

Commit `8425669` passes GitHub CI `33620981564` and Gates `33620981562`.
Commit `fa3af82` passes GitHub CI `33621702556` and Gates `33621702582`.
Both clean runs include API, Admin, Mobile, Docker image/liveness, and the
repository gates. API TypeScript and diff checks passed locally; the focused
local Jest/Vitest processes failed before target loading on OneDrive reads and
are not claimed.

The re-audit also found that provider-staff accounts have no profile, password,
session, account-data, or Data Rights workspace. Reusing the customer erasure
screen is unsafe because E43's DSR/deletion relationship is unresolved and the
deletion pipeline has no approved provider-staff assignment/historical
attribution contract. E69 records the recommended shared role-aware account and
privacy architecture. E21 still holds the retention matrix and E40 still holds
identity-verification/deadline evidence and legal wording. No held policy was
invented, and no user, staff membership, assignment, erasure, or production
record changed. The changed case dialog needs fresh authenticated visual
capture before its prior screenshots can be treated as current.

## Checkpoint AF: Financial case linkage and manual payout truth

The next finance pass followed failed payouts and held escrow from dashboard
signals into the exact company records an operator must investigate. Failed
payout identifiers now open the exact payout record, provider names open
Provider 360, and held escrow releases retain booking/customer/provider IDs so
Financials can open all three canonical records. A missing platform escrow
wallet now makes the escrow workspace unavailable instead of manufacturing
believable zero balances and an empty queue.

The payout action language was also reconciled with the launch money path.
Approve queues a manual transfer and does not send money. Reject returns the
full wallet reservation. Record sent is available only after an external
transfer and records that evidence without initiating the transfer. The page
uses its in-app action dialogs as the confirmation boundary and no longer adds
a second browser confirmation.

Commits `c1445e5`, `1c3b98f`, `e300305`, and `873f40f` pass GitHub CI
`33662964046` and Gates `33662964052` at the final checkpoint head. Focused
coverage is OPS-384/385 and UX-1045 through UX-1048. E14, E18, E22, E24, E37,
and the production-access hold remain active. No payout, escrow, wallet,
booking, payment, reconciliation, or production record changed.

## Checkpoint AG: consent publication and effective-date activation

The consent manager recorded a future effective date but the customer/provider
pending-consent query ignored it. A future material version could therefore
interrupt users immediately, even though the retained evidence said it would
start later. Ken approved the prospective scheduled-activation boundary on
2026-09-03.

OPS-386 now excludes future material publications before choosing the latest
active version for each consent type. This preserves an earlier active material
version until its successor starts. Missing or malformed timestamps on legacy
events use their original publication time without rewriting history, and a
second service boundary rejects a future row using the same database clock.
UX-1049 removes the duplicate browser confirmation and makes the in-app publish
dialog distinguish routine evidence, current material activation, and future
scheduled activation. Publication is recorded immediately; re-consent starts
only when the selected Philippine effective day begins.

No consent record, publication event, historical grant, database schema, or
production row was changed. API focused verification passes 2 suites and 8
tests, including the new current/future/missing/malformed boundary. API and
Admin TypeScript plus focused repository lint pass. The local Admin Vitest
worker timed out before importing the rendered test in both fork and thread
mode, so UX-1049 is not claimed locally. Protected CI `33675720980` passed the
full rendered Admin Vitest suite, Admin and API TypeScript, the Admin build, the
full API and mobile suites, and the Docker image boot/health check at final
commit `15711b6`. Protected Gates `33675721045` passed A through E and the
`All gates passed` rollup at the same commit.

## Checkpoint AH: B2B control audit constraint

The post-E71 Audit Log trace found that the approved E55 business-control code
used first-class `business_account`, `business_contract`, and
`business_invoice` audit targets, while migration 166 added only the new action
verbs. The live `admin_actions_target_type_check` definition inherited from
earlier migrations did not allow those three targets. Any account approval,
contract publication, statement preparation, payment evidence, adjustment,
reversal, or void would therefore reach its required audit insert and roll the
transaction back.

OPS-387 adds migration 169. It appends the three targets to the constraint
definition while preserving every earlier target and retaining rejection of
unknown values. Its PostgreSQL integration test creates an isolated schema,
executes the migration, accepts old and new target rows, and confirms an
unknown target still fails with SQLSTATE 23514. This is a forward-only
constraint widening: it changes no account, contract, booking, statement,
payment, adjustment, or existing audit row.

Local API TypeScript and `git diff --check` pass. The machine-level npm shim is
broken and direct Jest loading is blocked by the recorded Windows/OneDrive
dependency-read failure, so no local Jest pass is claimed. Protected CI
`33677946534` passed the PostgreSQL integration test, full API/Admin/mobile
suites, both TypeScript checks, Admin build, and Docker boot/health at commit
`fd4ab60`. Protected Gates `33677946496` passed A through E and the rollup. E32
still prevents production migration or server synchronization, and E56 still
keeps company booking and provider settlement disabled.

## Checkpoint AI: B2B audit-to-operator linkage

The database repair makes B2B decisions recordable, but the Admin Audit Log
still treated the new targets as unknown. Account events, contract events, and
statement events displayed as inert text, so an operator investigating a
commercial decision could not return to the owning Business Account 360 from
the timeline.

UX-1050 recognizes all three first-class B2B targets. Account events link by
their target ID; contract and statement events use the immutable
`businessAccountId` retained in their before/after evidence. Missing or invalid
linkage remains inert instead of constructing an unsafe route. The rendered
regression fixture verifies account, contract, and statement rows all link to
the same owning business record.

`git diff --check`, local Admin TypeScript, and focused ESLint pass. Local
Vitest reached no import or assertion because its fork worker timed out waiting
for the Windows/OneDrive dependency tree, so no local rendered pass is claimed.
Protected CI `33679048906` passed the full rendered Admin suite, Admin and API
TypeScript checks, the Admin production build, full API and mobile suites, and
the Docker image boot/health check at commit `544dea5`. Protected Gates
`33679048898` passed A through E and the `All gates passed` rollup at the same
commit. No customer, provider, account, contract, statement, payment, audit, or
production record changed.

## Checkpoint AJ: exact B2B audit handoff and durable account workspace state

UX-1050 made controlled B2B audit rows navigable, but contract and statement
events still opened the Business Account 360 Overview tab. The operator then
had to find the relevant workspace and statement again, and the page kept its
tab and selected statement only in local component state. Reloading, using
browser back/forward, or sharing the URL discarded that investigation context.

UX-1051 gives Business Account 360 validated URL-backed tab and statement
selection. Contract events enter the Contracts tab, while statement events
open the Invoices tab and load the exact retained statement evidence by ID.
Changing tabs and opening or closing a statement updates that URL state; an
invalid tab falls back to Overview and an invalid statement ID is not queried.
The invoice list component retains local selection when embedded without a URL
controller, so existing isolated uses are not broken.

Admin TypeScript, focused ESLint, and `git diff --check` pass. The focused
Vitest invocation started but both fork workers timed out before transform,
setup, import, or assertion, so no local rendered pass is claimed. Protected CI
`33680853015` passed the full rendered Admin suite, Admin and API TypeScript
checks, the Admin production build, full API and mobile suites, and the Docker
image boot/health check at commit `84e3ea1`. Protected Gates `33680853086`
passed A through E and the `All gates passed` rollup at the same commit. No
account, contract, statement, payment, audit, or production record changed.

## Checkpoint AK: global Business Account operator search

The Admin command search covered customers, providers, bookings, support cases,
disputes, and payouts, but omitted Business Accounts. An operator supporting an
enterprise customer could not find its canonical Business Account 360 by
company, contact, owner, registration number, or tax identifier unless they
first navigated to the separate account list.

OPS-388 adds a seventh fixed, bounded search query for Business Accounts and
UX-1052 renders those results as a distinct `Business account` record type. A
match opens the canonical `/business-accounts/:id` workspace. Company,
account, owner, contact, registration, and tax values can be used to locate the
record, but registration and tax identifiers are never returned in search
results, and returned phone and email context uses the established masking
policy. The search remains restricted to admin and super-admin roles by the
existing route guard.

The first uncommitted implementation inserted the database query in a different
position than its result destructuring. The focused API test exposed that rows
could be assigned the wrong entity type, so the ordering was corrected before
commit and both regression fixtures now follow the query contract.

Local API and Admin TypeScript checks and focused ESLint pass. The two focused
API behavior tests pass, covering cross-entity ranking, masking, canonical
routing, and Business Account search-only identifiers. Both fork and
single-thread local Vitest attempts timed out before transform, setup, import,
or assertion in the Windows/OneDrive environment, so no local rendered pass is
claimed. Protected CI `33682486985` passed the full rendered Admin suite, Admin
and API TypeScript checks, the Admin production build, full API and mobile
suites, and the Docker image boot/health check at commit `dd8a4ff`. Protected
Gates `33682486914` passed A through E and the `All gates passed` rollup at the
same commit. No customer, provider, business account, booking, support,
payment, audit, or production record changed.

## Checkpoint AL: Booking 360 business billing trace

Booking records can retain a Business Account, governing contract, immutable
account terms version, billing mode, and commercial statement items. Admin
Booking 360 exposed none of that context. An operator handling a dispute,
refund, reassignment, or enterprise support case could see the customer and
provider but could not determine which commercial agreement governed the work
or which statements claimed it.

OPS-389 extends the existing read-only Booking detail query with the linked
Business Account, contract, immutable terms version, billing mode, and every
commercial statement that contains the booking, including voided history. The
response derives a linkage state without changing stored history. Controlled
records with missing or cross-account links are marked inconsistent; older
pre-control records remain visibly `legacy_unreviewed` rather than being
silently reclassified.

UX-1053 adds a responsive Business billing context card to Booking 360. It
links to the canonical Business Account workspace, its Contracts tab, and each
exact statement in the Invoices tab. It shows the captured terms version and
effective date, and renders structural inconsistencies as an operator alert.
Consumer bookings do not receive an empty commercial card.

Local API and Admin TypeScript checks and focused ESLint pass. Fifty-two
focused API Booking regressions pass, including the new immutable business
trail behavior. The focused rendered Admin fixture passes with one real render
and assertion path. Protected CI `33683602609` passed the full rendered Admin
suite, Admin and API TypeScript checks, the Admin production build, full API
and mobile suites, and the Docker image boot/health check at commit `7b46b62`.
Protected Gates `33683602516` passed A through E and the `All gates passed`
rollup at the same commit. No booking, account, contract, terms, statement,
payment, support, audit, or production record changed.

## Checkpoint AM: explicit Business Account support context

Support cases previously had only a user owner plus an optional booking or
personal planning project. Business Account 360 could open support cases one
booking at a time or show cases assigned to the account manager, but could not
open, create, filter, or return from an account-wide company case. This made
contract access, consolidated history, account settings, and other company
issues look like personal customer cases with no durable company context.

Migration 170 adds one nullable Business Account reference to support cases and
leaves every existing row unchanged. A case remains owned by one real user.
For account-only cases, the service verifies that owner is the company owner or
an active member. Booking-linked cases inherit the booking's company link and
reject a caller-supplied mismatch. Provider-owned cases can therefore retain
the company context of work they performed without pretending the provider is
a company member. Personal planning-project cases cannot also claim a Business
Account context.

OPS-391 covers account-owner/member authorization and durable creation.
OPS-392 covers one company support view that includes both directly linked
cases and older or booking-specific cases derived from the booking's canonical
company link. The Admin queue can filter and search by company, case detail
links back to Business Account 360, and Business Account 360 now offers exact
`Open account support` and owner-scoped `Create account case` handoffs.

Local API and Admin TypeScript checks and focused ESLint pass. Fourteen focused
API support regressions pass and three focused rendered Admin regressions pass.
OPS-390 is a real PostgreSQL migration test; it was intentionally skipped
locally because no safe localhost database ending in `_test` is configured.
Protected CI `33685158203` executed the PostgreSQL-backed API suite and passed
the full API, Admin, and mobile suites, both TypeScript checks, the Admin
production build, and the Docker image boot/health check at commit `6f41b98`.
Protected Gates `33685158070` passed A through E and the `All gates passed`
rollup at the same commit. No support case, booking, project, business account,
member, payment, audit, or production record changed.

## Checkpoint AN: exact commercial-record discovery and handoff

The global operator command search could find a Business Account, booking,
support case, dispute, or payout, but not a company contract or commercial
statement. An operator holding a contract ID, statement number, or external
payment reference had to know the account first and then manually inspect
paginated tabs. Audit Log also opened the owning Contracts tab without carrying
the exact contract that produced the audit event.

OPS-393 and UX-1056 add a bounded contract result that includes company,
service scope, provider context, and status, then opens the exact contract in
Business Account 360. OPS-394 and UX-1057 let an exact external payment
reference locate its commercial statement but never return that reference in
the search response or rendered result. Statement number, statement ID,
Business Account ID, and company-name discovery lead to the same exact
statement handoff.

OPS-395 and OPS-396 prove that an exact contract handoff is validated by the
route and constrained by both Business Account ID and contract ID in the data
query. UX-1058 proves the URL activates Contracts, sends the exact filter, and
identifies the requested record. The existing UX-1051 Audit Log regression now
requires the exact contract ID as well as the exact statement ID. A stale or
cross-account contract handoff produces an explicit not-found state with a
way back to the account's full contract list.

Local API and Admin TypeScript checks and focused ESLint pass. Thirteen related
API regressions pass across eight suites, and four focused rendered Admin
regressions pass. Protected CI `33693445438` passed the full API, Admin, and
mobile suites, both TypeScript checks, the Admin production build, and the
Docker image boot/health check at commit `b05e068`. Protected Gates
`33693445347` passed A through E and the `All gates passed` rollup at the same
commit. No contract, statement, payment, booking, support, audit,
business-account, customer, provider, or production record changed.

## Checkpoint AO: exact consumer payment investigation handoff

Financials could retrieve an older payment attempt by an exact local, booking,
top-up, customer, or PayMongo identifier, but that search existed only as local
component state inside the Payments tab. The global operator command search did
not include payment attempts. A support or finance operator holding a gateway
reference therefore had to know where to navigate, re-enter the value, and
could not bookmark or share the resulting investigation state.

OPS-397 adds one fixed, bounded, read-only payment-attempt query to global
operator search. Exact PayMongo intent and payment identifiers may locate the
attempt, but neither gateway identifier is returned in the search response.
The result shows only the local payment reference, linked booking or wallet
top-up context, customer when available, payment method, and status. UX-1059
renders that result as a distinct Payment record and opens the canonical
Financials Payments workspace.

UX-1060 makes the exact attempt filter URL-backed. Global search now hands off
to `/financials?tab=payments&intentSearch=<local-attempt-id>`; loading,
refreshing, bookmarking, or sharing that URL restores the exact server query
and visible filter value. Manual searches update the URL, clearing removes the
filter, and leaving the Payments tab removes stale payment-search state. E14
continues to fail external payment creation closed. This checkpoint adds no
payment, refund, retry, receipt, or reconciliation mutation.

Local API and Admin TypeScript checks and focused ESLint pass. Six focused API
regressions pass, covering cross-record ranking, Business Account, contract,
statement, payment privacy, and exact-payment search behavior. Three real
rendered Admin regressions pass, covering manual attempt lookup, command-search
navigation, and URL restoration. Protected CI `33694962565` passed the full
API, Mobile, and rendered Admin suites, both TypeScript checks, the Admin
production build, and Docker image boot/health at commit `6d20248`. Protected
Gates `33694962558` passed A through E and the `All gates passed` rollup at the
same commit. No payment, booking, customer, provider, support, receipt, audit,
or production record changed.

## Checkpoint AP: retained legacy sales-record discovery and durable filters

The Financials Legacy Sales Records tab retained historical OR-labelled rows
for audit review under E22, but the global operator search could not find one
by its unique record ID or historical OR number. The tab also held every
filter only in component memory, so refreshing, bookmarking, sharing, or using
browser history discarded the investigation. Its date form accepted only one
date boundary even though the API correctly rejects an unpaired range.

OPS-398 adds one fixed, bounded, read-only search over retained legacy records.
It matches only the record ID or historical OR number, labels the result
`Legacy sales record`, describes non-cancellation rows as `retained for
review`, and opens the existing E22-held review workspace. It does not describe
the artifact as a current invoice, approved principal document, or
BIR-compliant record, and it exposes no new money mutation.

UX-1061 renders that explicit legacy result in command search. UX-1062 makes
all Legacy Sales Records filters URL-backed, including OR number, customer,
provider, date range, and non-default result limit. Loading the exact handoff
URL now automatically runs the retained-record search, while changing tabs
removes stale filter state. UX-1063 requires both date boundaries before any
API request, matching the server contract and giving the operator an immediate
actionable message instead of a failed request.

Local API and Admin TypeScript checks and focused ESLint pass. Six focused API
search regressions pass, including exact legacy-record labeling and routing.
Five real rendered Admin regressions pass, covering command search, URL
restoration, date-pair validation, pagination totals, and links from a retained
record to Booking, Customer, and Provider 360. Protected CI `33696434851`
passed the full API, Mobile, and rendered Admin suites, both TypeScript checks,
the Admin production build, and Docker image boot/health at commit `3051091`.
Protected Gates `33696434785` passed A through E and the `All gates passed`
rollup at the same commit. E22 remains open and enforced. No sales-document,
payment, booking, customer, provider, support, audit, or production record
changed.

## Checkpoint AQ: unresolved gateway-retry discovery and durable handoff

The Payments & Refunds workspace listed unresolved post-commit refund and
release retries, but an operator holding a retry identifier could not locate an
older row directly. Global command search omitted retry records, the queue had
no exact server filter, and the table did not display its own local retry ID.
This made a `failed_permanent` investigation dependent on paging and visual
guesswork even though the retry is evidence that a customer or provider money
outcome remains incomplete.

OPS-399 adds one fixed, bounded, read-only global-search query for unresolved
`pending`, `in_progress`, and `failed_permanent` retries. A retry ID, exact
booking ID, or exact dispute ID can locate the row, but global results return
only the local retry ID, action type, shortened related record context, and
status. They never return `last_error` or another gateway failure detail.
UX-1064 renders that result as an explicit `Gateway retry` and opens the
canonical Financials Payments workspace.

OPS-400 and OPS-401 carry an exact local retry identifier through the validated
Admin route into the unresolved queue query. UX-1065 makes that filter
URL-backed, restores it on refresh/bookmark/handoff, and displays the complete
local retry ID beside the linked Booking and optional Dispute 360 exits. The
existing authorized Financials view still shows its bounded failure message for
investigation. This checkpoint adds no manual replay, refund, release, payment,
or retry mutation; E14 and the existing money holds remain enforced.

Local API and Admin TypeScript checks and focused ESLint pass. Eleven focused
API regressions pass, including three new gateway-retry boundaries and every
older global-search query-count contract. Seven real rendered Admin regressions
pass, including the two new command-search and exact-URL contracts plus existing
pagination, payment-operations, and dispute-linkage coverage. Protected CI
`33698198759` passed the full API, Mobile, and rendered Admin suites, both
TypeScript checks, the Admin
production build, and Docker image boot/health at commit `cc7be31`. Protected
Gates `33698198774` passed A through E and the `All gates passed` rollup at the
same commit. No retry, payment, refund, release, booking, dispute, support,
audit, or production record changed.

## Checkpoint AR: exact reconciliation audit-evidence handoff

Reconciliation runs and discrepancy acknowledgements are represented by typed
`admin_actions` rows against the reconciliation snapshot, and the API already
supported exact snapshot lookup. Audit Log nevertheless rendered that target as
inert text. Financials also loaded only the 30 most recent snapshots and did not
show their immutable IDs, so an operator could not return from governance
history to the exact money-comparison evidence that produced the event.

UX-1066 gives both reconciliation actions explicit operator labels and maps a
valid `reconciliation` audit target to
`/financials?tab=reconciliation&snapshotId=<id>`. Financials restores that URL
with the existing read-only exact-snapshot endpoint, displays only the retained
record and its complete immutable ID, and provides a clear return to recent
reconciliations. The exact evidence view does not offer the unrelated create
snapshot action; an active discrepancy still uses the existing super-admin
acknowledgement contract.

UX-1067 rejects a malformed snapshot handoff in the browser before any API
request and explains that it must not be interpreted as missing or cleared
evidence. Audit Log likewise leaves a malformed reconciliation target inert
instead of constructing an invalid financial route. Reconciliation arithmetic,
snapshot creation, acknowledgement rules, wallet balances, and external money
behavior are unchanged. E37 still holds any claim that the combined audit
timeline is a globally complete or correlated mutation trail.

Local Admin TypeScript and focused ESLint pass. Eight real rendered Admin
regressions pass across exact audit handoff, malformed-link failure, existing
snapshot creation and acknowledgement, expected-only labeling, exact PHP input,
and prior Business Account audit linkage. Protected CI `33699583886` passed the
full API, Mobile, and rendered Admin suites, both TypeScript checks, the Admin
production build, and Docker image boot/health at commit `9ffdd61`. Protected
Gates `33699583879` passed A through E and the `All gates passed` rollup at the
same commit. No reconciliation, wallet, payment, booking, support, audit, or
production record changed.

## Checkpoint AS: canonical audit target identity and account handoff

The combined Audit Log identified the operator through `userRole`, but did not
separately identify the account targeted by an event. Many real
`admin_actions` rows use the singular `user` target for customer/provider force
logout, DPO role changes, administrator password or 2FA events, consent search,
and audit export. The Admin UI recognized only the plural `users` target and,
for that older shape, treated the actor role as the target role. A super-admin
acting on a customer or provider could therefore produce inert text or a link
classified from the super-admin instead of the account that support needed to
inspect.

OPS-402 keeps actor and target identity distinct at the API boundary. The
timeline query still returns the masked actor identity, while a separate
canonical target-user join returns `targetUserRole` and the target provider's
profile ID when one exists. The provider relationship cannot duplicate an
event because `providers.user_id` is unique. These fields describe the current
account destination; the immutable before/after event details remain the
evidence for a historical role transition.

UX-1068 handles both `user` and `users` target forms. Customer events open the
exact Customer 360 record, provider events open the exact provider profile,
provider-staff events open that participant's support history, and
admin/super-admin/DPO events open an exact Staff directory search. An older
event may fall back to the actor role only when actor and target are the same
account. An unclassified user remains on the safe participant-support path
instead of being guessed from an unrelated operator. OPS-403 makes Staff
directory search resolve both the canonical login-account UUID and the
directory-profile UUID, and its visible search contract now includes account
IDs.

Local API and Admin TypeScript checks, affected-file ESLint, and
`git diff --check` pass. Four related API suites pass 10 tests, and six related
rendered Admin files pass 11 tests. Protected CI `33701447073` passed the full
API, Mobile, and rendered Admin suites, both TypeScript checks, the Admin
production build, and Docker image boot/liveness at commit `d1e8efb`.
Protected Gates `33701447127` passed A through E and the `All gates passed`
rollup at the same commit. No user role, login session, staff profile, provider,
customer, support case, audit row, database schema, or production record
changed. Production synchronization remains blocked by E32.

## Checkpoint AT: exact staff-profile audit handoff

Staff creation, removal, and profile-edit actions record the directory-profile
UUID as an `admin_staff` target. Checkpoint AS made Staff directory search
resolve both profile and login-account UUIDs, but Audit Log still sent these
events to the unfiltered Staff & Roles landing page. An operator investigating
one staff-management event therefore had to copy the shortened identifier and
manually recover the affected profile.

UX-1069 maps a valid `admin_staff` audit target to
`/staff?search=<profile-id>`, labels it as a Staff directory profile, and keeps
the role-definition `admin_role` target on the broader Staff & Roles workspace.
A real in-router regression now clicks the rendered Audit Log destination,
proves that the exact profile-ID query survives navigation, proves that Staff
directory requests that ID from the server, and proves that the matching staff
card is rendered. The test also overrides the suite's intentionally shallow
router stub so the handoff is exercised through the real React Router link and
URL contract.

Local Admin TypeScript, affected-file ESLint, and `git diff --check` pass. Four
related rendered Admin files pass seven tests across canonical target identity,
source discrimination, Staff account coverage, and the new exact-profile
handoff. Protected CI `33703354158` passed the full API, Mobile, and rendered
Admin suites, both TypeScript checks, the Admin production build, and Docker
image boot/liveness at commit `ce4dcab`. Protected Gates `33703354163` passed A
through E and the `All gates passed` rollup at the same commit. No staff
profile, role, user account, login session, support case, audit row, database
schema, or production record changed. Production synchronization remains
blocked by E32.

## Checkpoint AU: general-audit privacy segregation

The approved D34 role boundary assigns consent evidence, data-subject requests,
and breach records to the DPO/super-admin privacy workspace and explicitly says
that a plain operations admin does not receive privacy-record access. The
general Audit Log route correctly rejected a DPO session, but its combined
timeline returned every recorded privacy event to both `admin` and
`super_admin`. The matching CSV export and its streaming variant used the same
unrestricted union. Masking contact fields did not fix that authorization
failure: an ordinary admin could still receive privacy case identifiers,
actions, reasons, and nested event context, including by applying an exact
filter or exporting the timeline.

OPS-404 introduces one shared, fail-closed visibility predicate for the general
audit surface. Ordinary admins no longer receive DPO-owned `dsr_request`,
`data_subject_request`, `consent_version`, or `breach` targets, nor a
`consent_search` event recorded against a user. DSR and breach action families
are also excluded defensively if a future or legacy row used the wrong target
type. The predicate is applied before both count and row queries, so pagination
and totals describe only records the viewer may receive. Super admins retain
the approved cross-boundary governance view; DPO sessions still cannot open the
general Audit Log.

OPS-405 applies that identical predicate to the assembled CSV and streaming CSV
paths. Missing viewer roles fail closed to the ordinary-admin view, preventing
a future direct service caller from bypassing D34. The export still masks
contact, network, reason, and nested free-text PII for every permitted role.
E40 continues to hold breach classification, deadline language, and a new
breach client screen; this checkpoint changes authorization only.

Local API TypeScript, affected-file ESLint, and `git diff --check` pass. Five
focused API suites pass 39 tests, including behavioral comparisons proving that
an ordinary admin receives only an operational booking event while a super
admin receives the same event plus all five represented privacy shapes, and
that both CSV paths enforce the same result. Protected CI `33704506009` passed
the full API, Mobile, and rendered Admin suites, both TypeScript checks, the
Admin production build, and Docker image boot/liveness at commit `2431d91`.
Protected Gates `33704506058` passed A through E and the `All gates passed`
rollup at the same commit. No consent, DSR, breach, user, support, audit,
database-schema, or production record changed. Production synchronization
remains blocked by E32.

## Checkpoint AV: exact privacy-case audit handoff

Checkpoint AU correctly removed DPO-owned events from an ordinary admin's
general Audit Log while retaining the approved super-admin governance view.
That authorized super-admin view still rendered both recorded DSR target forms,
`dsr_request` and `data_subject_request`, as inert text. An investigator could
see that a privacy case changed but could not return to the exact case evidence
without manually copying an abbreviated identifier and searching outside the
recorded workflow.

UX-1070 maps a valid DSR audit target to
`/data-protection-log?dsrId=<id>` and gives the known DSR action families clear
operator labels. The DPO workspace validates that URL state, loads the existing
DPO/super-admin-only exact-detail endpoint, and opens the complete stored case
even when the record is outside the current page or filters. Opening a queue
row now writes the same durable case ID, so refresh, bookmark, and staff handoff
all recover the exact case. Closing the case removes only `dsrId`, preserving
the operator's queue filters. Successful case actions close that URL state
before invalidating both list and exact-detail caches, preventing stale detail
from reopening.

UX-1071 rejects a malformed `dsrId` locally before any detail request is sent,
explains that the value is invalid rather than misreporting a missing case, and
lets the operator remove only the bad identifier. A failed authorized detail
request has separate retry and return-to-queue actions. The API's D34 role
boundary is unchanged: ordinary admins cannot receive these audit rows and
cannot open the privacy workspace; only DPO and super-admin sessions can fetch
the exact case. E40 continues to hold breach classification and new breach UI.

Local Admin TypeScript, affected-file ESLint, and `git diff --check` pass. Five
focused rendered Admin files pass five tests across the new exact and malformed
DSR handoffs plus prior case-review, received-case action, and exact staff
handoff coverage. The complete local Admin suite passes 348 files and 437 tests,
with one intentionally skipped file and three existing honest TODOs. Protected
CI `33705958571` passed the full API, Mobile, and rendered Admin suites, both
TypeScript checks, the Admin production build, and Docker image boot/liveness
at commit `bdef4bc`. Protected Gates `33705958566` passed A through E and the
`All gates passed` rollup at the same commit. No DSR, consent, breach, user,
support, audit, database-schema, or production record changed. Production
synchronization remains blocked by E32.

## Checkpoint AW: exact consent-publication audit evidence

Consent publication is represented by an immutable `admin_actions` event with
two identities: the event row ID and a dedicated `consent_version` target ID.
The general Audit Log retained the target ID, but the DPO Consent Versions API
discarded it when mapping publication history and offered no exact read route.
Even an authorized super-admin could therefore see that a version was
published without reliably reopening the publication evidence that owned the
event. Filtering by visible text would not be a durable substitute as the
history grows or version labels repeat across consent types.

OPS-406 retains both identities in the DPO API contract and adds a bounded,
read-only lookup of one `consent_version_published` event by its existing target
UUID. It scopes the query to both the publication action and target type, so an
unrelated admin action cannot satisfy the lookup. Future publication responses
and history rows now expose the same target UUID without changing how either
identifier is generated or rewriting historical evidence.

OPS-407 exposes that lookup through a validated
`GET /api/v1/admin/compliance/consent-versions/:id` route. The route retains the
existing D34 DPO/super-admin boundary and returns an explicit not-found result
instead of falling through to a broad history scan. It adds no publication,
activation, acknowledgement, or rollback mutation.

UX-1072 maps a valid `consent_version` Audit Log target to
`/consent-versions?tab=history&publicationId=<id>`. Consent Versions restores
that URL through the exact endpoint and renders consent type, version, material
classification, scheduled/effective state, Manila effective and publication
times, publisher, recorded summary, publication target ID, and audit event ID.
History cards and desktop rows can create the same durable evidence URL.
UX-1073 rejects malformed publication IDs in the browser before any detail
request, distinguishes invalid input from missing evidence, and removes only
the bad identifier while preserving the History tab. E71 Option A remains
unchanged: publication is recorded immediately and a future material version
does not require customer/provider re-consent before its effective timestamp.

Local API and Admin TypeScript, affected-file ESLint, and `git diff --check`
pass. Seven related API suites pass 37 tests and five related rendered Admin
files pass five tests. The complete local Admin suite passes 350 files and 439
tests, with one intentionally skipped file and three existing honest TODOs. A
broader local API run passed 845 suites and 3,213 tests before two Docker-only
nginx checks stopped because Docker Desktop is unavailable and three unrelated
jsdom/jest-axe suites stopped on the OneDrive dependency tree's reproducible
`UNKNOWN: read` error. Those were environment load failures, not assertion
failures. Protected CI `33707727250` then passed the full API, Mobile, and
rendered Admin suites, both TypeScript checks, the Admin production build, and
Docker image boot/liveness at commit `a5ff678`. Protected Gates `33707727274`
passed A through E and the `All gates passed` rollup at the same commit. No
consent publication, acknowledgement, DSR, user, audit, database-schema, or
production record changed. Production synchronization remains blocked by E32.

## Checkpoint AX: durable subject-consent lookup and audit handoff

The DPO Privacy Workspace already required an exact user UUID and paged consent
records on the server, but the selected subject and page lived only in React
state. Refresh, bookmark, browser back, or a handoff to another authorized
operator discarded the investigation. An out-of-range stale page could also
show an empty result even when earlier consent evidence still existed.

UX-1074 makes `consentUserId` and `consentPage` durable URL state while keeping
the current local state path compatible with the existing rendered harness.
Submitting a valid UUID writes the subject to the URL, pagination writes only
pages after page one, and navigation restores the exact bounded server query.
UX-1075 rejects a malformed saved subject UUID before the sensitive consent
endpoint is called, explains why no request was sent, and lets the operator
remove the invalid lookup without changing another workspace route. UX-1077
uses the returned total to recover an out-of-range page to the last real page,
updates the durable URL, and refetches its evidence instead of reporting a
false empty history.

The consent-search audit writer uses the requested user as its target when one
is supplied, but must use the DPO's own account as a non-null database fallback
for a broad search. Audit Log previously treated every `consent_search` target
as an actual account destination. A broad event could therefore open the DPO's
Staff record, and an exact event did not return to the consent evidence that
was searched. UX-1076 reads the immutable `details.filters.userId` only when it
is a valid UUID, labels the event `Consent evidence searched`, and opens the
exact Privacy Workspace lookup. A broad event opens the unfiltered privacy
lookup instead of pretending the fallback operator was the subject.

This remains inside D34: ordinary admins do not receive `consent_search` rows,
DPO and super-admin are the only roles that can call consent search, and DPO
sessions still cannot enter marketplace, staff, or money workspaces. No contact
data or consent content is placed in the URL; only the existing account UUID
and bounded page number are retained.

Local Admin TypeScript, affected-file ESLint, and `git diff --check` pass. Seven
focused rendered Admin files pass seven tests across URL restoration, invalid
input, exact audit handoff, stale-page recovery, existing pagination, privacy
home, and workload separation. The complete local Admin suite passes 354 files
and 443 tests, with one intentionally skipped file and three existing honest
TODOs. Protected CI `33708893115` passed the full API, Mobile, and rendered
Admin suites, both TypeScript checks, the Admin production build, and Docker
image boot/liveness at commit `af52bf4`. Protected Gates `33708893180` passed A
through E and the `All gates passed` rollup at the same commit. No consent,
DSR, user, staff, support, audit, database-schema, or production record changed.
Production synchronization remains blocked by E32.

## Checkpoint AY: recurring-cancellation audit contract and handoff

The Admin recurring-series workspace cancels only future generation and keeps
existing bookings, payments, refunds, disputes, support cases, and provider
work unchanged. Its cancellation route correctly made the series update and
the operator evidence one transaction, but the transaction wrote
`recurring_booking_cancelled` against a `recurring_booking` target. Neither
value existed in the live `admin_actions` CHECK constraints. Postgres therefore
rejected the audit insert and rolled back every Admin cancellation even though
the screen exposed the action.

OPS-408 adds migration 171, which appends the missing action and target to the
live constraint definitions without replacing any action or target introduced
by earlier migrations. The migration is idempotent and rejects unknown values
after the append. A real Postgres integration regression applies it twice,
inserts representative earlier booking, business, and review events, inserts
the recurring cancellation event, and proves that an invented action/target is
still rejected. The existing OPS-321 route regression continues to prove that
a failed audit write rolls back the cancellation and prevents a success
notification.

UX-1078 gives the event a clear operator label and maps its exact UUID to
`/recurring?seriesId=<id>`. A rendered in-router regression clicks the actual
Audit Log link, loads a cancelled series outside the current queue page, opens
the recurring support workspace, and verifies the recorded cancellation
reason and durable URL. This closes both sides of the contract: the decision
can now commit, and the resulting evidence can reopen the record it changed.

Local API and Admin TypeScript, affected-file ESLint, `git diff --check`, the
existing cancellation transaction test, and the new rendered handoff test
pass. The new Postgres regression is intentionally skipped without a safe
local `_test` database. The complete local Admin run reached 354 passing files
and 443 passing tests before the unrelated OPS-269 file exceeded its five
second timeout under local parallel load; OPS-269 and UX-1078 both passed on an
immediate isolated rerun. Protected CI `33710381057` then passed 854 API suites
and 3,225 tests, including the real OPS-408 Postgres migration regression, plus
355 Admin files and 444 tests, Mobile, both TypeScript checks, the Admin build,
and Docker image boot/liveness at commit `2595969`. Protected Gates
`33710381049` passed A through E and the `All gates passed` rollup at the same
commit. Migration 171 is committed but has not been applied to production.
No recurring series, booking, payment, support case, audit row, database
schema, or production record changed. Production synchronization remains
blocked by E32.

## Checkpoint AZ: exact tester-feedback audit handoff

Tester feedback triage already wrote an immutable
`feedback_submission_updated` admin action against the exact submission UUID,
but the general Audit Log rendered that target as inert text. The Feedback
workspace also initialized a missing or malformed URL selection from the first
visible queue row. An operator following stale handoff state could therefore
see an unrelated report and reasonably mistake it for the audited submission.

UX-1079 gives the event a clear operator label and maps a valid target UUID to
`/feedback?feedbackId=<id>`. The Feedback workspace uses its existing bounded
exact-detail and decision-history endpoints to restore that submission even
when the current queue request fails, so the evidence handoff does not depend
on queue position, filters, or list availability. Queue selection writes the
same durable URL state and closing the detail removes only `feedbackId`,
preserving the operator's other filters.

UX-1080 rejects malformed saved feedback state locally and displays an explicit
invalid-selection alert instead of substituting the first queue item. Removing
the bad selection leaves the current queue filters intact. The change adds no
triage mutation, alters no feedback decision, and does not expose tester notes
outside the existing Admin authorization boundary.

Local Admin TypeScript, affected-file ESLint, and `git diff --check` pass. All
21 Feedback-related rendered files pass 23 tests, including the exact handoff,
exact-detail list-failure independence, invalid-selection containment, and the
existing triage decision behavior. Protected CI `33711098766` passed 854 API
suites and 3,225 tests, 357 Admin files and 446 tests with one intentionally
skipped file and three existing honest TODOs, 531 Mobile suites and 910 tests
with 84 TODOs, both TypeScript checks, the Admin production build, and Docker
image boot/liveness at commit `3e66ca0`. Protected Gates `33711098647` passed A
through E and the `All gates passed` rollup at the same commit. No feedback
submission, triage decision, user, support case, audit row, database schema, or
production record changed. Production synchronization remains blocked by E32.

## Checkpoint BA: durable Provider 360 workspaces and child-record ownership

Provider 360 exposed nine operational tabs, but the selected tab lived only in
component state. Refresh, bookmark, browser navigation, and an Audit Log
handoff therefore returned an operator to Profile even when the investigation
concerned staff, certifications, notes, or reviews. UX-1081 makes non-default
tabs durable as validated `tab` URL state, defaults missing or invalid values
to Profile, and removes only `tab` when Profile is selected so unrelated
support context remains intact.

UX-1082 maps provider certification, support-note, and review targets to their
owning Provider 360 tab. The destinations deliberately promise the scoped
workspace rather than an exact child record because those panels do not yet
implement child selection. Provider staff, application, and document events
had a deeper identity gap: some historical action payloads did not contain a
provider UUID at all. OPS-409 resolves the owner relationally from the durable
provider application, document, certification, staff, note, and review rows,
then exposes one canonical `targetProviderId` without trusting optional JSON.
UX-1083 uses that owner to open Staff for a provider-staff event and Profile
for application or document evidence.

OPS-410 also records `providerId`, previous status, and next status on new
provider-staff review, suspension, and reactivation actions. This improves
future audit evidence without changing the decision itself. Relational lookup
continues to support older events whose JSON did not contain the owner. No
provider application, document, certification, staff member, note, review,
booking, payment, or support record changed.

Local API and Admin TypeScript, affected-file ESLint, and `git diff --check`
pass. The Provider 360 URL and scoped-link group passed six rendered Admin
files and six tests. The child-owner group passed four focused API suites and
four tests plus three rendered Admin files and three tests. A complete local
Admin run reached 357 passing files and 446 passing tests but reported two
unrelated parallel-load failures: OPS-269 exceeded its five-second timeout and
UX-417 did not complete its feedback auto-selection before assertion. Both
files passed immediately when rerun together in isolation. Protected CI
`33713061235` passed 856 API suites and 3,227 tests, 360 Admin files and 449
tests with one intentionally skipped file and three existing honest TODOs, 531
Mobile suites and 910 tests with 84 TODOs, both TypeScript checks, the Admin
production build, and Docker image boot/liveness at commit `7f2923c`.
Protected Gates `33713061239` passed A through E and the `All gates passed`
rollup at the same commit. Production synchronization remains blocked by E32.

## Checkpoint BB: exact official-receipt audit handoff

Official receipt issuance and cancellation actions retained the receipt UUID
as their immutable audit target, but the general Audit Log rendered that
target as inert text. Receipt evidence already belongs to Booking 360, where
support can review the customer, provider, job, payment, refund, dispute, and
retained sales-document context together. New issuance events included a
booking UUID in JSON, while historical cancellation events did not, so a link
that trusted optional action details would have left part of the real audit
history disconnected.

OPS-411 resolves the owning booking from the retained `official_receipts` row
and exposes it as canonical `targetBookingId`. UX-1084 gives issuance and
cancellation clear operator labels and maps the receipt event to that exact
Booking 360 record. OPS-412 also records the booking UUID in new cancellation
payloads, improving future exported evidence while preserving relational
recovery for older events. The stale service comment claiming that
`admin_actions.admin_id` still rejected system issuance was corrected to match
migration 055, which permits a null actor for system-authored evidence.

This is a read-side support and audit change. It does not issue or cancel a
receipt, enable the held BIR document workflow, move money, alter a booking, or
change existing audit rows. E22 still fails tax-document writes closed and the
Admin generate/finalize controls remain disabled.

Local API and Admin TypeScript, affected-file ESLint, and `git diff --check`
pass. Five API suites pass 62 tests across receipt generation/cancellation and
audit identity; 18 rendered Admin audit-link files pass 25 tests. Protected CI
`33713924567` passed 858 API suites and 3,229 tests, 361 Admin files and 450
tests with one intentionally skipped file and three existing honest TODOs, 531
Mobile suites and 910 tests with 84 TODOs, both TypeScript checks, the Admin
production build, and Docker image boot/liveness at commit `4b7fcfb`.
Protected Gates `33713924555` passed A through E and the `All gates passed`
rollup at the same commit. Production synchronization remains blocked by E32.

## Checkpoint BC: exact held tax-workpaper audit evidence

The general Audit Log recorded BIR 2307 batch and VAT report events but did not
provide a durable route back to the exact retained workpaper. Historical event
JSON was not a reliable source for the reporting period or provider owner, and
the Financials page kept its BIR period only in component state. An operator
could therefore see that tax evidence changed without being able to reopen and
verify the same batch or report.

OPS-413 resolves a retained 2307 batch's provider, tax year, and quarter from
the database and exposes those canonical owners with the audit event. OPS-414
does the same for a VAT report's tax year and month. OPS-415 rejects a malformed
2307 batch identifier before querying Postgres. UX-1085 and UX-1086 give the
four tax actions clear labels and map them to durable Financials URLs carrying
the exact period and immutable batch or report identifier.

The BIR workspace now validates `taxYear`, `taxQuarter`, `batchId`, `vatMonth`,
and `vatReportId` URL state, keeps historical selected years available in its
selector, and renders exact retained evidence through the existing bounded
detail endpoints. It refuses a VAT response whose report identifier does not
match the audit target, reports malformed or unavailable evidence explicitly,
and can still load exact evidence when the annual summary request fails. The
held generate, regenerate, and finalize controls remain disabled under E22.
This work does not create or finalize a tax document, change a provider ledger,
move money, alter a transaction, or update an existing audit row.

Local API and Admin TypeScript, affected-file ESLint, and `git diff --check`
pass. Six API financial and BIR suites pass 63 tests. Six focused rendered
Admin tax-evidence files pass six tests, and all 50 Financials and Audit Log
files pass 59 tests. Protected CI `33715547263` passed 861 API suites and 3,232
tests, 366 Admin files and 455 tests with one intentionally skipped file and
three existing honest TODOs, 531 Mobile suites and 910 tests with 84 TODOs,
both TypeScript checks, the Admin production build, and Docker image
boot/liveness at commit `4de0977`. Protected Gates `33715547245` passed A
through E and the `All gates passed` rollup at the same commit. Production
synchronization remains blocked by E32.

## Checkpoint BD: exact service-catalog audit handoffs

Category, customer-service, and add-on mutations were already transactional
and audited, but their records were inert in the general Audit Log. Historical
service and add-on actions could also omit their parent identifiers from JSON,
so constructing a route from optional action details would not reliably reopen
the hierarchy the operator changed.

OPS-416 resolves the retained category and customer-service owners directly
from `service_subcategories` and `service_addons`. UX-1090 through UX-1092 map
category, service, and add-on events to exact durable Catalog URLs and expand
and mark the matching retained record. Service-only evidence does not open the
add-on panel or make its extra request. A selected add-on opens all three levels
and retains inactive add-ons, which is necessary for deactivation evidence.

UX-1093 rejects malformed identifiers before opening an unrelated hierarchy,
and UX-1094 rejects a service/category ownership mismatch instead of marking a
record under the wrong parent. During line review, UX-1095 found that a normal
add-on expansion wrote URL state that a refresh did not restore and announced
a normal selection as an audit target. The final contract uses source-neutral
selection wording plus explicit `view=addons` state, so ordinary add-on panel
state survives remount while an exact service audit link does not trigger an
unnecessary add-on fetch.

Local API and Admin TypeScript, changed-file ESLint, and `git diff --check`
pass. Thirteen related API catalog and audit-identity suites pass 62 tests, and
37 rendered Catalog and Audit Log files pass 46 tests. Protected CI
`33716790302` passed 862 API suites and 3,233 tests, 372 Admin files and 461
tests with one intentionally skipped file and three existing honest TODOs, 531
Mobile suites and 910 tests with 84 TODOs, both TypeScript checks, the Admin
production build, and Docker image boot/liveness at commit `f143496`.
Protected Gates `33716790289` passed A through E and the `All gates passed`
rollup at the same commit. No category, service, add-on, booking, price, audit,
database-schema, master, or production record changed. Production
synchronization remains blocked by E32.

## Checkpoint BE: exact communication moderation audit evidence

Conversation and message moderation actions were recorded in the general Audit
Log, but they could only return support to the owning Booking 360 record. That
lost the exact conversation and message under review, and a paginated or failed
conversation queue could prevent an operator from reconstructing the decision.
Optional action JSON was not sufficient because some legitimate customer-only
support notifications have no conversation, while an unrelated older
conversation can exist for the same booking.

OPS-417 resolves retained conversation and message identity relationally for
conversation views, message redactions, flag reviews, and Admin replies. It
verifies that the message belongs to the conversation and, for booking-targeted
events, that the conversation belongs to the audited booking. It does not
substitute another conversation when the audited action has no exact retained
communication identity.

UX-1096 maps an event with canonical communication identity to a durable
`conversationId`, optional `bookingId`, and optional `messageId` URL. The
Communications workspace loads that exact thread independently of the queue,
marks the selected audit evidence, and can therefore preserve the evidence when
the general list fails. UX-1097 through UX-1099 reject malformed identifiers,
a mismatched conversation response, a missing target message, and a
booking/conversation ownership mismatch without falling back to another row.
UX-1100 removes exact audit state when the operator deliberately leaves the
selection, changes workspace mode, or opens a normal queue conversation.

Local API and Admin TypeScript, changed-file ESLint, and `git diff --check`
pass. Five focused API suites pass 23 tests, and 38 rendered Communications and
Audit Log files pass 47 tests. Protected CI `33718299000` passed 863 API suites
and 3,234 tests, 377 Admin files and 466 tests with one intentionally skipped
file and three existing honest TODOs, 531 Mobile suites and 910 tests with 84
TODOs, both TypeScript checks, the Admin production build, and Docker image
boot/liveness at commit `a036f0a`. Protected Gates `33718298994` passed A
through E and the `All gates passed` rollup at the same commit. No conversation,
message, booking, user, moderation decision, audit row, database schema, master,
or production record changed. Production synchronization remains blocked by
E32.

## Checkpoint BF: exact pricing-rule audit evidence

Pricing-rule draft, publication, and retirement decisions already retained the
exact rule UUID, but the general Audit Log discarded that identity by opening
the broad Pricing Rules list. Pagination and lifecycle filters could therefore
hide the audited rule, and a failed list left finance operations unable to
reconstruct the same retained pricing decision.

UX-1101 maps a valid pricing-rule target to
`/pricing-rules?ruleId=<id>`. The Pricing Rules workspace validates the target
and loads it through the existing Admin exact-detail endpoint independently of
the paginated list. It renders the rule ID, lifecycle, scope, schedule,
multiplier, platform/provider surge split, publication or retirement time, and
the recorded reason in a dedicated read-only evidence panel. This handoff does
not open a draft editor or invoke preview, publication, or retirement.

UX-1102 rejects malformed saved rule IDs before making a detail request.
UX-1103 rejects an exact-detail response whose ID differs from the requested
audit target and explicitly refuses to substitute another list record. UX-1104
removes only `ruleId` when the operator clears the evidence, preserving any
other workspace context in the URL. The approved E28/E54 pricing publication
contract remains unchanged: super-admin-only mutation, server-authoritative
preview, future bookings only, immutable existing booking totals, and retained
retirement history.

Local Admin TypeScript, changed-file ESLint, and `git diff --check` pass. All
33 rendered Pricing Rules and Audit Log files pass 42 tests. Protected CI
`33719914072` passed 863 API suites and 3,234 tests, 381 Admin files and 470
tests with one intentionally skipped file and three existing honest TODOs, 531
Mobile suites and 910 tests with 84 TODOs, both TypeScript checks, the Admin
production build, and Docker image boot/liveness at commit `39e929b`.
Protected Gates `33719914096` passed A through E and the `All gates passed`
rollup at the same commit. No pricing rule, preview, booking, payment, provider
share, platform revenue, audit row, database schema, master, or production
record changed. Production synchronization remains blocked by E32.

## Checkpoint BG: exact market and provider area-change audit evidence

Service-area configuration actions and provider area-change decisions retained
exact UUIDs, but the general Audit Log could only leave those targets inert or
open a broad workspace. The normal area-change queue also contains pending
requests only, so an approved, rejected, or cancelled decision could disappear
from the operator surface that needed to explain it later.

OPS-418 adds a bounded exact-detail read for a retained provider area-change
request in any lifecycle state. It resolves the owning Provider 360 record and
the current and requested market names, while preserving the same role-aware
contact masking used by the pending queue. SEC-046 verifies that an ordinary
Admin receives masked provider email and phone values. SEC-047 rejects a
malformed request ID before service access, and SEC-048 rejects a non-Admin
account before loading the record.

UX-1105 maps service-area events to an exact `areaId` URL and loads the retained
market independently of the paginated list. UX-1106 does the same for a
provider area-change decision, including completed decisions outside the
pending queue and a direct Provider 360 exit. The evidence panels identify the
record, geography, coverage radius, supply, customer and booking counts,
requested location and radius, lifecycle, recorded reason, and decision time.
UX-1107 through UX-1110 fail closed for simultaneous targets, malformed IDs,
and mismatched server responses, then remove only the exact target when the
operator clears the selection so ordinary filters remain intact.

E46 remains open because the repository still conflicts over direct market
activation versus the staged planned, recruiting, soft-launch, and active
lifecycle. This read-side work does not choose that policy or change any
activation, launch, matching, provider coverage, customer coverage, booking,
or historical audit behavior.

Local API and Admin TypeScript, changed-file ESLint, and `git diff --check`
pass. Nineteen related API service-area and area-change suites pass 58 tests,
and 40 rendered Service Areas and Audit Log files pass 49 tests. Protected CI
`33721657468` passed 867 API suites and 3,238 tests, 387 Admin files and 476
tests with one intentionally skipped file and three existing honest TODOs, 531
Mobile suites and 910 tests with 84 TODOs, both TypeScript checks, the Admin
production build, and Docker image boot/liveness at commit `177ac9ec`.
Protected Gates `33721657414` passed A through E and the `All gates passed`
rollup at the same commit. No service area, provider area-change request,
customer, provider, booking, audit row, database schema, master, or production
record changed. Production synchronization remains blocked by E32.

## Checkpoint BH: exact Marketing audit evidence and banner write boundary

Home-banner audit rows retained a promotion UUID but opened only the broad
Marketing workspace. Promo-code and campaign changes were retained as legacy
`config` events whose record kind lived in action values, so the general Audit
Log treated them as System Settings changes. Operators could not reliably
reopen the exact Marketing record after pagination, filtering, or a list
failure, and the campaign workspace did not distinguish its manually entered
attribution figures from system-measured outcomes.

OPS-419 adds bounded exact-detail reads for the retained home banner, promo
code, and campaign records. SEC-049 rejects malformed identifiers before
service access, and SEC-050 rejects non-Admin accounts before any exact Admin
Marketing record is loaded. UX-1111 through UX-1113 map each supported audit
event to the matching durable Marketing tab and render a separate read-only
evidence panel even when the general list fails. The panels identify canonical
IDs, banner delivery and customer copy, promo validity and usage limits, and
campaign spend and staff-reported attribution without implying that manual
campaign figures are measured platform events.

UX-1114 through UX-1117 fail closed for simultaneous targets, malformed IDs,
and server responses whose record ID does not match the request. Clearing the
evidence removes only the three exact target parameters and preserves normal
workspace context. Review also found that the interface hid every home-banner
mutation from ordinary Admin accounts while the API still accepted their
direct create and update calls. SEC-051 aligns the server boundary with the
existing interface and current platform-wide mutation policy by making all
home-banner writes Super Admin-only. UX-1118 states that read-only boundary in
the Admin interface instead of leaving a blank action column. Ordinary Admin
read access remains available for support and audit work.

E37 remains open because the repository does not yet have an approved global,
correlated audit-event architecture. This checkpoint preserves the existing
best-effort Marketing audit writes and restores exact read-side evidence; it
does not introduce a competing event schema or claim that all related writes
are atomic with their audit rows.

Local API and Admin TypeScript, changed-file ESLint, and `git diff --check`
pass. Nineteen related API Marketing, promo, and promotion suites pass 95
tests, and 43 rendered Marketing and Audit Log files pass 52 tests. Protected
CI `33724751153` passed 871 API suites and 3,242 tests, 395 Admin files and 484
tests with one intentionally skipped file and three existing honest TODOs, 531
Mobile suites and 910 tests with 84 TODOs, all three TypeScript checks, the
Admin production build, and Docker image boot/liveness at commit `d6b53679`.
Protected Gates `33724751166` passed A through E and the `All gates passed`
rollup at the same commit. No banner, promo code, campaign, customer, provider,
booking, payment, historical audit row, database schema, master, or production
record changed. Production synchronization remains blocked by E32.

## Checkpoint BI: exact notification-template audit linkage

Notification-template mutations retained a template UUID and change snapshot in
the general Audit Log, but every supported event opened only the broad template
table. Pagination, filters, or a list failure could therefore hide the current
record. Deleted templates were even less safe: a direct detail handoff would
guarantee a dead link, while treating the live row as historical evidence would
misstate the repository's current non-versioned model.

UX-1119 maps a non-delete event with a valid UUID to the exact current retained
template and loads that detail independently of the general list. Its read-only
evidence panel identifies the template, routing slug, current title and body,
placeholders, runtime linkage, real delivery channels versus stored metadata,
active/fallback behavior, and Manila creation and update times. The panel says
explicitly that it is current mutable state, not an immutable historical
version, and directs the operator back to the Audit Log snapshot for the values
recorded at the time of change.

UX-1120 keeps a deleted template identified by its retained Audit Log snapshot
without presenting a link that must return not found. UX-1121 and SEC-052 reject
malformed template identifiers before any exact-record request or service
access. UX-1122 rejects an exact-detail response whose ID differs from the
requested target instead of substituting a list row. UX-1123 removes only the
exact `templateId` when the operator clears the evidence, preserving ordinary
filters and pagination. SEC-053 verifies that customer accounts cannot access
the exact Admin record; Admin and Super Admin retain read access, while the
existing Super Admin-only write boundary is unchanged.

E66 remains open for approved immutable versions, per-channel publication,
locale behavior, external email and SMS delivery, retry/outbox semantics, and
production-row classification. This checkpoint adds no delivery mechanism,
publication model, version history, or competing runtime contract, and it does
not alter any template or notification data.

Local API and Admin TypeScript, changed-file ESLint, and `git diff --check`
pass. Sixteen notification-template API suites pass 29 tests, and 44 rendered
Notification Templates and Audit Log files pass 53 tests. Protected CI
`33726995964` passed 873 API suites and 3,244 tests, 400 Admin files and 489
tests with one intentionally skipped file and three existing honest TODOs, 531
Mobile suites and 910 tests with 84 TODOs, all three TypeScript checks, the
Admin production build, and Docker image boot/liveness at commit `3659b223`.
Protected Gates `33726995930` passed A through E and the `All gates passed`
rollup at the same commit. No notification template, notification delivery,
customer, provider, booking, payment, historical audit row, database schema,
master, or production record changed. Production synchronization remains
blocked by E32.

## Checkpoint BJ: exact retained role-profile audit evidence

Administrative-role audit rows retained an exact role-profile UUID but opened
only the broad Staff workspace. The normal Role Profiles list intentionally
excludes archived profiles, so pagination, a list failure, or archival could
hide the exact record an operator needed to explain. The existing `roleId`
query parameter belongs to the Staff directory filter and cannot safely carry
this different audit selection.

OPS-420 adds a bounded exact-detail service read that resolves an active or
soft-deleted role profile by UUID. It returns the retained profile metadata and
both active and historical linked staff-profile counts without changing the
active-only list. OPS-421 exposes that evidence at the exact Admin route.
SEC-054 verifies that only Super Admin may read it, and SEC-055 rejects a
malformed UUID before service access.

UX-1124 maps a valid `admin_role` audit target to
`/staff?tab=roles&roleProfileId=<id>` and renders the retained profile even when
the active list fails. The read-only panel identifies the exact ID, lifecycle,
description, permission metadata, linked-profile counts, Manila timestamps,
and archive reason. It also states that these role-profile permissions are
descriptive metadata: account access remains controlled by `users.role` and
server route authorization. The panel is current retained state, not an
immutable historical version; the Audit Log remains the historical evidence.

UX-1125 rejects malformed exact targets before requesting the record. UX-1126
rejects a response whose ID differs from the requested audit target. UX-1127
removes only `roleProfileId` when the operator clears the evidence, preserving
the Role Profiles tab, ordinary Staff `roleId` filter, and pagination. UX-1128
removes the hidden exact target when the operator leaves the Role Profiles tab.

E39 remains open for the privileged-account lifecycle, last-Super-Admin
protection, and recovery design. This checkpoint adds no account creation,
access grant, access revocation, role assignment, session invalidation, or
recovery behavior, and it does not claim that editing a role profile changes
authorization.

Local API and Admin TypeScript, changed-file ESLint, and `git diff --check`
pass. Four focused API suites pass four tests; the expanded Staff and role API
set passes 34 suites and 73 tests with one pre-existing skipped suite and test.
Five focused Admin files pass five tests, and 57 rendered Staff, role, and Audit
Log files pass 68 tests. Protected CI `33729449034` passed 877 API suites and
3,248 tests, 405 Admin files and 494 tests with one intentionally skipped file
and three existing honest TODOs, 531 Mobile suites and 910 tests with 84 TODOs,
all three TypeScript checks, the Admin production build, and Docker image
boot/liveness at commit `6baf6e39`. Protected Gates `33729449225` passed A
through E and the `All gates passed` rollup at the same commit. No role profile,
staff account, authorization, session, customer, provider, booking, payment,
historical audit row, database schema, master, or production record changed.
Production synchronization remains blocked by E32.

## Checkpoint BK: exact retained commission-agreement audit evidence

Commission-rate scheduling and cancellation actions retained exact agreement
UUIDs, but the general Audit Log sent tier-scoped `config` events to System
Settings and left provider-scoped events without a durable exact destination.
Generic `system` events were also sent to System Settings even though that
workspace does not own records such as PII reveals or legacy password-rotation
campaigns. These links gave support operators a plausible-looking but false
handoff, and a retained cancelled or superseded agreement could be hidden by
the normal paginated commission history.

OPS-422 adds a bounded exact service read for a tier- or provider-scoped
commission agreement in any retained lifecycle state, independently of the
history list. It includes scope, schedule, rate, owners, cancellation evidence,
and the count of immutable booking commission snapshots that reference that
agreement. OPS-423 exposes the exact Admin route. SEC-056 verifies that a
customer account cannot access the record, and SEC-057 rejects a malformed UUID
before service access. Existing Admin and Super Admin read access is preserved;
all commission mutations remain Super Admin-only.

UX-1129 maps a provider-scoped commission action through its retained
`commissionRateVersionId` to
`/financials?tab=commission&commissionRateId=<id>`. UX-1130 maps a tier-scoped
commission `config` action through its exact entity UUID to the same workspace
instead of System Settings. The Financials workspace loads the exact agreement
independently of the normal history list and renders a separate read-only
evidence panel with its canonical ID, lifecycle, provider or tier, service
scope, rate, booking-snapshot usage, Manila effective and recorded times,
owner, approver, business reason, and cancellation evidence. The panel makes
the approved E50 contract explicit: agreements are append-only and
effective-dated, and cancelling or superseding one does not recalculate an
existing booking's captured commercial terms.

UX-1131 rejects malformed selections without an arbitrary detail request.
UX-1132 rejects a response whose ID differs from the requested audit target
instead of substituting a list record. UX-1133 removes only
`commissionRateId` when the operator clears the evidence, preserving unrelated
Financials URL context. UX-1134 removes the false System Settings destination
from unknown `config` and generic `system` events while keeping those events
visible and expandable in the Audit Log. UX-1135 removes a hidden exact target
when the operator leaves Commission Controls. The exact panel presents current
retained lifecycle state; the originating Audit Log row remains the evidence of
what was recorded at event time.

Local API and Admin TypeScript, changed-file ESLint, and `git diff --check`
pass. Four focused API suites pass four tests, and the expanded commission and
financial-admin API set passes 21 suites and 44 tests. Seven focused Admin files
pass seven tests, and 53 rendered Financials and Audit Log files pass 62 tests.
Protected CI `33732523134` passed 881 API suites and 3,252 tests, 412 Admin
files and 501 tests with one intentionally skipped file and three existing
honest TODOs, 531 Mobile suites and 910 tests with 84 TODOs, all three
TypeScript checks, the Admin production build, and Docker image boot/liveness
at commit `68538e73`. Protected Gates `33732522938` passed A through E and the
`All gates passed` rollup at the same commit. No commission agreement, booking,
payment, customer, provider, setting, historical audit row, database schema,
master, or production record changed. PII-reveal events still need a truthful
exact handoff to their originating masked audit record; this checkpoint does
not claim that linkage. Production synchronization remains blocked by E32.
