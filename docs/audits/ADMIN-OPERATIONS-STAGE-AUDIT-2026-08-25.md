# Admin operations stage audit, 2026-08-25

## Status

This is the durable route-by-route control ledger for the admin overhaul requested by Ken. It is intentionally incomplete. `W1` means the current stage inspected and changed the named surface with rendered behavior tests. It does not mean every state on that page has been manually exercised. `NEXT` means the page remains in the active screen-by-screen pass. `HOLD` means money, compliance, legal, or policy behavior cannot be changed autonomously even though safe visual and accessibility work may continue.

Current audited code checkpoint: `6a7bcc696071338aeb96c6476075a17332f12a45`.
The W1 code checkpoint was `0facf52d0662a465a74c0e3dd65cc6ac2618afb1`; its documentation and production-evidence checkpoint was `cc15c61b7cacad2911e6bae97fe48d4e43179df7`.

## Shared admin contract established in W1

- The shell now has a bounded 1,600-pixel workspace, route and record breadcrumbs, collapsible desktop navigation, mobile navigation without decorative shadow, truthful production/staging/development labeling, Philippine time, keyboard page search, and a reachable account menu at phone through desktop widths.
- Search is explicit about its current limit. It searches page and workspace destinations only. It does not pretend to search bookings, people, tickets, disputes, or payouts.
- Shared buttons and form controls now meet the 44-pixel target contract. Cards, inputs, menus, dialogs, switches, tooltips, KPI cards, and the dispatch drawer use solid borders rather than decorative shadows.
- Consequential actions now have reusable accessible in-app confirmation and reason dialogs. The reason dialog can write the operator's actual reason into APIs that already support audit notes.
- Catalog service and add-on deletion is correctly presented as deactivation. It requires a reason and preserves historical booking evidence while removing the option from new customer booking.
- Service-area activation states the customer booking, provider matching, capacity, and waitlist effects. Default-market changes state their customer/provider map and picker effects.
- Business-account approval states payment terms and credit limit before mutation. Suspension no longer asks twice after a reason has already been supplied.
- Notification-template decisions, recurring cancellation, A/B lifecycle actions, and provider-quality recomputation no longer use browser-native prompts.
- The final provider review emoji icon was replaced with the centralized `Star` icon after the icon-governance check found it.

## Routed screen ledger

