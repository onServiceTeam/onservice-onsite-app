# Admin operations stage audit, 2026-08-25

## Status

This is the durable route-by-route control ledger for the admin overhaul requested by Ken. It is intentionally incomplete. `W1` means the current stage inspected and changed the named surface with rendered behavior tests. It does not mean every state on that page has been manually exercised. `NEXT` means the page remains in the active screen-by-screen pass. `HOLD` means money, compliance, legal, or policy behavior cannot be changed autonomously even though safe visual and accessibility work may continue.

Current audited code checkpoint: `f4e6dda640497c1c26e280da395390289c0201e4`.
The W1 code checkpoint was `0facf52d0662a465a74c0e3dd65cc6ac2618afb1`; its documentation and production-evidence checkpoint was `cc15c61b7cacad2911e6bae97fe48d4e43179df7`.

## Shared admin contract established in W1 and extended through W12

- The shell now has a bounded 1,600-pixel workspace, route and record breadcrumbs, collapsible desktop navigation, mobile navigation without decorative shadow, truthful production/staging/development labeling, Philippine time, keyboard page search, and a reachable account menu at phone through desktop widths.
- Search preserves page/workspace destinations and now adds bounded server-backed record search for customers, providers, bookings, support tickets, disputes, and payouts. Every result opens a canonical workspace, customer/provider contact remains masked, and DPO accounts remain page-only while E34 is unresolved.
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
| `/` | Command center | W9 PARTIAL | Exact action queues now expose verified-paid unassigned bookings, unassigned/urgent/all open support, provider approvals, active/escalated/stale disputes, and tester feedback. Range state is URL-bound; failed sources, current wallet snapshots, period metrics, city booking attribution, provider capacity, and downstream links are labelled truthfully. Authenticated live visual evidence and broader analytics definitions remain open; DPO access is held under E34. |
| `/providers` | Provider queue | W3+W11 PARTIAL/HOLD | Queue approval uses the same atomic rationale/checklist contract as Provider 360. W11 now guarantees that a submitted application carries its Admin-configured primary market, exact operating pin, live-bounded radius, and categories into the canonical pending provider. Suspension and reactivation require reasons, preserve the audit record, state active-booking effects, and notify the provider. E35 holds durable drafts and rejected resubmission; E36 records that approval does not yet enforce the ID-back image. Recheck filters, bulk support workflow, capacity context, and Provider 360 exits. |
| `/providers/:id` | Provider 360 | W3+W5 PARTIAL/HOLD | Approval, staff, notes, certifications, Jobs, Financials, Reviews, Disputes, and Activity now form a linked case workspace. Review moderation/public responses and certification decisions are provider-scoped and transactionally audited; staff audit verbs are now admitted by the database. E29/D31 still holds automatic handling of bookings assigned to suspended staff, and E31/D33 still holds wallet-adjustment limits/dual control. Authenticated visual-state review remains open. |
| `/customers` | Customer queue | W7 PARTIAL | Ordinary-admin contacts are masked; account state and fraud review are separate signals; search covers full name, phone, email, and customer ID; whole-queue totals and support/dispute/active-booking workload are visible; and rows open Customer 360, filtered bookings, or a user-bound support workspace. Saved views, named ownership, and authenticated wide-state evidence remain open. |
| `/customers/:id` | Customer 360 | W4 PARTIAL/HOLD | Suspension/reactivation are reasoned, audited, session-revoking, generic-notice workflows. Booking/payment/dispute/provider/referral records link to canonical workspaces; activity identifies actors and client evidence; fraud analytics use configured window and no-refund semantics. E30/D32 holds fraud-review clearance. E31/D33 holds unbounded single-operator wallet adjustments. Continue wallet-control, complete chronology, and authenticated visual-state review. |
| `/bookings` | Booking operations queue | W6+W8 PARTIAL | The responsive row-grid exposes URL-bound operational views/sorts, whole-queue exception counts, specific service/city/schedule context, Customer/Provider 360 exits, linked support ownership, open disputes, and gross booking value. Only verified-paid unassigned work is labelled **Paid needs assignment**. Named booking ownership is deliberately not duplicated outside support cases; authenticated wide-state evidence remains open. |
| `/bookings/:id` | Booking 360 and evidence | W6 PARTIAL/HOLD | Conversation and support-case exits, partial-address truth, gateway/wallet/retained-sales money chronology, and rendered action confirmations are connected. Cancellation requires explicit live money inputs but E09 still holds policy/runtime authority; escrow release, refund, cancellation, and force-complete semantics remain money-path controlled. |
| `/catalog` | Customer bookable scope and provider fulfillment contract | W1 | Service/add-on deactivation now requires audit reason and states customer impact. Continue modal and all pricing-type state visuals. |
| `/projects` | Larger-work planning oversight | NEXT | Preserve D28 and milestone escrow holds while checking customer/provider linkage and honest capability boundaries. |
| `/disputes` | Trust queue | W9 PARTIAL/HOLD | Exact active and stale whole-queue views are URL-bound and enforced by the API, and list resolution now uses an in-app impact confirmation. Resolution/settlement behavior is unchanged and remains under E18/E24; no unsupported SLA countdown was added. |
| `/disputes/:id` | Dispute 360 | HOLD/NEXT | Recheck evidence chronology and role exits. Settlement/reopen semantics remain held. |
| `/financials` | Payments, escrow, tax workpapers, reconciliation | HOLD | No money/tax mutation behavior changed in W1. Requires dedicated finance audit and decision-safe tests. |
| `/payouts` | Provider withdrawal decisions | W10 PARTIAL/HOLD | Global record search can open one exact payout through a visible URL-bound filter and Clear action. Existing internal large-payout review is not described as statutory AML. Transfer and decision behavior remain money-path controlled. |
| `/notification-templates` | Customer/provider communications | W1 | Create, update, activate, deactivate, and delete use in-app decisions with channel impact. Continue variable validation and preview audit. |
| `/recurring` | Series support | W1/HOLD | Cancellation has one reasoned decision and clear existing/future booking impact. E20 still holds automatic charging. |
| `/business-accounts` | Enterprise account queue | W1 | Approval previews terms and credit limit; suspension explains booking and invoicing impact. |
| `/business-accounts/:id` | Enterprise account 360 | NEXT | Recheck members, contracts, invoices, bookings, account owner/manager, and support linkage. |
| `/service-areas` | Market, coverage, and provider-capacity control | W1+W11 | Activation/default/pause/create decisions state cross-role effects. The same active, soft-launch, and recruiting area records now drive provider market selection, boundary validation, and the primary-area link at application time. Continue create/edit responsive layout and provider-request decision states. |
| `/analytics` | Decision support | W1 | A/B and quality actions are accessible and explicit; retention and commission remain truth-labeled. Continue complete tab state visuals. |
| `/audit-log` | Operator accountability | W12 PARTIAL/HOLD | The page and masked CSV now share the same `audit_log` plus `admin_actions` source/filter contract; action, entity type, exact record, exact actor, source, and date filters are validated and URL-bound; every supported record type has a canonical exit; and one responsive timeline becomes cards below desktop width. E37 holds any claim of a global request trace: the dormant middleware is not mounted, `request_id` is not populated, and many mutations have no writer. Authenticated visual-state evidence remains open. |
| `/support-tickets` | Support case queue | W2 | Queue-wide active signals, unassigned filtering, persona-correct waiting states, reopening, required workflow notes, success feedback, and visible append-only manual status history are implemented. No SLA is invented. |
| `/staff` | Company access and responsibility | NEXT | Recheck role truth, candidate selection, DPO segregation, account status, and support-team workflow. |
| `/settings` | Platform configuration | HOLD/NEXT | Live, held, and unconnected classifications exist. Money/security settings need source-specific review and rollback preview. |
| `/settings/cancellation-policy` | Customer cancellation presentation | HOLD | E09 blocks changing policy/money semantics until display and refund math have one authority. |
| `/pricing-rules` | Surge and revenue-share control | HOLD | E28 records the missing server-authoritative preview/staged publication decision. Only safe Stitch surface cleanup occurred in W1. |
| `/marketing` | Promotions, referrals, campaigns | NEXT | Recheck feature flags, audience truth, delivery state, redemption linkage, and held payment claims. |
| `/dispatch` | Live assignment and coverage | W6 PARTIAL/HOLD | The map now states its real sources: booking service locations and accepting-work providers' saved service bases, not live GPS/presence. A derived attention queue replaces the nonexistent alert feed; every record links to its canonical workspace; participant support messaging is available to admins; reassignment is server-validated across account, availability, service, location, and radius; quick cancellation hands off to Booking 360. E09 and all money holds remain. |
| `/communications` | Cross-role message operations | W2+W6 | Review queue is first, lists paginate, search is submitted rather than per-keystroke, exact message focus is preserved, participant/booking links remain visible, and moderation states participant impact plus audited success. A `bookingId` deep link now opens the exact booking conversation and can be cleared. Delivery-state evidence remains a later check. |
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

