# onService PH Stitch, UX, linkage, and operations audit

Date: 2026-08-23
Status: living implementation audit
Repository baseline for this continuation: `57e72ba71bb31f5a386a392b6023b929d3104429`
Reference package SHA-256: `31AB0DF4D9A16CF4C7A29489EF85037BF1B90C54936BF77B57CBB4B9D5704AD5`

## Executive finding

The product is not an empty prototype. It has broad customer, provider, staff, admin, API, test, and operating-document coverage. The central problem is coherence. Many capabilities were built page by page, while the operating model needs them to behave as one marketplace lifecycle.

The most important gaps are:

1. The old admin navigation was a flat list of 26 destinations and did not reflect how operations, support, trust, finance, growth, and governance teams work.
2. Customer and provider web at desktop width were widened phone layouts. They used the available width but did not provide persistent role navigation or a desktop workspace.
3. Support ticket masking existed in a helper but was not called by the admin HTTP routes. Ordinary admins received raw customer contact data.
4. Support case assignment required staff to paste a user UUID. It was not a usable operations workflow, did not validate that the target was an active admin, and did not create an assignment audit entry.
5. The Stitch export is a visual direction, not a complete specification. It contains 21 generated concepts for 136 visible app/admin surfaces, omits four promised overview boards, and contains unsafe or contradictory ideas that must not be copied.
6. Money, cancellation, guarantee, dispute-response, issue-reporting, and milestone-escrow contradictions remain explicit hard stops. Visual work must not invent legal or financial behavior.

## Evidence and audit method

This audit reconciles:

- the attached Stitch ZIP and all readable manifest, prompt, design-system, HTML, and image assets;
- 108 Expo Router screen files and 9 route layouts under `apps/mobile/app`;
- 35 admin page components plus the admin router and shared shell;
- 47 Express route modules and the services used by cross-role support operations;
- the live production customer and provider demos at phone and 1280-pixel desktop widths;
- the live admin login surface;
- 282 API test files, 46 admin test files, and 173 mobile test suites;
- the current platform audit and product, operations, deployment, security, and launch documentation.

Inventory means a route exists and was mapped. It does not mean every control has been exercised against production data. A screen is only marked implemented or verified where there is code and test or browser evidence.

## Source-of-truth order

When sources conflict, use this order:

1. money, privacy, security, and legal decisions in the repository;
2. server-owned API behavior and database constraints;
3. approved product and operations documents;
4. existing tested application behavior;
5. Stitch visual references;
6. assumptions.

Stitch can change presentation and information hierarchy. It cannot authorize wallet withdrawal, refund math, escrow release, guarantee language, provider discipline, or access to personal data.

## Stitch package reconciliation

The package contains 102 ZIP entries and 63 files. Extraction was checked for rooted paths and path traversal before use.

| Reference family                   |   Promised | Present | Finding                                                  |
| ---------------------------------- | ---------: | ------: | -------------------------------------------------------- |
| Overview boards                    |         20 |      16 | Boards 01, 02, 03, and 12 are absent                     |
| Generated screen concepts          | not stated |      21 | 7 customer, 6 provider, 8 admin                          |
| Generated HTML concepts            | not stated |      21 | Useful for visual tokens, not production wiring          |
| Phone customer/provider concepts   |  requested | partial | Major routes and state variants are missing              |
| Tablet customer/provider concepts  |  requested |       0 | No generated tablet design was delivered                 |
| Desktop customer/provider concepts |  requested |       0 | No generated desktop design was delivered                |
| Admin operating model              |  requested | partial | Navigation, naming, and grouping differ between concepts |

### Stitch direction to retain

- a strong, dark primary brand color with bright action accents;
- orange for attention and green for success;
- high-contrast text, visible borders, and restrained shadows;
- compact operational density in admin;
- smaller corner radii and less decorative card nesting;
- obvious primary action, status, owner, and next step on case/detail screens.

### Stitch ideas that must not be copied

- Customer wallet withdrawal. Customer balance is not a provider payout account.
- Static repeated maps presented as live tracking.
- Refund, release, or adjustment actions without approved server behavior and audit requirements.
- Guarantee wording that conflicts with the unresolved attorney-review item.
- Admin navigation that changes labels and grouping from screen to screen.
- Fictional dates, KPIs, SLAs, and records presented as live data.
- Tiny 11 to 12 pixel body copy used as the default reading size.
- The admin case concept that overflows its own 1600-pixel canvas.

## Cross-role operating model

| Lifecycle stage | Customer                                           | Provider or provider staff                              | Admin/company                                              | Linkage result                                                            |
| --------------- | -------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Discovery       | Home, category, search, provider profile           | Services, skills, profile, portfolio, service area      | Catalog, pricing rules, service areas, provider review     | Mostly linked; admin taxonomy and provider eligibility drive discovery    |
| Request         | Booking form, questions, schedule, address, photos | Lead/job request                                        | Booking queue, dispatch                                    | Linked through booking and quote APIs                                     |
| Offer           | Quote comparison                                   | Quote creation/templates                                | Booking and dispute context                                | Linked, but quote and change-order explanations need consistency checks   |
| Payment         | Pay, checkout, saved methods, wallet               | Earnings and payout settings                            | Financials, payouts, pricing                               | Linked server-side; money-language contradictions remain hard stops       |
| Fulfilment      | Tracker, chat, active booking, changes             | Active job, navigation, checklist, photos, change order | Dispatch, booking detail, communications                   | Core detail/tracker/chat workspaces now adapt wide; remaining states and live customer evidence need work |
| Completion      | Signature, review, tip, dispute                    | Complete job, reviews, earnings                         | Booking detail, disputes, finance                          | Broad coverage; guarantee and dispute-response decisions remain open      |
| Retention       | Recurring, projects, referrals, Suki Pros          | Clients, Suki customers, schedule, insights             | Recurring, projects, marketing, analytics                  | Project planning is now honestly separated from booking/money; recurring and metric ownership remain fragmented |
| Support         | Support inbox, new request, case thread, safety    | Same shared support routes plus provider help           | Support queue, linked customer and booking, internal notes | PII and assignment defects fixed in this implementation batch             |
| Governance      | Terms, consent, data rights                        | Terms, standards, account controls                      | Compliance, data protection, consent, audit, settings      | Broad surface coverage; legal wording and operating sign-offs remain open |

## Customer route register

All routes below exist. `Desktop shell` means the new shared role workspace covers the route at 1180 pixels and wider. Per-screen desktop composition still requires visual verification and selective density work.

### Entry and identity

- `/`, `/onboarding`
- `/auth/login`, `/auth/otp-verify`, `/auth/register`

### Discovery and selection

- `/home`, `/customer/category/[id]`, `/customer/search`, `/customer/provider/[id]`
- `/customer/suki-pros`, `/customer/referral`

### Booking creation and pricing

- `/customer/booking/form`, `/customer/booking/configure`, `/customer/booking/photos`
- `/customer/booking/job-request`, `/customer/booking/quotes`
- `/customer/booking/pay`, `/customer/booking/checkout`, `/customer/booking/confirm`
- `/customer/address-picker`, `/customer/addresses`, `/customer/payment-methods`

### Active work and completion

- `/customer/booking/[id]`, `/customer/booking/tracker`, `/customer/chat/[id]`
- `/customer/booking/change-order`, `/customer/booking/complete`
- `/customer/booking/review`, `/customer/booking/tip`, `/customer/booking/dispute`
- `/customer/booking/payment-failed`, `/customer/booking/make-recurring`

### Ongoing work and account

- `/bookings`, `/wallet`, `/profile`, `/customer/wallet-topup`
- `/customer/projects`, `/customer/projects/new`, `/customer/projects/[id]`
- `/customer/recurring`, `/customer/recurring/[id]`
- `/customer/notifications`, `/customer/notification-settings`
- `/customer/account-management`, `/customer/data-rights`, `/customer/terms`
- `/customer/help`, `/customer/safety-and-support`
- `/support`, `/support/new`, `/support/[id]`

