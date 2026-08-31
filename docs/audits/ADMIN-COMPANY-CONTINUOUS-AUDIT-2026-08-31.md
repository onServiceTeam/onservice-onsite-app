# Admin and company continuous audit, 2026-08-31

## Purpose and honesty boundary

This is the resumable record for the suspicion-first admin/company stage that follows the provider and customer desktop/linkage audits. It records what was inspected, what was changed, what was proven by executed tests, and what remains. It does not treat the existence of a route, table, button, or old test as proof that an operator workflow is feasible.

The current stage is not a declaration that every admin screen is complete. The first checkpoint covers Business Account 360, business projects, notification templates, promo redemption controls, customer-home banners, and marketing campaign records. The remaining admin surfaces continue after this checkpoint.

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

## Verification at this checkpoint

- Admin TypeScript: passed.
- API TypeScript: passed.
- ESLint on every changed and new TypeScript/TSX file: passed.
- Admin full suite: 182 passed files, 1 skipped file; 292 passed tests and 3 explicit todos.
- API full locally runnable suite: 532 passed suites, 1 skipped suite; 3,124 passed tests and 1 intentional skip.
- The Docker-dependent nginx certificate configuration test was not counted as a pass because Docker Desktop was off. Its failure was inability to connect to the local Docker engine, before nginx validation ran.
- `git diff --check`: passed.

## Next admin/company audit queue

The next continuous loop starts from the admin navigation inventory and rechecks each remaining page against the operating questions above. Priority order is:

1. Support and communications linkage from booking, customer, provider, payment, dispute, and private/public message context.
2. Booking/dispatch state transitions, exception queues, proof-to-close evidence, cancellation/no-show, and exact company ownership.
3. Financial operations: payment intents/events, refunds, invoices, payouts, AML holds, reconciliations, and immutable money/audit boundaries.
4. Customer and Provider 360 action feasibility, including enforcement impact, support ownership, sessions, documents, service areas, staff, and history.
5. Catalog, service-area, cancellation-policy, compliance, data-protection, analytics, settings, roles, and all remaining configuration fields.
6. Screen-by-screen visual verification at phone, tablet, desktop, empty/error/partial/overflow states, followed by the full customer/provider/admin linkage ledger update.

Existing legal, money, production-data, and privileged-identity escalation boundaries still apply. A page-local visual improvement is not permission to invent legal wording, mutate production money, or bypass those controls.