## W3 provider-operations contract

- Provider approval can no longer succeed and then lose its rationale in a failed best-effort note request. Provider 360 and the provider queue send one checklist/rationale contract; the API validates it and writes status, provider role, audit evidence, and approval notification inside the approval transaction.
- Provider-account suspension and reactivation require 10–1,000-character reasons. The reason is stored in the admin record, delivered to the provider in the same transaction, and no longer appears in ordinary server logs.
- Suspension still flags in-progress provider bookings for review before escrow release. Reactivation deliberately does not clear those booking review holds.
- Provider-staff suspension/reactivation and internal-note deletion no longer use browser-native confirmation. Both require an operator reason, and the server rejects a crafted reasonless request.
- E29/D31 records one unresolved consequence honestly: a suspended staff member loses assigned-job access immediately while the booking retains that performer assignment. The operator is warned to take over or reassign; automatic mutation remains held until evidence attribution and customer continuity have one approved contract.
- The old MED-N71 approval test no longer passes by searching a fixed-length source-code slice. It now executes approval and asserts the notification written by the transaction.

These changes are Bugs UX-429 through UX-438. They do not claim that every Provider 360 tab or provider-queue state is complete.

## W4 customer-operations contract

- Customer suspension and reactivation no longer use browser-native confirmation. A super-admin must supply a reason after seeing the exact session, active-booking, open-dispute, and wallet boundary.
- Suspension changes account state, deletes stored refresh sessions, records previous/next state and revoked-session count, and sends a generic customer notice in one transaction. A previously issued short-lived access token can remain valid until expiry. Suspension does not cancel bookings, move money, or decide disputes.
- Internal enforcement evidence stays in the admin audit record and is not copied into the customer notification.
- Fraud-review state is visible and duplicate flagging is rejected. Fraud analysis now uses the configured time window and counts only `no_refund` outcomes as provider-favoring. Refunds accompanied by a provider warning or suspension no longer count against the customer.
- Customer 360 links booking rows, wallet transactions, payment intents, disputes, providers, referring/referred customers, and qualifying referral bookings to their canonical workspaces.
- The activity timeline identifies the customer/admin/system actor and displays available masked or role-authorized IP and client evidence. Open-dispute impact includes every dispute on the customer's bookings, regardless of which party filed it.
- Account status notifications open customer Account Management in both inbox and device-push routing.
- The MED-N15 fraud-action, MED-N14/N17 activity masking, and Phase 160 reason-bound tests now execute service behavior instead of passing by reading source text.
- E30/D32 records the missing auditable fraud-review clearance action. E31/D33 records the unbounded, single-operator wallet-adjustment risk. No schema or money behavior was invented in this wave.