Customer findings:

- Fixed: desktop now has persistent Home, Bookings, Wallet, Projects, Suki Pros, Support, and Profile destinations.
- Fixed in the route-isolation continuation: every customer route family and customer tab group now requires a customer session. Provider and provider-staff sessions are returned to their own workspace before customer content or navigation mounts (Bugs UX-106/109).
- Fixed in the current continuation: the canonical token source, mobile theme, native app chrome, admin CSS/chart palette, API fallback, and runtime branding settings now use the approved Stitch deep-blue/action-blue/orange/green palette together. Historical migration 072 remains immutable and migration 146 supersedes its defaults.
- Fixed: web animations use the JavaScript driver in browsers, eliminating the unsupported native-driver warning while retaining native acceleration on iOS and Android.
- Fixed: content padding now scales for phone, tablet, and desktop.
- Fixed in the current continuation: booking detail now places its summary and actions beside service context on desktop; quote review becomes a tablet/desktop comparison grid.
- Fixed in the current responsive batch: tracker now becomes an honest map-and-status workspace, and customer chat keeps booking status, schedule, location, details, and tracker actions beside the conversation at tablet/desktop widths.
- Fixed in the projects/notifications continuation: Project creation and detail are bounded planning workspaces at tablet/desktop widths, with an explicit no-booking/no-provider/no-payment boundary and forward-only milestone actions. The API prevents provider project creation, arbitrary provider assignment, cross-provider list leakage, impossible milestone dates/backward progress, and non-HTTP(S) document references (Bugs UX-128/129/145 and SEC-012-015).
- Fixed in the projects/notifications and settings continuations: customer notification history paginates beyond the first page, uses the same booking-aware destination contract as device pushes, reports mark-all failures, respects saved channel choices, and cannot record marketing consent through a generic toggle. Strict saves now omit response-only consent evidence, quiet hours are editable, and a failed load or background refresh cannot overwrite saved choices or unsaved drafts (Bugs UX-134-146 and UX-236/238-240).
- Open: remaining account/settings and task forms need per-screen tablet/desktop composition and authenticated live evidence. Recurring list/detail/creation and both account-management workspaces now have explicit wide compositions, but still need authenticated live browser evidence.
- Open: wallet labels must be reviewed to ensure customer credit, refund balance, and provider withdrawal are never conflated.
- Open hard stop: cancellation presentation and server refund math are contradictory.
- Open hard stop: final guarantee/disclaimer language requires approved wording.

## Provider and provider-staff route register

### Provider onboarding

- `/provider-onboarding/role-select`, `/provider-onboarding/categories`
- `/provider-onboarding/service-area`, `/provider-onboarding/documents`
- `/provider-onboarding/identity-verification`, `/provider-onboarding/selfie`
- `/provider-onboarding/vetting`, `/provider-onboarding/terms`
- `/provider-onboarding/background-check-status`, `/provider-onboarding/review-pending`

### Provider operations

- `/dashboard`, `/jobs`, `/earnings`, `/provider-profile`
- `/provider/leads`, `/provider/job/active`, `/provider/job/[id]`
- `/provider/job/[id]/navigate`, `/provider/job/[id]/checklist`
- `/provider/job/[id]/photos`, `/provider/job/[id]/quote`
- `/provider/job/[id]/change-order`, `/provider/job/[id]/complete`
- `/provider/chat/[id]`, `/provider/notifications`, `/provider/reminders`

### Provider business management

- `/provider/calendar`, `/provider/schedule`, `/provider/availability`
- `/provider/clients`, `/provider/clients/[id]`, `/provider/suki-customers`
- `/provider/services`, `/provider/skills`, `/provider/service-area`
- `/provider/portfolio`, `/provider/certifications`, `/provider/reviews`
- `/provider/quote-templates`, `/provider/insights`, `/provider/tier-progression`
- `/provider/payout-settings`, `/provider/payouts`, `/provider/withdraw`
- `/provider/team`, `/provider/settings`, `/provider/notification-settings`, `/provider/account-management`
- `/provider/help`, `/provider/standards`

### Provider staff

- `/staff/jobs`, `/staff/job/[id]`, `/staff/invites`

Provider findings:

- Fixed: desktop now has persistent Dashboard, Jobs, Job Requests, Schedule, Clients, Earnings, Team, Support, and Profile destinations.
- Fixed: provider staff receives a smaller, scoped desktop workspace instead of provider-owner navigation.
- Fixed in the route-isolation continuation: provider standalone routes, provider tabs, and the newly registered staff route group have explicit role boundaries. Cross-persona direct URLs return the signed-in user to the correct home, anonymous support routes return to login, and the desktop frame cannot render one persona's navigation around another persona's screen (Bugs CRIT-K02 and UX-105 through UX-109).
- Fixed: bottom tabs are hidden when persistent desktop navigation is active, removing duplicate navigation.
- Fixed: browser builds no longer request the unavailable native animation driver; a clean production export rendered without console warnings.
- Fixed in the current continuation: provider weekly schedule becomes a tablet/desktop grid with a bounded desktop save action.
- Fixed in the current responsive batch: provider job detail keeps canonical earnings and execution actions beside the job record; calendar separates the month grid from the selected-day schedule; chat keeps customer/job context beside the thread and now shows providers why the on-app record matters for support.
- Fixed in the provider-operations continuation: Withdrawal Preferences now uses a bounded Stitch-aligned two-column workspace, states the manual-only launch mode, preserves and exposes inactive legacy cadences, saves only canonical withdrawal details, and links directly to Withdraw and Payout History. Admin Financials no longer presents pending requests as an invented schedule (Bugs UX-069 through UX-074; E15; launch limitation 38).
- Fixed in the provider-operations continuation: job details and the legacy active-job surface now route browser/native direction actions into one bounded navigation workspace, and a successful Start Navigation transition opens it immediately. External maps require a loaded address or coordinates, arrival requires booking coordinates and the en-route state, and schedule load failures expose retry instead of editable defaults (Bugs UX-075 through UX-079).
- Fixed in the certification continuation: provider certification dates use a 48 px browser calendar input, stack before their values truncate, and have strict server validation; impossible, future-issued, and reversed ranges are rejected; browser photo selection is supported; the shared browser uploader lets fetch generate the required multipart boundary; existing private evidence uses an on-file state; replacement-photo state cannot carry into another credential; private storage keys never enter public profiles; and any provider edit returns the record to pending review. The provider screen becomes a bounded tablet/desktop evidence workspace, while Provider 360 gains a provider-scoped review tab with secure document access and a required reason when verification is removed (Bugs UX-091 through UX-104).
- Fixed in the onboarding and portfolio continuation: provider applications no longer grant provider access before manual approval. Admin approval now grants the role in the same transaction as the decision, rejection repairs legacy early promotion, and the pending screen uses the auth-only application-status endpoint with explicit load/error/rejection states instead of hiding failures or inventing review stages and a 24-48 hour promise. Approval rotates the token pair before entering the provider workspace so API authority and displayed role change together (Bugs UX-110 through UX-115).
- Fixed in the onboarding and portfolio continuation: KYC references must belong to the applying account and are stored as private object keys. Documents and selfies retain the local picker URI only for the immediate preview and show a secure on-file state after navigation instead of requesting a private storage URL anonymously (Bugs UX-113, UX-120, and UX-121).
- Fixed in the onboarding and portfolio continuation: portfolio uploads use a dedicated public context owned by the provider, written customer consent is affirmed before upload and timestamped server-side, and the provider sees an explicit customer-visible privacy notice. The gallery is now a bounded 2/3/4-column phone/tablet/desktop workspace. Provider 360 shows the exact published images and consent evidence without adding an unapproved moderation action (Bugs UX-116 through UX-122).
- Fixed in the provider money and CRM continuation: Earnings uses recorded seven-day gross/commission/net values and the server's live commission rate; Payout History is a complete bounded ledger; Client Detail links real job records; reminders reject impossible dates; and the quote builder keeps request context beside a server-canonical itemized quote (Bugs UX-123 through UX-126, UX-128/129, and FIN-001).
- Fixed in the projects/notifications continuation: provider notification history is paginated and bounded for wide browsers, chat opens by booking ID, and lead/reminder/payout/earnings/review/quality/certification/team/account events open their real workspaces through the shared inbox/device destination contract (Bugs UX-136/137/139/143).
- Fixed in the settings continuation: Provider Settings is bounded at tablet/desktop widths and replaces its local-only push switch with durable Notification Preferences plus Notification History. Providers can save job, payment, message, tier, reminder, system, and quiet-hours choices through the existing role-neutral API without changing marketing consent (Bugs UX-236-240).
- Open: jobs and remaining owner settings/business screens need per-screen wide-layout verification at 768, 1024, 1280, and 1440 pixels.
- Open hard stop: provider response inside a dispute is not implemented.
- Open hard stop: checklist `Report Issue` has no approved API endpoint.
- Open hard stop: milestone escrow behavior is unresolved.