| Route | Company/support purpose | Stage | Current boundary or next check |
| --- | --- | --- | --- |
| `/login` | Admin authentication | W2 | A first-time visit without the readable admin session hint now settles signed out without generating expected `/auth/me` and refresh 401s. Returning sessions still hydrate normally. |
| `/change-password` | Credential rotation | W1/PREVIOUS | Account menu now reaches it at all widths. Existing forced-rotation behavior remains unchanged. |
| `/` | Command center | NEXT | Re-audit every queue, metric definition, source failure, and cross-link after shell release. |
| `/providers` | Provider queue | NEXT | Recheck application filters, bulk support workflow, capacity context, and Provider 360 exits. |
| `/providers/:id` | Provider 360 | NEXT | Recheck every tab, staff suspension, internal notes, evidence, payout, service-area, booking, and support linkage. |
| `/customers` | Customer queue | NEXT | Recheck search, segmentation, masking, status, and Customer 360 exits. |
| `/customers/:id` | Customer 360 | NEXT | Recheck account enforcement, fraud-review context, booking/support/payment linkage, and audit evidence. |
| `/bookings` | Booking operations queue | NEXT | Recheck status definitions, service-area context, assignment, customer/provider exits, and tablet table behavior. |
| `/bookings/:id` | Booking 360 and evidence | HOLD/NEXT | Safe layout can continue. Escrow release, refund, cancellation, and force-complete actions are money-path decisions. |
| `/catalog` | Customer bookable scope and provider fulfillment contract | W1 | Service/add-on deactivation now requires audit reason and states customer impact. Continue modal and all pricing-type state visuals. |
| `/projects` | Larger-work planning oversight | NEXT | Preserve D28 and milestone escrow holds while checking customer/provider linkage and honest capability boundaries. |
| `/disputes` | Trust queue | HOLD/NEXT | Safe case layout can continue. Resolution outcome changes remain under E18/E24 money-path holds. |
| `/disputes/:id` | Dispute 360 | HOLD/NEXT | Recheck evidence chronology and role exits. Settlement/reopen semantics remain held. |
| `/financials` | Payments, escrow, tax workpapers, reconciliation | HOLD | No money/tax mutation behavior changed in W1. Requires dedicated finance audit and decision-safe tests. |
| `/payouts` | Provider withdrawal decisions | HOLD | Existing internal large-payout review is not described as statutory AML. Transfer and decision behavior remain money-path controlled. |
| `/notification-templates` | Customer/provider communications | W1 | Create, update, activate, deactivate, and delete use in-app decisions with channel impact. Continue variable validation and preview audit. |
| `/recurring` | Series support | W1/HOLD | Cancellation has one reasoned decision and clear existing/future booking impact. E20 still holds automatic charging. |
| `/business-accounts` | Enterprise account queue | W1 | Approval previews terms and credit limit; suspension explains booking and invoicing impact. |
| `/business-accounts/:id` | Enterprise account 360 | NEXT | Recheck members, contracts, invoices, bookings, account owner/manager, and support linkage. |
| `/service-areas` | Market, coverage, and provider-capacity control | W1 | Activation/default/pause/create decisions now state cross-role effects. Continue create/edit responsive layout and provider-request decision states. |
| `/analytics` | Decision support | W1 | A/B and quality actions are accessible and explicit; retention and commission remain truth-labeled. Continue complete tab state visuals. |
| `/audit-log` | Operator accountability | NEXT | Recheck actor, target, reason, before/after detail, filters, export, and links back to source records. |
| `/support-tickets` | Support case queue | W2 | Queue-wide active signals, unassigned filtering, persona-correct waiting states, reopening, required workflow notes, success feedback, and visible append-only manual status history are implemented. No SLA is invented. |
| `/staff` | Company access and responsibility | NEXT | Recheck role truth, candidate selection, DPO segregation, account status, and support-team workflow. |
| `/settings` | Platform configuration | HOLD/NEXT | Live, held, and unconnected classifications exist. Money/security settings need source-specific review and rollback preview. |
| `/settings/cancellation-policy` | Customer cancellation presentation | HOLD | E09 blocks changing policy/money semantics until display and refund math have one authority. |
| `/pricing-rules` | Surge and revenue-share control | HOLD | E28 records the missing server-authoritative preview/staged publication decision. Only safe Stitch surface cleanup occurred in W1. |
| `/marketing` | Promotions, referrals, campaigns | NEXT | Recheck feature flags, audience truth, delivery state, redemption linkage, and held payment claims. |
| `/dispatch` | Live assignment and coverage | W1 PARTIAL/HOLD | Decorative shadows and fixed drawer width were corrected. Reassignment/cancellation remain booking and refund-path controlled. |
| `/communications` | Cross-role message operations | W2 | Review queue is first, lists paginate, search is submitted rather than per-keystroke, exact message focus is preserved, participant/booking links remain visible, and moderation states participant impact plus audited success. Delivery-state evidence remains a later check. |
| `/feedback` | Third-party tester feedback queue | W2 | Original evidence, named ownership, decision notes, no-op protection, explicit search, and visible append-only owner/status history are implemented. Production still has 10 new and 0 assigned submissions, so operational triage remains real company work rather than a code claim. |
| `/compliance` | Regulatory and tax controls | HOLD | Dedicated compliance review required. No regulatory meaning or status behavior changed in W1. |
| `/data-protection-log` | DSR operations | HOLD | E21 retention matrix and DPO process remain authoritative blockers for semantic changes. |
| `/consent-versions` | Legal-document publication history | HOLD | F#10/E26 legal-source conflict remains open. Safe layout work only until attorney-approved wording/status is reconciled. |
| `*` | Safe route recovery | PRIOR | Existing rendered recovery remains. Recheck final shell breadcrumb behavior after all routes settle. |