These changes are Bugs UX-439 through UX-451. They do not claim that Customer 360's money controls, every visual state, or global customer queue are complete.

## W5 remaining Provider 360 contract

- Jobs expose every canonical booking status and link the exact booking, customer, and latest related dispute instead of leaving support with detached labels.
- Financials retain payout identifiers and open the provider-filtered payout queue. Wallet adjustment behavior is unchanged under E31/D33.
- Reviews and disputes now request 20-row pages and render reachable pagination instead of silently stopping after the first API envelope. Review/customer/booking and dispute/customer/booking records link to their canonical workspaces.
- Hiding/restoring a review requires a moderation reason. Adding/replacing a public admin response separates customer-visible copy from the internal support rationale. Both operations are provider-scoped, no-op protected, and write first-class audit actions in the same transaction as the review update.
- Certification verification/removal now writes the actor, evidence snapshot, before/after state, and reason atomically. Removing verification requires at least 10 characters. The existing provider notification remains post-commit.
- Provider Activity now includes attributable admin actions across the provider account, onboarding application, documents, certification, staff, notes, service-area requests, and reviews. It also identifies account-event actors while preserving MED-N14 IP/client masking.
- Migration 157 appends rather than replaces the live audit constraints. It admits the new review/certification events and repairs provider-staff action verbs/target that existed in application code but were absent from the database contract. The append pattern preserves later values such as `payout_completed`.

These changes are Bugs UX-452 through UX-462. They do not alter wallet, payout, booking assignment, escrow, refund, or dispute-resolution semantics.

## W6 booking, dispatch, and participant-support contract

- Booking search covers the identifiers and people operators actually receive: booking ID, customer name/phone/email, provider business/name/phone, service, and city. Results link directly to Customer and Provider 360.
- Booking 360 preserves partial addresses instead of hiding the whole location when one field is absent. It links the canonical conversation and related support cases and provides a read-only money chronology across gateway attempts, booking-linked wallet ledger entries, retained official-receipt/sales rows, and disputes without exposing client credentials.
- The five Booking 360 actions use rendered in-app decisions with visible impact, reason limits, and action-specific fields. Cancellation hours, provider-arrived, and customer-no-show inputs are explicit and server-validated; this improves evidence but does not resolve E09's policy/runtime mismatch.
- Reassignment is atomic across booking provider, performer-staff clearing, conversation participant, pending offers, and admin audit. The server independently rejects terminal bookings, same-provider requests, inactive/unapproved/unavailable providers, service mismatches, missing booking coordinates, and providers outside their service radius. Participant notices are post-commit.
- Dispatch distinguishes saved operational locations from live telemetry. It uses configured service-area centering, calls the availability toggle **accepting work**, replaces fabricated ETA and unsupported alert-tail concepts with scheduled time and a derived attention queue, and exposes canonical Booking/Customer/Provider/Conversation/Support exits.
- Dispatch no longer offers quick cancellation. **Review cancellation** opens Booking 360. Ordinary admins may send an audited participant Support message; reassignment and cancellation review remain super-admin actions.
- Participant support messaging upserts the booking conversation and writes the system message plus admin audit atomically. It is customer-only before assignment and reaches both participants after assignment. Communications can deep-link back to the exact booking conversation, and Audit Log uses participant-neutral action text.
- Dormant mobile GPS infrastructure remains unmounted for v1.0. W6 makes no live-location, privacy-consent, or background-location release claim.