## Admin page register and operating purpose

| Group            | Pages                                                                                                         | Required operating purpose                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Command          | Dashboard, Analytics                                                                                          | queues, alerts, marketplace pulse, demand, quality, growth               |
| Operations       | Bookings, Booking Detail, Dispatch, Recurring, Projects, Service Areas                                        | fulfilment, assignment, exceptions, capacity, market controls            |
| People           | Providers, Provider Detail, Customers, Customer Detail, Business Accounts, Business Account Detail            | onboarding, vetting, account history, risk, access, billing context      |
| Support & Trust  | Support Tickets, Communications, Tester Feedback, Disputes, Dispute Detail                                    | case ownership, conversation, research evidence, decisions, escalation   |
| Money            | Financials, Payouts, Pricing Rules, Cancellation Policy                                                       | reconciliation, disbursement, canonical pricing, approved policy display |
| Growth & Content | Catalog, Marketing, Notification Templates                                                                    | taxonomy, intake, campaigns, promotions, lifecycle communications        |
| Governance       | Compliance, Data Protection Log, Consent Versions, Audit Log, Staff & Roles, System Settings, Change Password | regulatory controls, privacy requests, history, access, configuration    |
| Fallback         | Login, Not Found                                                                                              | secure entry and recovery                                                |

Admin findings:

- Fixed: the flat sidebar is replaced with one role-filtered, grouped information architecture shared by navigation and command search.
- Fixed: the shell now works as a desktop rail and a mobile/tablet drawer without a hard-coded content offset.
- Fixed: the header command search finds real page destinations and explicitly says record-level search is not yet available.
- Fixed: dashboard action queues now precede marketplace pulse metrics.
- Fixed: support queue and case workspace now expose purpose, visible-page signals, linked customer and booking context, public versus internal conversation, named owner assignment, and explicit status confirmation.
- Fixed: ordinary-admin support list and detail responses now apply the existing PII mask.
- Fixed: support assignment now validates active admin roles and writes an audit event in the same transaction.
- Fixed in the tester-backed support batch: support search covers ticket, subject, account contact, and provider business; account and booking filters/deep links connect Support to Customer 360, Provider 360, and Booking 360; provider cases no longer route to Customer 360.
- Fixed in the tester-backed support batch: agents can create an audited account-owned case from Customer or Provider 360 for email/Messenger intake, and booking-linked cases are rejected unless that booking belongs to the customer, provider owner, or assigned provider staff member.
- Fixed in the tester-backed support batch: customer booking, payment-failure, and safety entry points preserve case context; waiting cases return to the active queue when the user replies; terminal user threads stay read-only; support inbox, form, and thread are bounded for tablet/desktop browsers.
- Fixed in the current admin trust-and-safety batch: Communications now starts on the actionable review queue, opens the exact reported message, keeps booking/customer/provider case links beside the conversation, and requires an audit rationale before a report is cleared.
- Fixed in the tester-feedback operations batch: production tester research now has a dedicated queue, customer/provider/admin area filters, preserved issue/questionnaire/screenshot evidence, named active-admin ownership, a written decision note, and a transactional audit event. Ordinary-admin contact and free-text PII are masked.
- Fixed: navigating directly to a lower sidebar workspace scrolls its active destination into the visible navigation region instead of leaving the current page hidden below the fold.
- Fixed in the certification continuation: Provider 360 now links the provider's certification evidence to an explicit review decision. Only an active, documented, unexpired certification can be verified; removing verification requires a reason and notifies the provider.
- Fixed in the provider payout continuation: the Payout queue shows internally AML-held requests and every status/reason required by provider support. AML clearance, approval, rejection, and completion require a typed rationale; one-in-flight requests are serialized; completion and rejection guard the reserved wallet amount and write audit plus notification inside the same transaction. The hold threshold is now an audited setting that can be made stricter but not raised above the conservative ₱500,000 ceiling, and the admin wording states that an internal hold is not itself a statutory AML determination or report (Bugs UX-127/130/184/185 and FIN-002 through FIN-005).
- Fixed in the projects/notifications continuation: Projects is now an honest planning-record support queue with real status counts and direct Customer 360/Provider 360 linkage. It does not present project rows as bookings, quotes, assignments, or money operations (Bug UX-133).
- Fixed: booking reassignment uses a named online-provider picker rather than asking an employee to paste a UUID.
- Fixed: dispute assignment uses a named active-admin picker rather than asking an employee to paste a UUID.
- Fixed in the current continuation: provider-team reject/send-back decisions use an in-page reason dialog instead of a browser prompt.
- Fixed in the current continuation: business-account manager assignment uses named active staff instead of a pasted UUID.
- Fixed in the current continuation: business invoice payment recording uses a labelled, auditable in-page dialog instead of a browser prompt.
- Fixed in the current continuation: admin sign-in now uses a Stitch-aligned company operations workspace instead of a phone-sized card floating in an empty desktop canvas; verified at 390, 820, and 1280 px.
- Open high: global entity search by booking number, ticket number, person, phone, payout, or provider is absent.
- Open high: custom `admin_roles.permissions` are metadata and are not the enforcement source for page/API access. The app still fundamentally authorizes `admin`, `super_admin`, and `dpo` user roles.
- Open high: several admin pages remain collections of local cards and tabs rather than linked case workspaces.
- Open: operational SLA deadlines are not modeled, so the support UI must not invent countdowns.
- Open: analytics and dashboard numbers need metric definitions, source labels, comparison periods, and freshness indicators.
- Open: destructive or money-affecting actions need consistent reason capture, preview, server authorization, and audit display.
- Fixed in the follow-up hardening batch: explicit React, UI, data, chart, and map vendor chunks reduced the former 540.39 kB main entry to approximately 271 kB. The production build passes with the shared libraries separated for browser caching.

## Documentation and environment findings

- Production admin demo auto-login is intentionally disabled; demo documentation now states that admin access requires an authorized account.
- Support documentation now describes the implemented in-app and agent-created intake paths. The former claim that waiting cases automatically send reminders and close after five days is explicitly marked unimplemented; staff must not rely on an automation that does not exist.
- Fixed: the deployment workflow no longer targets the obsolete `main` branch or auto-runs without configured production secrets; the release guide now describes the actual shared Hetzner topology.
- Fixed in the production-operations continuation: the documented container migration command no longer calls an executable that is unavailable from the API working directory. One production helper now performs a dry run before apply, uses the direct database connection, accepts an exact migration target, and handles the historical 135-145 ledger order explicitly. The manual workflow now backs up before migrations, fast-forwards the verified GitHub Actions release bundle with noninteractive sudo, and no longer reloads shared nginx or prunes images belonging to other apps (Bug OPS-001).
- Fresh dependency installation still requires `npm ci --legacy-peer-deps` because ESLint 10 is outside `eslint-plugin-react`'s declared peer range.
- The current local Node 24.13 runtime is below one installed dependency's preferred 24.15 engine range.
- Fresh install reports 42 dependency vulnerabilities, including one critical. These require package-by-package triage, not an automatic breaking `audit fix --force`.
- The production checkout is `/opt/onservice`; `/opt/onservice-onsite-app` is the clearer canonical alias. Repository naming should remain `onservice-onsite-app` in documentation and deployment output.

