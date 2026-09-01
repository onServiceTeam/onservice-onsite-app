# Admin and company continuous audit, 2026-08-31

## Purpose and honesty boundary

This is the resumable record for the suspicion-first admin/company stage that follows the provider and customer desktop/linkage audits. It records what was inspected, what was changed, what was proven by executed tests, and what remains. It does not treat the existence of a route, table, button, or old test as proof that an operator workflow is feasible.

The current stage is not a declaration that every admin screen is complete. Completed checkpoints cover Business Account 360, business projects, notification templates, promo redemption controls, customer-home banners, marketing campaign records, communications moderation, support operations, Booking 360/Dispatch integrity, financial-operations truth, Customer/Provider 360 account-support authority, Catalog publishing, and the unambiguous parts of Service Areas operations. The remaining admin surfaces continue after these checkpoints.

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

1. Tester Feedback and the stored third-party review corpus, tracing every item
   to customer, provider, support, product, and admin implications.
2. Dashboard, Disputes, Pricing Rules, Recurring Work, Audit Log, authentication,
   Change Password, shell/navigation, and Not Found coverage not already closed by
   the operational checkpoints.
3. Update the full customer/provider/admin linkage ledger, then rerun the broad
   suites and protected CI gates before any merge or deployment decision.

Existing legal, money, production-data, and privileged-identity escalation
boundaries still apply. A page-local visual improvement is not permission to
invent legal wording, mutate production money, or bypass those controls.