These changes are Bugs UX-463-469, UX-472-476, and UX-478-486, plus the
real-render correction for BUG-PHASE97-01. Unused identifiers are not claimed.
They do not change escrow,
refund, cancellation calculation, payout, dispute-resolution, or live-GPS
semantics.

## W7 customer-queue operations contract

- Ordinary admins receive masked phone and email values in the queue. A super-admin may receive the raw values under the existing role policy; an ordinary agent must use the audited Customer 360 reveal workflow when full contact data is genuinely needed.
- Account state and fraud-review state are independent. The queue no longer invents `suspended` or `flag_fraud` as selectable customer-account statuses. The one **Inactive (includes suspended)** filter reflects the current database truth, while fraud review remains a separate risk signal.
- Search covers customer UUID, full name, phone, and email. Filter and sort state is URL-bound so an operator can preserve the exact queue view during a handoff.
- Whole-queue summary cards show total, active, inactive, and fraud-review counts rather than restating the current page. The default order puts fraud review, open support, open booking-linked disputes, and active bookings ahead of routine accounts. Operators can also sort by active bookings, completed gross booking value, or newest account.
- Each row distinguishes active bookings from lifetime bookings and shows open support cases plus open/all booking-linked disputes. Those counts come from the canonical booking, support-case, and dispute records rather than customer-filed-only approximations.
- Customer, booking, and support exits preserve identity context. Customer opens Customer 360; booking workload opens the booking queue searched by that customer UUID; support opens the support queue prefilled for that customer.
- Completed value is explicitly labelled gross. Refund, gateway, wallet, and net-money investigation remains in Customer 360 rather than being inferred from a booking total.
- The response extension is additive. An older server response without the new summary or operational fields still renders with safe count/status fallbacks instead of crashing the queue.

These changes are Bugs UX-487 through UX-494. UX-491 also extends booking
search to customer and provider UUIDs so the customer-queue handoff resolves
the intended records. They do not change account mutation, fraud-review,
wallet, payment, refund, escrow, dispute-resolution, or support-case lifecycle
semantics.

## W8 booking-queue operations contract

- The queue is now a bounded, responsive operational row-grid rather than a wide table with a second hidden mobile DOM. Phone, tablet, and desktop layouts preserve one copy of each booking and keep 44-pixel controls.
- Whole-queue cards expose total, active, verified-paid unassigned, open-support, open-dispute, and past-scheduled workload. Card actions apply the matching server view instead of filtering only the current page.
- Shareable URL state preserves search, status, view, sort, and page for handoffs. Server validation rejects unknown status, view, and sort values.
- Attention ordering prioritizes urgent support, unassigned support cases, open disputes, verified-paid unassigned bookings, past-scheduled records, and other open support work before routine bookings. Scheduled, newest, and gross-value alternatives remain available.
- Booking ownership follows the linked support case and its assigned administrator. The queue shows owner names, urgent/unassigned support signals, and canonical Support, Customer 360, Provider 360, and Booking 360 exits without inventing a competing booking-owner field.
- Service search and display use the booked subcategory name, falling back to the broad category only when the specific record is absent. This prevents operators from seeing a generic category where the booked service is known.
- Gross booking value remains explicitly gross. Payment, wallet, gateway, refund, escrow, and net-money conclusions belong in Booking 360.
- E33 records a critical existing contradiction: fixed-price creation can start provider offers before verified payment when auto-dispatch is enabled, despite E03's approved pay-first contract. W8 does not change dispatch or payment semantics. It only labels `provider_id IS NULL AND status='paid'` as assignment-ready; `requested`, `matched`, and `payment_pending` are never counted as paid assignment exceptions.

These changes are Bugs UX-495 through UX-503. They do not change booking,
offer, payment, escrow, refund, cancellation, payout, dispute, or support-case
lifecycle semantics.

## W9 dashboard and dispute-queue operations contract