## Hard stops that this redesign does not override

| Existing decision                 | Why work pauses                                                  |
| --------------------------------- | ---------------------------------------------------------------- |
| E04 provider dispute response     | Missing approved workflow and endpoint                           |
| E05 checklist issue reporting     | Missing approved endpoint and escalation behavior                |
| E09 cancellation policy           | Displayed policy and refund calculation disagree                 |
| E10 and F#10 guarantee/disclaimer | Final legal wording requires attorney review                     |
| E12 milestone escrow              | Money movement and release authority are unresolved              |
| E14 PayMongo hosted checkout      | Current Payment Intent URL is invalid; replacement flow needs test keys and approval |
| E16 provider fixed-price source   | Provider-entered and catalog prices conflict on booking creation |
| E18 release/dispute timing        | Escrow releases at 24h while customer disputes remain open to 48h |
| E19 customer signature identity   | Provider-session upload records provider as a customer-acceptance signer |
| E20 recurring automatic charging  | Dormant worker has 100x conversion, lifecycle, consent, and reconciliation defects; manual payment only |
| E21 account erasure retention     | Complete physical erasure cannot be claimed until an attorney/DPO retention matrix exists |
| E22 BIR invoice and filing model  | Taxpayer profile, principal document type, tax basis, numbering authority, and filing calendar require accountant/legal approval |
| Fine-grained staff authorization  | Existing role metadata and actual user-role enforcement conflict |

## Implementation batch completed from this audit