## W2 support, feedback, and communications contract

- Tester Feedback no longer overwrites the only visible decision record. The current state remains editable, while up to 100 earlier owner, status, actor, and evidence-note decisions are read from the append-only audit log. Identical submissions are rejected server-side instead of creating duplicate audit events.
- Feedback and conversation search now runs on submission or clear, not on every keystroke. Communications and moderation queues page through the complete server result instead of silently stopping at 50 rows.
- Support queue cards use whole-queue counts. Urgent and unassigned cards open matching active-case filters, and the filter state is visible and removable.
- Every manual support status decision requires a 10-character workflow note and writes the before/after state, acting administrator, reason, owner, and resolution inside one database transaction. The status history is visible in the case workspace.
- Reopening a resolved or closed case clears stale terminal timestamps and current resolution text. The earlier outcome remains in append-only history.
- Waiting states follow the private case owner. Customer-owned cases can wait on the customer; provider and provider-staff cases can wait on the provider. The UI hides impossible states and the API rejects a crafted invalid transition.
- Support replies, internal notes, assignment, case creation, status decisions, redaction, and report review now return explicit outcome text. Internal notes state that the user cannot see them; moderation explains whether content remains participant-visible or is hidden.
- First-time admin login no longer creates expected unauthenticated `/auth/me` and refresh failures when no session hint exists. A returning admin with the session hint still uses normal hydration and refresh behavior.
- Shared pagination now wraps at narrow widths, exposes current-page semantics, and keeps 44-pixel action targets across every admin list that uses it.

These changes are Bugs UX-415 through UX-428. They do not alter money, dispute, cancellation, legal, privacy-retention, or pricing-rule behavior held by the existing escalation records.

## Remaining browser-native confirmations after W2

W1 reduced the count from 44 to 31. W2 worked on support, feedback, communications, session bootstrap, and shared pagination, none of which contained those remaining prompts. The count therefore remains 31. They are deliberately visible here rather than being hidden by a false completion claim.

| Screen | Count | Reason not converted in W1 |
| --- | ---: | --- |
| Booking 360 | 4 | Escrow, refund, cancellation, and completion money effects |
| Compliance | 2 | DSR/regulatory action and export scope |
| Consent Versions | 1 | Legal publication lifecycle |
| Customer 360 | 2 | Account suspension and fraud review need enforcement evidence design |
| Data Protection | 4 | DSR completion, information request, rejection, and NPC escalation |
| Dispute 360 | 2 | Escalation/reopen tied to dispute lifecycle |
| Disputes queue | 1 | Resolution outcome can apply money effects |
| Dispatch | 2 | Provider reassignment and cancellation/refund flow |
| Financials | 5 | Reconciliation and tax workpaper operations |
| Payouts | 1 | Provider-money decision |
| Pricing Rules | 1 | Live charge/revenue-share rule toggle under E28 |
| Provider 360 | 2 | Staff suspension and internal-note deletion |
| Cancellation Policy | 1 | E09 policy/refund authority conflict |
| System Settings | 3 | Live configuration, cache, and reset impact |

## W1 verification