- Dashboard action queues are backed by canonical predicates and exact links: verified-paid unassigned bookings, unassigned active support, urgent active support, all open support, pending provider approvals, active/escalated/stale disputes, and untriaged tester feedback. A count is never inferred from a chart or the current page.
- Date range is shareable in the URL. Today, 7d, 30d, 90d, and Manila-calendar YTD use validated server ranges; YTD supports a 366-day leap year without silently truncating January 1.
- A failed operational source is named as unavailable rather than represented as zero or an all-clear. Revenue, booking-volume, city, and alert panels preserve loading, retry, failure, and genuine-empty states separately.
- Period metrics and current snapshots are not mixed. Platform fee revenue and acquisition counts follow the selected range; active bookings and platform wallet balances are current operational state and say so.
- City demand uses the booking's normalized city/province, including unassigned bookings. Provider capacity uses approved providers with live service-area membership. City and guarantee-fund alerts open their canonical filtered workspaces, and DSR alerts open the Data Protection Log.
- The Disputes queue accepts exact `active` and `stale` views in both the URL and API. Active means unresolved; stale applies the existing age predicate. The list-level Resolve action now opens a rendered confirmation that names the refund/funds impact before sending the existing resolution request.
- No dispute outcome, refund calculation, escrow movement, filing window, SLA, or participant-settlement contract changed. E18 and E24 remain the money-path authorities.
- E34 records a separate access contradiction: the D15 privacy-only DPO doctrine does not match the current admin navigation, client routing, Dashboard API, DSR permissions, or mixed Compliance page. W9 deliberately does not broaden DPO access or general-admin privacy authority.
- The stale source-regex coverage for BUG-PHASE136-01 was replaced by an executed service test. Four tautological/source-read escrow assertions were removed rather than counted as behavior, and the strict phantom-test scanner reports zero findings.

These changes are Bugs UX-504 through UX-514 plus the real-behavior correction
for BUG-PHASE136-01. They do not change payment, escrow, refund, payout,
dispatch, dispute-resolution, or compliance authorization semantics.

## W10 safe global record-search contract

- The shared header now searches customer, provider, booking, support, dispute, and payout records after two trimmed characters while preserving the existing page/workspace search.
- The API accepts one bounded `q` value, caps each entity query at four candidates and the combined response at twelve, and runs six fixed parallel queries rather than record-driven lookups.
- Operators may search the stored identifiers and operational references they receive during support, including customer/provider names, email or Philippine phone input, ticket number/subject, and payout transfer reference. Returned customer/provider contact is always masked, including for super-admin search results; full contact remains in the audited 360 reveal workflow.
- Result ranking and type labels make the record kind explicit. Destinations are canonical Customer 360, Provider 360, Booking 360, exact Support/Dispute workspaces, and the payout queue with an exact `payoutId` filter.
- The payout handoff shows a visible exact-payout banner, constrains both count and row queries to that payout, and can be cleared before broader provider search. It changes no approval, review-hold, reservation, transfer, rejection, or completion behavior.
- Search is limited to `admin` and `super_admin`. A DPO account keeps page-only command search and does not call the record API while E34 remains unresolved; W10 does not infer general operations authority from the DPO role.

These changes are Bugs UX-515 through UX-522. They do not change account,
booking, support, dispute, payment, payout, or compliance lifecycle semantics.

## W12 Audit Log operations contract

- The page is now an operations timeline rather than a raw event table. Applied filters are URL-bound and separate from draft values, so a copied URL recreates the same action, entity type, exact entity ID, exact actor ID, source, and date window.
- The list and CSV export read the same ordered union of explicit `audit_log` events and `admin_actions`. Both use exact record/source filtering and deterministic `created_at DESC, id DESC` ordering.
- Customer/provider contact, IP addresses, user agents, decision reasons, and nested old/new JSON are masked for every admin role in this bulk index and export. Full operational context remains in the relevant controlled record workflow, not a downloadable super-admin exception.
- Timeline rows use human-readable action names, identify System event versus Admin decision, expose expandable before/after detail, and link supported booking, customer, provider, dispute, payout, support, business, service-area, pricing, marketing, template, staff, and settings records to their canonical workspaces.
- The desktop timeline becomes bounded cards for phone and tablet browsers, preserving record and actor actions without a horizontal table dependency.
- E37 records the limit that cannot be fixed by mounting the old middleware. It is unused, writes after the response, has no durable outcome/correlation contract, can duplicate explicit domain events, and cannot prove that all cross-role mutations were captured. The visible workspace states this boundary.

These changes are Bugs UX-531 through UX-540. They do not claim global request
correlation, complete mutation evidence, immutable storage, or production data
coverage, and they do not change any lifecycle, money, legal, or role authority.

## Remaining browser-native confirmations after W9

W1 reduced the count from 44 to 31. W2 worked on support, feedback, communications, session bootstrap, and shared pagination, none of which contained those remaining prompts. W3 removed two Provider 360 prompts. W4 removed the two Customer 360 prompts. W6 removed four Booking 360 prompts and two Dispatch prompts, leaving 21. W7 and W8 changed read-only queue surfaces. W9 replaced the Disputes-list resolution prompt, leaving 20. The remaining prompts are deliberately visible here rather than being hidden by a false completion claim.