1. Replaced the old mobile web frame with role-aware desktop workspaces at 1180 pixels and wider.
2. Expanded tablet sizing and responsive page padding.
3. Removed duplicate bottom tabs when the desktop workspace is active.
4. Aligned shared mobile and admin visual tokens to the safe parts of the Stitch direction.
5. Rebuilt the admin shell navigation and header around company operations.
6. Reordered the dashboard around action queues.
7. Reworked support list and detail surfaces around triage, owner, related entities, and conversation.
8. Fixed admin support PII masking at the route boundary.
9. Replaced support assignment UUID entry with an active named-agent picker.
10. Added target validation and transactional assignment audit logging.
11. Preserved resolution notes for both resolved and closed cases.
12. Replaced booking-provider and dispute-admin UUID entry with named, constrained pickers.
13. Restored D23's customer-profile provider-staff invitation discovery route after tracing the full pre-role-conversion flow; its later removal had made acceptance direct-URL-only.
14. Removed unsupported native-driver requests from every shared browser animation component.
15. Added rendered-output and route/service behavior tests for each claimed change.
16. Added the explicit mobile-screen, layout, and 35-admin-page linkage ledger; current counts are reconciled at 108 routed screens and 9 layouts, and shell-only responsive coverage is not counted as per-screen completion.
17. Switched all canonical brand sources and runtime branding rows to the approved Stitch palette through migration 146.
18. Added wide customer booking detail, quote comparison, and provider schedule compositions.
19. Replaced provider-team and invoice-payment browser prompts, plus business-account manager UUID entry, with named, auditable workflows.
20. Rebuilt the admin login composition for phone, tablet, and desktop and verified its palette, overflow, and 44 px control sizing in a real browser.
21. Reworked customer tracking into a tablet/desktop map-and-status workspace without inventing a live provider pin.
22. Added booking context and direct booking/tracker exits beside customer chat on wide screens.
23. Reworked provider job detail into a job-record and execution-action workspace while preserving canonical earnings and phone actions.
24. Reworked provider calendar into a month-grid and selected-day workspace for tablet and desktop.
25. Added customer/job context beside provider chat and made the support-record guidance persist outside message history.
26. Added one real rendered behavioral test for each of Bugs UX-027 through UX-032.
27. Reworked Communications from a generic conversation browser into a queue-first trust-and-safety workspace with exact reported-message focus.
28. Linked each moderated thread to its customer, provider, and booking case records and required a support rationale before marking a report reviewed.
29. Persisted the review rationale in the transactional moderation audit record, with one real behavioral test per Bugs UX-033 through UX-036.
30. Added 12 populated/loading/empty/error Communications visual baselines at 1280, 1440, and 1920 pixels, raising admin visual coverage from 354 to 366 snapshots.
31. Pulled and visually reviewed all 10 available third-party tester submissions and six screenshots through the private, gitignored production-export workflow.
32. Added the Tester Feedback admin workspace and transactional triage API through Bugs UX-037 to UX-041, plus active-sidebar visibility via UX-042.
33. Added 12 Tester Feedback baselines at 1280, 1440, and 1920 pixels, raising admin visual coverage from 366 to 378 snapshots.
34. Measured the strongest tester complaint against production data: all 29 active services had blank customer scope descriptions (17 fixed-price, 12 quote), and no add-ons were configured.
35. Added pricing-aware scope fallback and booking-draft retention across customer category, search, provider profile, fixed configuration, and custom request paths without inventing service promises.
36. Reworked Catalog into a publishing workspace with active/missing/ready counts, a missing-scope queue, visible incomplete states, an exact customer preview, and a 30-character server-side gate for active service publishing.
37. Aligned Catalog controls with the existing API boundary: ordinary admins retain evidence inspection while category, service, pricing, add-on, and intake mutations are shown only to superadmins.
38. Repaired Catalog visual tests that had intercepted the wrong endpoint, then verified seven real states at 1280, 1440, and 1920 pixels. Nine new baselines raise admin visual coverage from 378 to 387 snapshots.
39. Corrected provider-profile hourly booking linkage so the displayed and drafted rate comes from the canonical catalog hourly rate, not the provider service's generic base price; Bug UX-048 renders and proves the complete interaction.
40. Caught a production-artifact cache mismatch in live browser QA, rebuilt with a cleared Metro cache, verified the controlled demo entry in the compiled and live bundle, and made `--clear` mandatory in both deployment guides.
41. Corrected quote-priced provider cards so a legacy provider base price cannot appear as the booking price; Bug UX-049 proves the card says Get Quote and starts the quote-request path.
42. Closed the tester-backed support linkage gap across customer, provider, and admin surfaces with contextual entry, secure booking ownership, correct persona links, searchable case context, audited agent intake, and responsive shared support screens.
43. Documented E16 after proving from code and production counts that fixed provider prices can differ from the catalog amount booking creation records; no price or production money row was changed.
44. Repaired provider team invitation validation and contact matching through Bugs UX-080/081, including honest in-app delivery copy and field-specific errors.
45. Reconnected customer invite discovery and added bounded team/invitation workspaces for tablet and desktop through Bugs UX-082/089/090.
46. Normalized database schedule/override times to editable HH:MM, tightened server time-window validation, and rebuilt Availability as a wide controls/overrides workspace through Bugs UX-083-088.
47. Rebuilt provider certification entry and evidence review across provider mobile web, the shared multipart uploader, the API, public discovery privacy, tier eligibility, and Admin Provider 360 through Bugs UX-091-104. Production-bundle browser evidence covers the provider workspace at 768/1366 and the admin review tab at 1280/1440/1920.
48. Repaired Provider 360 visual coverage that had mislabeled an invalid array payload as an empty detail record and captured its retrying error request as a loading spinner. The suite now waits for real missing-provider and settled server-error alerts before taking those baselines.
49. Closed cross-persona route leakage through Bugs CRIT-K02 and UX-105-109. Customer, provider-owner, and provider-staff route families now enforce their owning role, shared support requires an authenticated app persona, the staff group is registered explicitly, and the desktop shell only mounts when the route belongs to the signed-in role.
50. Corrected provider approval authority and the onboarding/portfolio media chain through Bugs UX-110-122: pending applicants remain customers, approval grants provider access transactionally, private KYC references are owned and never rendered as public images, portfolio uploads are public and owned, consent is recorded, wide layouts are bounded, and Provider 360 receives the customer-facing portfolio evidence.
51. Repaired the production migration and API deployment path after the live release exposed the broken `npx` command and historical ledger ordering. A behavior-tested helper now dry-runs the exact target before applying it through `npm`, bootstrap migrates before API startup, the manual workflow backs up first, and shared nginx/image state is left untouched (Bug OPS-001).
52. Replaced provider wallet-balance inference with recorded earnings totals and switched job/quote/change-order/completion previews to the API's live commission rate (Bugs UX-123/128).
53. Rebuilt provider Payout History, Client Detail, reminders, and quote creation as bounded tablet/desktop workspaces with complete money/status/context linkage (Bugs UX-124-126/129 and FIN-001).
54. Rebuilt payout execution around serialized requests, AML-aware one-in-flight checks, guarded wallet reservations, atomic admin audit/notification writes, and required reasons for AML clearance, approval, rejection, and completion (Bugs UX-127/130 and FIN-002-005).
55. Added append-only migration 149 for the `payout_completed` admin action and verified first apply, idempotent reapply, historical verb preservation, and inserts against a disposable PostgreSQL 17 cluster.
56. Added direct reasoned rejection for internally held payouts so Finance can return the reservation without first recording a false compliance clearance (UX-132/FIN-008).
57. Closed quote-route authorization and lead-lifecycle gaps: direct quote submission now enforces the same active category/radius boundary as Leads, and `quoted` requests remain available to other eligible providers until acceptance or the configured limit (SEC-011/LINK-133).
58. Replaced the obsolete hCaptcha launch verifier with a process-tested Cloudflare Turnstile verifier, removed unused hCaptcha origins from the admin CSP, and aligned active environment/security/cutover docs (SEC-010).
59. Corrected active legal, operations, strategy, QA, and architecture records that falsely described final guarantee wording, fixed protection caps, live hosted checkout, unsupported hourly pricing, optional F#10 review, or complete PITR/native evidence. Historical design docs are retained with explicit authority warnings rather than rewritten as current fact.
60. Reworked customer Project creation/detail and admin Projects oversight into bounded planning workspaces, added explicit forward-only milestone controls, and linked support staff to Customer 360/Provider 360 without implying a booking or payment workflow (Bugs UX-128/129/133).
61. Closed project authorization, lifecycle, and query-boundary defects: creation is customer-only, customers cannot assign arbitrary providers, provider/status scoping is grouped correctly, impossible milestone dates and backward progress are rejected, and future document references require HTTP(S) (UX-145 and SEC-012-015).
62. Unified inbox and device-push navigation around one role-aware booking contract, migrated user-facing server notifications to preference-gated best-effort device delivery, and added strict settings/pagination validation (Bugs UX-134-142).
63. Rebuilt customer/provider inboxes as paginated wide workspaces, made mutation/load failures safe and visible, and kept marketing alerts off unless the dedicated consent workflow records consent (Bugs UX-138-144).
64. Added the transactional `payment`, `referral`, `suki`, and `promo` values to the notification type contract and verified each follows its saved device-push preference/consent boundary (Bug UX-146).
65. Repaired provider checklist persistence end to end: the mobile toggle now uses the API's real contract, uploaded proof is attached and reloadable, photo-required state is explicit, empty templates are honest, and tablet/desktop use a bounded progress-and-evidence workspace (Bugs UX-147-150). E05 issue reporting remains an explicit hold.
66. Migrated provider job photos off the deprecated generic-upload/legacy-array handoff to the canonical authorized booking-photo service, retained failed selections while removing saved ones after a partial batch, and added an explicit tablet/desktop phase-and-evidence workspace (Bugs UX-151/152/192).
67. Aligned provider completion with canonical after-photos already on file, prevented duplicate local artifact uploads during an in-screen retry, added a bounded tablet/desktop readiness workspace (Bugs UX-153/154), and documented E19 instead of misrepresenting a provider-attributed bitmap as verified customer acceptance.
68. Repaired active-job execution so final status enters the evidence/completion workflow, coordinate-less bookings show an honest address-only state instead of a generic map location, and tablet/desktop use a map-and-controls workspace (Bugs UX-155-157).
69. Bounded the provider change-order itemization and amount workflow for tablet/desktop without altering its server-owned cap, approval, commission, or payment rules (Bug UX-158).
70. Bounded customer completion for tablet/desktop while preserving the review, tip, dispute, and booking exits and recording E18 instead of changing money/legal timing (Bug UX-159).
71. Repaired recurring creation, totals, skip-next atomicity, generated-booking history/status, fixed-price/category eligibility, preferred-time preview, and tablet/desktop layouts across Bugs UX-160-173. Bugs UX-189-191/196 make E20's disabled state enforceable: activation returns 503 before token storage, the scheduler never calls the unsafe service, recurring responses hide payment/source IDs, new series store auto-charge off, and every generated booking follows manual payment.
72. Rebuilt customer/provider data exports around owned five-minute downloads, protected the private-artifact namespace from nginx public uploads, physically deletes expired or failed artifacts, recovers an interrupted build through a one-hour processing lease, expanded JSON/CSV archives to role-aware owned records, and made artifact streaming/cleanup reject any non-private database key (Bugs UX-174-181/186-188).
73. Reworked both account-management screens into bounded export/action workspaces with load retry and cross-platform confirmation, then made interrupted deletion processing retry and revalidate bookings, disputes, and balances before anonymization (Bugs UX-179-183). E21 preserves the unresolved retention decision.
74. Added migration 150 for the audited internal AML-review threshold, bounded runtime configuration at or below ₱500,000 so an unsafe value cannot bypass the hold, and exposed the captured threshold plus non-statutory context to Finance (Bugs UX-184/185). Production contained no payout rows and no money was changed during the read-only audit.
75. Removed the remaining false permanent-deletion promises from customer/provider account actions, the customer Data Rights erasure flow, and customer Help. These surfaces now describe the implemented 30-day cooling-off, deactivation/anonymization, and required-record retention behavior while E21 remains open (Bugs UX-193-195).
76. Reconciled the live settings registry and queue runtime after production startup exposed both warnings. Six service-consumed controls are now real admin settings, every active setting has an outage fallback, D04's pulled insurance rows are inactive and hidden from admin lists, and Redis refuses writes at its memory ceiling instead of evicting BullMQ queue state (Bugs UX-197-199).
77. Corrected API request-log severity after live release probes showed ordinary unauthenticated access checks recorded as server errors. Operational 4xx responses remain searchable as `Request rejected` warnings, while 5xx and unexpected failures retain error severity and stack context (Bug UX-200).
78. Removed obsolete nginx OCSP-stapling directives after live certificate inspection and Let's Encrypt's current revocation policy confirmed that issued certificates have CRL distribution points but no OCSP responder URL. TLS 1.2/1.3, HSTS, cipher hardening, and session resumption remain unchanged; a generated no-OCSP certificate now exercises the complete nginx config (Bug UX-201).
79. Declared the data-bearing uploads volume as an explicitly named external volume after production proved it predates Compose and has no project labels. First-install scripts now create it idempotently, routine deployment docs fail closed if it is unexpectedly missing, Compose stops claiming ownership, and the Hetzner guide now reflects the working local-volume backend and Singapore region (Bug UX-202).
80. Reconciled the runtime environment contract with the actual self-hosted topology: PostgreSQL 17 + PostGIS is canonical, private PgBouncer transport is explicit, external databases fail closed without TLS, mobile/server variables are separated, dangerous switches default off, and a behavior-tested verifier rejects template drift (OPS-203/204).
81. Opened E22 after proving the BIR launch verifiers targeted dead variables, a nonexistent route, and a nonexistent table. Document writes and the invented filing calendar now fail closed, admin generation controls are disabled, retained records are labelled as legacy/internal workpapers, and the false customer Official Receipt promise is removed (OPS-205-208/221/227).
82. Stopped production deployment from applying every development seed. Fixture mode is now an explicit protected opt-in, marketplace catalog/review reads hide known test/demo identities when it is off, and E23 records the existing production fixtures for a separately approved cleanup instead of deleting live rows during this audit (OPS-209/210).
83. Enforced E14 before any external gateway or database effect, removed the invalid wallet-top-up form, disabled card/GCash/Maya/QR Ph selection, retained only verified existing-wallet payment, and corrected short-balance copy so it no longer recommends unavailable routes (OPS-211/213 and BUG-PHASE86-01).
84. Made existing-wallet booking payment atomic under booking and wallet locks, then made PayMongo webhook booking/top-up effects transactional. Paid events require an immutable payment id, failures release their event claim, abandoned claims are leased and reclaimable after 15 minutes, and the locked intent is re-read before any second event can apply it (OPS-212/216-218/222/225).
85. Completed the temporary E16 containment across provider selection, customer/provider projections, and Provider 360. Providers can select services but cannot submit a personal price; every displayed amount uses the booking catalog and fixed/hourly/per-unit/range/quote models remain distinct (OPS-214/215/219/220/223/224).
86. Kept the functioning large-payout hold and corrected its legal overstatement. Provider/Admin labels now describe an internal operational review, direct reasoned rejection still returns reserved funds atomically, and migration 154 corrects the legacy schema comments without claiming AMLA classification or reporting authority.
87. Corrected customer Terms/Privacy operational statements about external payments, BIR documents, provider pricing, and account erasure while preserving F#10 attorney review as a hard stop (OPS-221).
88. Separated private data-export link signing from JWT signing. Production now requires its own `DATA_EXPORT_DOWNLOAD_SECRET`; a missing dedicated key fails closed instead of silently reusing authentication material (OPS-226).
89. Replaced the README's legacy Compose quick start with the supported scripts that build the complete PostgreSQL 17/PostGIS development stack, run migrations, and load local-only demo data.
90. Closed the private-export secret bootstrap gap. Fresh installs generate independent customer-export and tester-feedback keys, public staging/runtime exports reject short or repository-known placeholders, and production startup recognizes the underscore-form placeholders used by the tracked template (OPS-228).
91. Replaced the provider dispute dead end with participant-aware customer/provider inboxes, linked booking case workspaces, evidence and decision context, direct notification destinations, duplicate-filing prevention, and an actionable provider contest response at phone/tablet/desktop widths. A contest notifies the customer and refreshes the admin queue in real time (Bugs UX-203-209).
92. Opened E24 after the direct settlement trace found unguarded concurrent settlement and case/escrow split-commit risk. Provider full-refund acceptance and participant partial-offer settlement now fail before writes; contest-to-admin-review remains available while E18/E24 are resolved (OPS-229).
93. Corrected the remaining active customer/provider help and terms claims that still advertised disabled external payment methods, a fixed 1–3 day refund, unsupported email/avatar editing, automatic provider-silence settlement, or an unqualified escrow guarantee (Bug UX-210).
94. Reconciled the active operations handbook with actual dispute behavior and the E14/E18/E24 holds. Provider silence now consistently means tier-3 staff review, participant settlement remains unavailable, post-release cases are not called held money, refund messages require a verified destination/status/reference, and customer cancellation no longer falsely announces an automatic refund (Bug UX-211).
95. Removed a phone-only dispute-inbox sizing regression where the desktop card `flexBasis` became a 420-pixel card height in the single-column layout. The wide sizing rule is now applied only at tablet/desktop widths (Bug UX-212).
96. Made provider contest submission single-write at the dispute row. A stale concurrent request can no longer overwrite the first response, duplicate the customer notification, or emit a false second admin refresh (Bug UX-213).
97. Kept the dispute case linked from a provider job after the case reaches `resolved`, so the provider can still read the decision instead of losing the job-to-case entry point (Bug UX-214).
98. Corrected the dispute-to-support handoff to use the API's real `booking_issue` ticket type while preserving the booking ID and case subject. The former invented `dispute_help` value silently degraded to a general inquiry in the support form (Bug UX-215).
99. Removed the shared `48h cover`/`48 hour guarantee` claim from the cross-cutting trust strip. It now says vetted pros, verified escrow, and case tracking, which are observable controls rather than an unresolved protection benefit (Bug UX-216).
100. Rebuilt customer Payment Methods in the Stitch workspace direction at phone/tablet/desktop widths. Existing wallet balance is the only available method; four external methods and new top-ups are visibly paused under E14, and the screen no longer advertises PayMongo processing or customer-confirm-only release (Bug UX-217).
101. Corrected onboarding escrow copy so it applies only when a booking actually shows paid and held, and points to the shared in-app case record without claiming that every in-window dispute still has held funds (Bug UX-218).
102. Corrected the customer wallet entry and empty state under E14. The former active “+ Top Up” control and top-up recommendation now say top-up is paused and explain that only existing balance can currently fund a booking (Bug UX-219).
103. Corrected the approved change-order short-balance state. It no longer sends the customer to a disabled wallet top-up path and instead explains why payment is held and where to get support for the approved order (Bug UX-220).
104. Bounded the tip form and actions for tablet/desktop browsers and corrected both short-balance messages. Customers now choose a smaller tip from existing wallet funds instead of being sent to disabled top-up (Bug UX-221).
105. Corrected the remaining customer Help escrow/change-order answers so escrow is conditioned on a successful paid-and-held booking and the change-order benefit is the recorded scope/amount/payment state, not a blanket protection claim (Bug UX-222).
106. Rebuilt customer checkout as a bounded tablet/desktop payment workspace, removed the deferred ₱10,000 Service Guarantee claim, stopped saying every payment uses PayMongo, and made escrow/release copy match E14/E18 (Bug UX-223).
107. Bounded the existing-booking payment workspace and replaced the confirmation-only escrow promise with server-backed paid/held status plus the actual completion-timer path (Bug UX-224).
108. Made booking confirmation state-aware and scroll-safe at phone/tablet/desktop widths. It now shows held escrow only when the booking response reports `escrowStatus=held`; a submitted or merely paid record cannot inherit a false held-money card (Bug UX-225).
109. Reworked Safety & Support around observable provider checks, booking/payment records, status/location context, evidence, and support routes. It no longer says every booking is protected, every in-window dispute keeps funds held, or a cancellation automatically proves a refund (Bug UX-226).
110. Removed the deferred service-guarantee claim from customer chat. The keep-on-app guidance now explains the actual support-review and dispute-evidence value of the booking-linked conversation (Bug UX-227).
111. Corrected the customer home payment explainer so it points to paid/escrow status in the booking rather than promising customer-confirmation-only release (Bug UX-228).
112. Bounded Provider Standards for desktop/tablet and corrected its guarantee/release guidance to rely on payment status, approvals, booking records, customer confirmation, and the platform completion timer (Bug UX-229).
113. Bounded Provider Help for desktop/tablet and aligned it with manual withdrawals, internal large-request review, paid-and-held prerequisites, and recorded transfer status rather than fixed processing promises (Bug UX-230).
114. Bounded the provider withdrawal request and action bar, disclosed manual/internal-risk review before submit, and stopped announcing a newly recorded request as already processing (Bug UX-231).
115. Corrected the interim customer Terms capability list from an unbuilt masked-phone service to the actual in-app booking-chat behavior. F#10 attorney review remains open for final legal language (Bug UX-232).
116. Bounded the provider agreement for desktop/tablet and conditioned its payment clause on the booking's paid/held record and the actual confirmation/completion-timer release paths (Bug UX-233).
117. Corrected customer and provider change-order guidance so approval is not represented as payment; both parties are told to rely on the added charge reaching paid-and-held state before extra work proceeds (Bug UX-234).
118. Reconciled the remaining active recruiting, vetting, provider-support, admin-training, quality/KPI, and decisions-register guidance with E10/E14/E18/E22 and the internal large-payout review. The handbook no longer treats a draft ₱20,000 guarantee cap as policy, calls the 24-hour/48-hour conflict normal, labels the internal hold as legal AML action, publishes the held BIR calendar as authoritative, or teaches a five-step provider application when the active flow has seven application steps plus status screens.
119. Bounded mobile login, registration, and OTP verification to deliberate 560-640 px tablet/desktop workspaces instead of stretching the forms across the browser canvas (Bug UX-235).
120. Stopped customer notification saves from echoing response-only marketing-consent evidence into the strict preference validator (Bug UX-236).
121. Replaced Provider Settings' non-persistent local push switch with a bounded route to durable Notification Preferences and the existing Notification History (Bug UX-237).
122. Added customer/provider quiet-hours editing through the existing server contract and documented the exact time-sensitive events that may bypass it (Bug UX-238).
123. Omitted hidden invalid quiet-hour values when quiet hours are disabled, so a user can turn the feature off without an invisible validation failure (Bug UX-239).
124. Protected unsaved notification choices from a background query refresh and synchronised successful saves into the shared query cache (Bug UX-240).
125. Reconciled F#3 at 89 screen baselines, added the provider-notification-settings flow, taught the generator to preserve the participant dispute ID instead of substituting a provider/generic ID, and passed that ID through the capture wrapper.
126. Made physical push-token ownership exclusive to the currently registering account, added authenticated unregister on logout, and retained fail-safe reassignment when a logout request cannot reach the server. The read-only production check found zero duplicate token groups, so no production-row cleanup was needed (Bugs UX-241-243).
127. Re-registers the device token at authenticated app launch and every account-ID change even when a token is cached locally, closing account-switch and expired-session paths that could otherwise leave the next account unregistered (Bug UX-244).
128. Clears React Query's account-scoped server cache whenever the authenticated identity changes, preventing a customer or provider from briefly inheriting another account's cached bookings, notifications, wallet, or profile data (Bug UX-245).
129. Propagates a terminal refresh-token failure into the live auth store so role guards return the user to authentication instead of leaving a signed-in shell backed by deleted credentials (Bug UX-246).
130. Removed the obsolete Compose schema-version declaration after the live CLI flagged it on every operational command; the current Compose model parses cleanly without the warning (OPS-230).
131. Routed OTP resend through the same Turnstile-aware request path as initial login/registration, so a user who reaches the server's captcha threshold can complete the security challenge instead of being trapped on the verification screen (Bug UX-247).
132. Made Admin's bounded OTP length, expiry, maximum-attempt, and resend-cooldown controls authoritative in code generation, verification, SMS copy, and the mobile verification workspace. The API accepts in-flight 4–8 digit codes safely if policy changes after send, and invalid database values fall back to the documented conservative defaults (Bugs UX-248/249).
133. Added a browser implementation for the legacy non-sensitive public-storage bridge after the production web runtime proved that the native MMKV constructor had entered the Expo bundle and blanked the app. Browser public values now use a namespaced localStorage/memory fallback, while deprecated secure methods remain blocked (Bug UX-250).
134. Replaced Admin Settings' universal “live within 60 seconds” claim with server-owned impact truth. Twenty settings that still use deployed constants are read-only as **Not connected**, three deferred capabilities are read-only as **Launch hold**, live controls retain audited edits, unknown future rows fail closed, and the large-payout threshold explicitly remains a live internal review hold rather than a statutory AML rule (Bugs UX-251/252).
135. Connected the saved CAPTCHA threshold to OTP escalation and the suspicious-IP threshold to the bulk blocking query with their migration bounds, turning two former display-only Security rows into real live controls (Bugs UX-253/254).
136. Connected quote maximum and expiry to both quote submission paths and the expiry worker, connected the provider no-show wait to both the provider report route and scheduled detector, and made category/subcategory/search HTTP caches resolve their admin TTLs per request (Bugs UX-255-258).
137. Replaced the Settings page's one-size-fits-all narrow text field with bounded boolean, allowed-value, number, and JSON editors that wrap safely at tablet widths while preserving audited reasons and server validation (Bug UX-259).