- Admin: 102 test files passed, 1 skipped; 215 tests passed, 3 explicit todos.
- Admin TypeScript and lint passed.
- Admin production build passed across 2,839 modules.
- Focused mobile provider-review behavior test passed.
- Icon governance passed with no emoji used as interface iconography.
- `git diff --check` passed.
- GitHub independently passed all CI and governance jobs for W1.
- Production source and admin/mobile artifacts were deployed from exact checkpoint `cc15c61b7cacad2911e6bae97fe48d4e43179df7` after database, uploads, config, Git, and prior-frontend backups. Admin entry `index-AkDHKtUG.js`, CSS `index-CgvxNk4_.css`, and mobile entry `entry-53a2562ea4e4c3513c97a498ec695af3.js` matched local hashes. API readiness, protected rejection, nginx validation, upload mounts, settings drift, and the shared containers passed.
- Public admin login rendered the intended one-column phone and split tablet/desktop compositions at 390, 1024, and 1440 pixels. The two unauthenticated bootstrap 401 console requests found in that evidence are the specific W2 defect addressed by Bug UX-415.

## W2 local verification

- Admin: 110 test files passed, 1 skipped; 223 tests passed, 3 explicit todos.
- API: all 449 locally runnable suites passed, 1 suite remained intentionally skipped; 3,093 tests passed. The separate production-nginx certificate test requires a running Docker engine and could not start because Docker Desktop was off. This is an environment prerequisite, not counted as a pass; live `nginx -t` remains required after deployment.
- Admin and API TypeScript passed. Admin lint passed. Both production builds passed; admin transformed 2,839 modules.
- Gate A, Gate C, and all six gate self-tests passed. Gate D and Gate E correctly reported their configured observational mode.
- `git diff --check` passed.
- GitHub CI, production backup, deployment, live nginx validation, health, exact artifact hashes, and post-deploy browser evidence were subsequently completed as recorded below.

## W2 GitHub and production evidence

- GitHub revision `18eb063be40072a125ca31524a4f73c7c18aaedf` passed CI run `32851713070` and Gates run `32851713166`. API TypeScript/tests, mobile TypeScript/full tests, admin TypeScript/build/full tests, API image build/boot, Gate A, Gate C, the gate self-tests, and the all-gates summary were green.
- The shared server aliases `/opt/onservice` and `/opt/onservice-onsite-app` resolved to the same exact onService repository. It was clean at W1, fast-forwarded only to `18eb063be40072a125ca31524a4f73c7c18aaedf`, and remained clean after deployment.
- Pre-deploy backups were `onservice-20260825-091543.sql.gz` (148K), the matching uploads archive (4.3M), config archive (28K), Git bundle (29M), and `frontends-before-admin-w2-cc15c61-20260825-091543.tgz` (1.8M).
- Only the onService API image and admin web artifact changed. No database migration, seed, mobile artifact change, Postgres/Redis/pgBouncer recreation, or shared-nginx recreation occurred. The built API image was `sha256:d1389471b726c00d17700fd52ad3075ca9f8a3ef9902db94b0f6e7f4be737359`.
- Admin entry `index-BeOYcOta.js`, CSS `index-CRABuTuJ.css`, Support `SupportTicketsPage-D9utzU8n.js`, Feedback `FeedbackPage-DptCq5O4.js`, and Communications `CommunicationsPage-BVdGdloJ.js` matched local SHA-256 values exactly. The public login returned 200 and referenced the new entry.
- API readiness returned 200 inside the container with Postgres and Redis `ok`; the API container reached healthy. `nginx -t` passed. All 25 shared containers were running with zero unhealthy or exited containers. The uploads volume remained read/write in API and read-only in nginx.
- The public API hostname retained its expected edge-level 403 behavior for direct config and protected support-summary requests. The protected response contained only the generic nginx rejection page.
- The read-only feedback recheck remained 10 submissions, 5 issue items, all `new`, and 0 assigned. No production feedback content or personal data was printed or changed.
- Clean browser geometry/DOM checks at 390×844, 1024×768, and 1440×900 showed no horizontal overflow. Phone showed only the single-column authentication workspace; tablet split 435/589 pixels; desktop split 612/828 pixels. All three had zero captured console warnings or errors, confirming that Bug UX-415 removed W1's first-visit authentication noise. The browser screenshot capture API failed, so no new image artifact is claimed for this evidence.