| Screen | Count | Current hold or remaining design work |
| --- | ---: | --- |
| Compliance | 2 | DSR/regulatory action and export scope |
| Consent Versions | 1 | Legal publication lifecycle |
| Data Protection | 4 | DSR completion, information request, rejection, and NPC escalation |
| Dispute 360 | 2 | Escalation/reopen tied to dispute lifecycle |
| Financials | 5 | Reconciliation and tax workpaper operations |
| Payouts | 1 | Provider-money decision |
| Pricing Rules | 1 | Live charge/revenue-share rule toggle under E28 |
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

## W3 local verification

- Admin: 115 test files passed, 1 skipped; 228 tests passed, 3 explicit todos.
- API: 454 locally runnable suites passed, 1 suite remained intentionally skipped; 3,098 tests passed. The separate production-nginx certificate test again could not run because Docker Desktop was off. This is not counted as a pass; live `nginx -t` remains required after deployment.
- Admin, API, and mobile TypeScript passed. Repository lint passed. Admin and API production builds passed; admin transformed 2,839 modules.
- Focused rendered admin tests cover all five W3 UI defects. Focused API tests cover all five W3 server defects, plus the affected approval, role, transaction, and provider-suspension suites.
- `git diff --check` passed.
- The locally built public admin entry rendered at 390×844, 1024×768, and 1440×900 with no horizontal overflow and no captured browser warnings or errors. This verifies the public authentication shell only. Authenticated Provider 360 and provider-queue behavior is supported by rendered tests, not falsely claimed as a live signed-in browser exercise.
- GitHub CI run `33299876772` and Gates run `33299876773` passed for W3. Production synchronization did not run because the current server rejected every supplied and agent-loaded SSH identity. E32 records the access blocker; no live W3 deployment claim is made.

## W4 local verification

- Admin: 121 test files passed, 1 skipped; 234 tests passed, 3 explicit todos.
- API: 460 locally runnable suites passed, 1 suite remained intentionally skipped; 3,081 tests passed. The separate production-nginx certificate test could not run because Docker Desktop was off. This is not counted as a pass; live `nginx -t` remains required after deployment.
- Mobile: 407 suites passed; 789 tests passed and 84 device-baseline todos remain explicit.
- Admin, API, and mobile TypeScript passed. Repository, admin, and mobile lint passed. Admin and API production builds passed; admin transformed 2,839 modules.
- Focused rendered admin tests cover the Customer 360 action, state, link, metric-window, referral, and activity defects. Focused API tests execute suspension, session revocation, audit, notice privacy, profile context, dispute semantics/scope, and actor behavior. The customer notification destination has a focused mobile contract test.
- `git diff --check` passed.
- Code checkpoint `a512e1ae2b24c7a42ccaf00c519e4921779fbec0` was pushed to `master`. GitHub CI run `33301291011` and Gates run `33301291020` passed on the W4 documentation checkpoint containing that code.
- Production backup, fast-forward, deployment, hashes, nginx validation, authenticated browser evidence, and live API checks remain blocked by E32. No production synchronization is claimed.

## W5 local verification

- Admin: 128 test files passed, 1 skipped; 241 tests passed, 3 explicit todos.
- API: 467 locally runnable suites passed, 1 suite remained intentionally skipped; 3,088 tests passed. The separate production-nginx certificate test could not run because Docker Desktop was off and is not counted as a pass.
- Focused rendered admin tests cover job/review/dispute/customer/booking/payout linkage, pagination, moderation reasons, public-response separation, and activity actors. Focused API tests execute canonical-ID projection, provider scoping, atomic review/certification auditing, and merged admin chronology.
- Admin and API TypeScript passed. Repository and admin lint passed. Admin and API production builds passed; admin transformed 2,839 modules. `git diff --check` passed.
- Code checkpoint `4c55afdfcfac118406c6dd917842e034922e1617` was pushed to `master`. Documentation checkpoint `b404b740ac6f6746296617f13788f9b86dc26156` passed GitHub CI run `33302473742` and Gates run `33302473709`, including the PostgreSQL migration job.
- Production backup, migration, deployment, hashes, nginx validation, authenticated browser evidence, and live API checks remain blocked by E32. No production synchronization is claimed.

## W6 local and GitHub verification