## Verification record for this batch

- Admin TypeScript: passed.
- Mobile TypeScript: passed.
- API TypeScript: passed.
- Mobile suite after the projects/notifications continuation: 249 suites passed, 713 tests passed, 84 explicit todos.
- Admin suite after the projects/notifications continuation: 74 files passed, 1 skipped, 187 tests passed, 3 explicit todos.
- API suite after the projects/notifications continuation: 338 suites and 3022 tests passed. The affected legacy review and booking-transaction source scans were replaced with tests that execute review delivery, assignment, no-show cancellation, shared transaction clients, and post-commit push order through real service/HTTP behavior.
- Repository lint: passed with zero warnings or errors.
- API and admin production builds: passed.
- Mobile production web export: passed with `EXPO_OS=web` and the production same-origin API URL.
- Gate A, the Gate C smoke suite, and Gate C passed with zero blocking or report failures. Gate D and Gate E exited successfully in their documented REPORT modes; they do not count as visual-baseline or mutation evidence.
- Production authentication preflight found and removed developer OTP, relaxed rates, and the admin 2FA bypass. One privileged account matched the formerly published demo credential; after backup it was deactivated, 13 sessions were revoked, and an audit event was written. The remaining privileged account has TOTP. Real Turnstile credentials still block production-mode promotion.
- Production baseline entering the route-isolation batch: local, GitHub, and the server were aligned at certification commit `37bbb0819f4c9e8f2aa6cddc3d16a292759a1f4f`, with all six compose services healthy.
- Browser smoke: the provider certification workspace was inspected from the clean production-config export with populated controlled data at 768/1366. The real browser file chooser produced a private onboarding upload, Chrome supplied the multipart boundary, the returned URL reached the certification PATCH, each date control measured 48 px high, tablet controls remained wide enough to show complete values, and neither viewport had horizontal overflow, console errors, or page errors. Provider 360 certification review baselines pass at 1280/1440/1920. The route-isolation export additionally proves customer-to-provider, provider-to-customer, and customer-to-staff direct URLs return to the correct role home at 768/1366; provider certification remains available to a provider; anonymous support returns to login; and all checked states have zero horizontal overflow and no browser page errors. Customer tracker/chat still need an authenticated customer browser session; their rendered behavior tests pass.
- Production asset and service smoke: admin and mobile `index.html` SHA-256 hashes matched the local production builds; the public config endpoint returned `#003D9B`, `#0052CC`, and `#FE8A00`; every onService compose service remained healthy.
- Provider approval/portfolio production release: local, GitHub, and the server reached `14b3dfc56aa10081922322dd3e15e9798073c7c4`; all GitHub CI and gate jobs passed; a full database/uploads/config/git backup completed; migration 148 dry-ran as the only pending file and was recorded; the nullable consent column exists with zero legacy portfolio rows; the API and both web artifacts matched the release; and provider dashboard, portfolio, secure documents, admin login, and same-origin config were exercised live at tablet/desktop widths. The controlled provider session was signed out after verification.
- Local visual regression record: three Provider 360 certification baselines raise the admin inventory from 387 to 390 PNGs. Existing Provider 360 snapshots were re-captured against the current app, and the former false empty/error states now wait for real missing-record and settled server-error output.
- Current UX-147 through UX-196 continuation: repository-wide TypeScript and lint passed; mobile passed 274 suites and 715 tests with 84 explicit todos; admin passed 75 files and 188 tests with one skipped file and 3 explicit todos; API passed 361 suites and 3026 tests. The obsolete CRIT-102 source-regex suite exposed by the completion import change was replaced with a real interaction test that captures and uploads two after-photos before the canonical status transition. Obsolete E02 source scans were removed while its isolated service behavior tests were retained honestly under E20; the lower API test count reflects removal of those fake assertions, not lost behavioral coverage.
- Current production artifacts: API and admin builds passed, and the mobile web export passed from an empty Metro cache with `EXPO_OS=web` and `EXPO_PUBLIC_API_URL=https://app.onservice.ph`.
- Current governance gates: Gate A passed all 10 BLOCKING fragments with zero failures; all six gate smoke tests and Gate C passed with zero BLOCKING or REPORT failures. Gate D and Gate E only confirmed their documented REPORT modes and are not counted as visual-baseline or mutation evidence.
- Current UX-197 through UX-199 continuation: repository-wide TypeScript and lint passed; mobile passed 274 suites and 715 tests with 84 explicit todos; admin passed 75 files and 188 tests with one skipped file and 3 explicit todos; API passed 364 suites and 3056 tests. The focused runtime/settings suite passed 153 tests, the mandatory API smoke passed 13/13, Gate A passed all 10 blocking fragments, all six gate self-tests passed, and Gate C passed all six blocking articles. The local full visual sweep could not run because Maestro and the admin Playwright CLI are not installed; no visual evidence is claimed for this non-UI batch.
- Current UX-200/201 continuation: repository-wide TypeScript and lint passed, the API build passed, the mandatory API smoke passed 13/13, Gate A passed all 10 blocking fragments, all six gate self-tests passed, Gate C passed all six blocking articles, and the full locally runnable API set passed 365 suites and 3057 tests. UX-201's generated-certificate Nginx test is excluded from that local count because this Windows machine's Docker daemon is unavailable; the same complete config passed `nginx -t` non-mutatively inside the live Nginx container against the actual certificates and shared vhost includes, and GitHub's Docker runner remains a required independent gate.
- Current UX-202 continuation: repository-wide TypeScript, lint, and the modified shell scripts' syntax passed; the mandatory API smoke passed 13/13; Gate A passed all 10 blocking fragments; all six gate self-tests and all six Gate C blocking articles passed; and the full locally runnable API set passed 366 suites and 3058 tests. The generated-certificate Nginx test remains the one local Docker-daemon exclusion and must pass again in GitHub CI.
- Current OPS-203 through OPS-228 continuation: repository-wide TypeScript and lint passed; API passed 383 suites and 3045 tests; mobile passed 278 suites and 712 tests with 84 explicit todos; admin passed 78 files and 191 tests with one skipped file and 3 explicit todos. API/admin production builds and the mobile production web export passed. The environment verifier covered 79 server/mobile keys, modified shell scripts passed syntax checks, Gate A passed all 10 blocking fragments, all six gate self-tests passed, and Gate C passed all six blocking articles. Gate D and Gate E only confirmed their documented REPORT modes. The one local exclusion remains UX-201's Docker-dependent generated-certificate Nginx test; GitHub CI and a live `nginx -t` are required before release.
- Current UX-203 through UX-215 / OPS-229 dispute continuation: repository-wide TypeScript and lint passed; API passed 387 locally runnable suites and 3049 tests; mobile passed 288 suites and 722 tests with 84 explicit todos; admin passed 78 files and 191 tests with one skipped file and 3 explicit todos. API/admin production builds and the production same-origin mobile web export passed. The environment verifier covered 80 server/mobile keys. Gate A passed all 10 blocking fragments, all six gate self-tests passed, and Gate C passed all six blocking articles; Gate D and Gate E only confirmed their documented REPORT modes. UX-201's generated-certificate Nginx test remains the one local Docker-daemon exclusion and must pass in GitHub CI plus live `nginx -t` before deployment.
- Current UX-216 through UX-234 and operations-handbook continuation: mobile passed 307 suites and 741 tests with 84 explicit todos; repository-wide mobile/admin/API TypeScript and lint passed; API and admin production builds passed; and the production same-origin mobile web export passed from an empty Metro cache across 4,262 modules. The environment verifier covered 80 server/mobile keys, Gate A passed all 10 blocking fragments, all six gate self-tests passed, and Gate C passed all six blocking articles. The active-copy scan found only legitimate process thresholds, negative claims, and comments, not a live guarantee, confirmation-only release promise, automatic-refund promise, fixed payout time, or customer masked-phone claim. The edits after the preceding full API/admin suite record were confined to mobile surfaces and operations documentation; GitHub's complete CI, including the Docker-dependent Nginx test, remains required before merge and deployment.
- Production release for UX-203 through UX-234: GitHub merged exact revision `22941bd87fb97d2300f1d3f3359f7b8ea995e762` after every CI job passed. A database/uploads/config/git backup preceded the server fast-forward; local/GitHub/server Git and both static artifact hashes matched; all six onService services and every neighboring app remained healthy; nginx validated; Redis retained `noeviction`; protected dispute access returned 401 without false server-error logging; and the public API origin remained blocked. No migration or development seed ran.
- Current UX-235 through UX-240 settings/auth continuation: mobile passed 313 suites and 747 tests with 84 explicit device todos. Mobile/admin/API TypeScript, repository lint, API/admin production builds, the 80-key environment contract, Gate A's 10 blocking fragments, all six gate self-tests, and Gate C's six blocking articles passed. The production same-origin mobile web export rebuilt cleanly from an empty Metro cache across 4,264 modules. The F#3 generator rewrote all 89 screen flows, both participant dispute details retained `MAESTRO_DISPUTE_ID`, and the capture wrapper passed shell syntax validation. This branch changes mobile UI/client behavior and visual tooling only; GitHub's full independent CI remains required before merge and deployment.
- UX-241 through UX-249 account-isolation and OTP-policy continuation passed independent GitHub CI and was deployed at master revision `a1ceee8c7e0bae9de7261697454f66142e5a8ae4` after a database/uploads/config/git backup. API, admin, Nginx, Redis no-eviction, settings drift, exact revision, upload mounts, and neighboring applications passed production checks. Browser QA then caught UX-250: the new customer/provider artifact was blank because native MMKV entered the web boot path. The immediately preceding working web artifact was restored while API/admin/server code remained healthy. The UX-250 correction passes its real browser-storage behavior test, mobile TypeScript, repository lint, 320 mobile suites and 754 tests with 84 explicit device todos, Gate A's 10 blocking fragments, all six gate self-tests, and Gate C's six blocking articles; its clean production export resolves 4,266 modules instead of the broken artifact's 4,267. Independent GitHub CI and a console-clean live browser load remain required before replacing the restored artifact.
- Current UX-251 through UX-259 System Settings continuation: repository lint and all workspace TypeScript checks passed; API and admin production builds passed; admin passed 80 files and 193 tests with one skipped file and 3 explicit todos; mobile remained green at 320 suites and 754 tests with 84 explicit device todos; and the locally runnable API set passed 397 suites and 3,057 tests. The mandatory API smoke passed 13/13, the 80-key environment contract passed, Gate A passed all 10 blocking fragments, all six gate self-tests passed, and Gate C passed all six blocking articles. UX-201's generated-certificate Nginx test remains the single local Docker-daemon exclusion and must pass in independent GitHub CI plus live `nginx -t` before deployment.

## Next implementation order

1. Continue the remaining customer booking, review, search, referral, and profile-detail forms; payment recovery remains blocked by E14 and direct dispute settlement by E18/E24.
2. Continue provider profile, quote-template, reviews, skills, service-area, and insights workspaces; provider fixed-price editing remains blocked by E16.
3. Continue the admin suspicion-first pass page by page, replacing generic confirmations only where impact preview, reason capture, and audit context are required.
4. Add real admin entity search after defining safe searchable fields and PII visibility.
5. Reconcile fine-grained staff authorization through an explicit architecture decision.
6. Resolve money/legal hard stops before changing those workflows.
