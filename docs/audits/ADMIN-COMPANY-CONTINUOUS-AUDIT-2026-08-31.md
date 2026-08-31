# Admin and company continuous audit, 2026-08-31

## Purpose and honesty boundary

This is the resumable record for the suspicion-first admin/company stage that follows the provider and customer desktop/linkage audits. It records what was inspected, what was changed, what was proven by executed tests, and what remains. It does not treat the existence of a route, table, button, or old test as proof that an operator workflow is feasible.

The current stage is not a declaration that every admin screen is complete. Completed checkpoints cover Business Account 360, business projects, notification templates, promo redemption controls, customer-home banners, marketing campaign records, communications moderation, support operations, and the current Booking 360/Dispatch integrity pass. The remaining admin surfaces continue after these checkpoints.

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

## Verification at checkpoints D through F

- All three workspace TypeScript checks: passed.
- Admin production build: passed.
- API production build: passed.
- Full repository ESLint: passed.
- Admin full suite: 198 passed files, 1 skipped file; 308 passed tests and 3 explicit todos.
- API full locally runnable run: 545 passed suites, 1 skipped suite; 3,137 passed tests and 1 intentional skip. The Docker-dependent nginx certificate configuration test was excluded because Docker Desktop is unavailable in the local environment; CI remains the execution gate for that check.
- `git diff --check`: passed.

## Next admin/company audit queue

The next continuous loop starts from the admin navigation inventory and rechecks each remaining page against the operating questions above. Priority order is:

1. Financial operations: payment intents/events, refunds, invoices, payouts, AML holds, reconciliations, and immutable money/audit boundaries.
2. Customer and Provider 360 action feasibility, including enforcement impact, support ownership, sessions, documents, service areas, staff, and history.
3. Catalog, service-area, cancellation-policy, compliance, data-protection, analytics, settings, roles, and all remaining configuration fields.
4. Screen-by-screen visual verification at phone, tablet, desktop, empty/error/partial/overflow states, followed by the full customer/provider/admin linkage ledger update.

Existing legal, money, production-data, and privileged-identity escalation boundaries still apply. A page-local visual improvement is not permission to invent legal wording, mutate production money, or bypass those controls.