- Admin: 139 test files passed, 1 skipped; 249 tests passed, 3 explicit todos. API: 475 locally runnable suites passed, 1 suite remained intentionally skipped; 3,083 tests passed and 1 test remained intentionally skipped. The separate Docker-dependent generated-certificate nginx suite could not run because Docker Desktop was off and is not counted as a pass.
- Mobile: 407 suites passed; 789 tests passed and 84 device-baseline todos remain explicit.
- Admin, API, and mobile TypeScript passed. Repository lint passed. Admin and API production builds passed; admin transformed 2,839 modules. The mandatory API smoke passed 13/13 and the environment contract passed all 81 safe-default checks.
- Gate A passed all 10 blocking fragments, Gate C passed all 6 blocking articles, and all 6 gate self-tests passed. Gate D and Gate E only reported their configured observational modes and are not claimed as visual-baseline or mutation evidence. `git diff --check` passed.
- Focused rendered admin tests cover booking-party links, rendered action decisions, configured dispatch centering, derived attention, saved-base/accepting-work truth, exact conversation deep links, cancellation handoff, partial addresses, money chronology, support access, and audit labels. Focused API tests execute search, money projection, partial addresses, transactionally coupled reassignment/messages, cancellation input validation, support-admin authorization, and independent availability/service/radius checks.
- Code checkpoint `5021422844b8f30f5d9bcc076d8c0abcf2d4d05c` was pushed to `master`. GitHub Gates run `33308846223` passed. CI run `33308846227` attempt 1 was cancelled after the Docker runner stalled while initializing its service container; attempt 2 passed Mobile, API, Admin, and the API Docker image build plus liveness boot check.
- Production backup, fast-forward, deployment, hashes, nginx validation, authenticated browser evidence, and live API checks remain blocked by E32. No production synchronization is claimed.

## W7 local and GitHub verification

- Admin: 142 test files passed, 1 skipped; 252 tests passed, 3 explicit todos. API: 480 locally runnable suites passed, 1 suite remained intentionally skipped; 3,088 tests passed and 1 test remained intentionally skipped. The separate Docker-dependent generated-certificate nginx suite was excluded locally and is not counted as a pass.
- Focused rendered admin tests execute the support-ready queue, canonical exits, URL-bound sort behavior, and compatibility with an older additive response. Focused API tests execute role-based contact masking, full-name/status truth, operational counts, booking UUID search, and the server sort allowlist/order.
- Admin and API TypeScript passed. Repository and admin lint passed. Admin and API production builds passed; admin transformed 2,839 modules. `git diff --check` passed.
- Code checkpoint `ddcfdc44d05fb2807389192cb9cbe4f69760eea5` was pushed to `master`. GitHub Gates run `33310413687` passed. CI run `33310413661` passed Mobile, API, Admin, and the API Docker image build plus liveness boot check.
- Authenticated Customer queue browser evidence remains rendered-test evidence rather than a false signed-in production claim. Production backup, fast-forward, deployment, hashes, nginx validation, and live API checks remain blocked by E32; no production synchronization is claimed.

## W8 local and GitHub verification

- Admin: 145 test files passed, 1 skipped; 255 tests passed, 3 explicit todos. API: 486 locally runnable suites passed, 1 suite remained intentionally skipped; 3,094 tests passed and 1 test remained intentionally skipped. The separate Docker-dependent generated-certificate nginx suite was excluded locally and is not counted as a pass.
- Focused rendered admin tests execute the responsive operations workspace, participant/support exits, URL-bound queue state, and compatibility with an older additive response. Focused API tests execute the filter allowlists, whole-queue summary, operational views, attention ordering, support-case ownership, UUID search, active-booking compatibility, and specific-service projection.
- Admin and API TypeScript passed. Repository and admin lint passed; the API workspace has no separate lint script. Admin and API production builds passed; admin transformed 2,839 modules. The mandatory API smoke passed 13/13 and the environment contract passed all 81 safe-default checks. `git diff --check` passed.
- Gate A passed all 10 blocking fragments through Git Bash, Gate C passed all 6 blocking articles, and all 6 gate self-tests passed locally. The first Gate A attempt used Windows' WSL `bash.exe`, where Node was unavailable; that environment failure is not counted as a gate result.
- Code checkpoint `27331cef517e3361b18ccc484609498719087685` was pushed to `master`. GitHub Gates run `33311697387` and CI run `33311697383` passed, including Mobile, API, Admin, and the API Docker image build plus liveness boot check.
- Authenticated Booking queue browser evidence remains rendered-test evidence rather than a false signed-in production claim. Production backup, fast-forward, deployment, hashes, nginx validation, and live API/data checks remain blocked by E32. E33 also requires a read-only production setting/offer inspection before any dispatch-semantic correction; no production synchronization or E33 production conclusion is claimed.

## W9 local and GitHub verification

- Admin: 151 test files passed, 1 skipped; 261 tests passed and 3 explicit todos remained. API: 491 locally runnable suites passed, 1 suite remained intentionally skipped; 3,089 tests passed. The separate Docker-dependent generated-certificate nginx suite was excluded locally and is not counted as a pass.
- Focused rendered admin tests execute exact dashboard queue links/counts, URL-bound ranges, source states, city attribution, DSR and financial destinations, active/stale dispute views, and the in-app resolution confirmation. Focused API tests execute canonical dashboard KPI predicates, city/provider-capacity attribution, range validation, and exact dispute-view filtering.
- Admin, Mobile, and API TypeScript passed. Repository/admin/API lint passed. Admin and API production builds passed. Gate A passed all 10 blocking fragments, Gate C passed all 6 blocking articles, all 6 gate self-tests passed, the no-N+1 scanner passed with its 30 existing annotated patterns, and `git diff --check` passed.
- The local Docker-only nginx test could not reach Docker Desktop and is not counted as a pass. GitHub independently passed Gates run `33314152712` and CI run `33314152714`, including Mobile, API, Admin, and API image build plus liveness boot.
- Code checkpoint `b5e2dbdc775a9962db73f1576fdca74362ca5033` was pushed to `master`. Authenticated Dashboard/Disputes browser evidence remains rendered-test evidence, not a claimed production session. E32 blocks production synchronization, E33 blocks dispatch/payment correction, and E34 blocks inferred DPO authorization changes.

## W10 local and GitHub verification

- Admin: 154 test files passed, 1 skipped; 264 tests passed and 3 explicit todos remained. API: 494 locally runnable suites passed, 1 suite remained intentionally skipped; 3,093 tests passed and 1 test remained intentionally skipped. The Docker-dependent generated-certificate nginx suite was excluded locally and is not counted as a pass.
- Focused rendered admin tests execute masked record results, canonical navigation, the DPO page-only boundary, and exact payout handoff. Focused API tests execute result masking/ranking, trimmed single-query validation, DPO rejection, payout UUID validation, and exact payout constraints in both count and row queries.
- Admin, Mobile, and API TypeScript passed. Repository lint and Admin/API production builds passed. The environment contract passed all 81 checks, Gate A passed all 10 blocking fragments, Gate C passed all 6 blocking articles, all 6 gate self-tests passed, the no-N+1 scanner passed with its 30 pre-existing annotated patterns, the strict phantom-test scanner reported no findings, and `git diff --check` passed.
- GitHub Gates run `33316042546` and CI run `33316042660` passed, including the independent Mobile, API, Admin, and API image build/liveness jobs. Production remains unclaimed under E32; E33 and E34 retain their semantic holds.

## W11 local and GitHub verification

- Mobile passed 412 suites and 791 assertions with 84 explicit device-baseline todos. API passed 498 locally runnable suites and 3,097 assertions with one intentional skip. Admin passed 154 files and 264 assertions with three explicit todos. The Docker-dependent generated-certificate nginx suite was excluded because Docker Desktop was unavailable and is not counted as a pass.
- Focused mobile behavior tests execute customer-only onboarding, earliest-incomplete-step routing, configured-market loading, exact pin requirements, corrected document navigation, honest null application status, and category limits. Focused API tests execute role rejection, market eligibility, boundary checks, canonical locality, and atomic primary-area creation.
- All workspace TypeScript checks, repository lint, API/Admin production builds, API smoke 13/13, environment contract 81/81, Gate A 10/10, Gate C 6/6, all six gate self-tests, the no-N+1 scanner, strict phantom-test scan, production Expo web export, and `git diff --check` passed.
- Code checkpoint `5c47977844fcd7be604674d2d3fc8ddddf891d40` was pushed to `master`. GitHub Gates run `33318263459` and CI run `33318263468` passed, including Mobile, API, Admin, and API image build/liveness.
- E35 records the unresolved duplicate onboarding state model, memory-only draft, KYC snapshot privacy risk, and rejected-provider resubmission gap. E36 records the separate ID-back approval-enforcement gap. Their required aggregate production inspections and synchronization remain blocked by E32; no production deployment is claimed.

## W12 local and GitHub verification

- Admin passed 155 test files and 265 assertions, with one skipped file and three explicit todos. API passed 499 locally runnable suites and 3,098 assertions, with one intentional suite/test skip. Mobile passed 412 suites and 791 assertions with 84 explicit device-baseline todos.
- The Docker-dependent generated-certificate nginx suite could not reach Docker Desktop locally and is not counted as a local pass. GitHub independently built and booted the API image.
- Focused executed tests cover strict filter parsing, exact IDs, calendar dates, list/export source parity, deterministic ordering, always-masked bulk output, rendered filtering, source labels, responsive timeline composition, canonical exits, and honest E37 coverage language. Stale source-regex checks were replaced with parser or rendered behavior.
- All workspace TypeScript checks, repository lint, API/Admin production builds, API smoke 13/13, environment contract 81/81, Gate A 10/10, Gate C 6/6, all six gate self-tests, the no-N+1 scanner, strict phantom-test scan, and `git diff --check` passed.
- The local browser reached the real Stitch admin login at the Audit Log destination and correctly stopped at authentication. No credential bypass was used, so authenticated live visual evidence is not claimed.
- Code checkpoint `f4e6dda640497c1c26e280da395390289c0201e4` was pushed to `master`. GitHub Gates run `33321028025` and CI run `33321028028` passed, including Mobile, API, Admin, and API image build/liveness.
- E37 holds global audit-stream architecture and E32 blocks production inspection and synchronization. No production deployment or production audit-coverage claim is made.
