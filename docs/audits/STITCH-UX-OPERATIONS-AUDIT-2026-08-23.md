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
- 103 Expo Router screen files and 8 route layouts under `apps/mobile/app`;
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
| Retention       | Recurring, projects, referrals, Suki Pros          | Clients, Suki customers, schedule, insights             | Recurring, projects, marketing, analytics                  | Features exist but metrics and lifecycle ownership are fragmented         |
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
- Fixed in the current continuation: the canonical token source, mobile theme, native app chrome, admin CSS/chart palette, API fallback, and runtime branding settings now use the approved Stitch deep-blue/action-blue/orange/green palette together. Historical migration 072 remains immutable and migration 146 supersedes its defaults.
- Fixed: web animations use the JavaScript driver in browsers, eliminating the unsupported native-driver warning while retaining native acceleration on iOS and Android.
- Fixed: content padding now scales for phone, tablet, and desktop.
- Fixed in the current continuation: booking detail now places its summary and actions beside service context on desktop; quote review becomes a tablet/desktop comparison grid.
- Fixed in the current responsive batch: tracker now becomes an honest map-and-status workspace, and customer chat keeps booking status, schedule, location, details, and tracker actions beside the conversation at tablet/desktop widths.
- Open: project detail, notifications, and support remain single-column inside the desktop content area and need context side panels where that materially helps.
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
- `/provider/team`, `/provider/settings`, `/provider/account-management`
- `/provider/help`, `/provider/standards`

### Provider staff

- `/staff/jobs`, `/staff/job/[id]`, `/staff/invites`

Provider findings:

- Fixed: desktop now has persistent Dashboard, Jobs, Job Requests, Schedule, Clients, Earnings, Team, Support, and Profile destinations.
- Fixed: provider staff receives a smaller, scoped desktop workspace instead of provider-owner navigation.
- Fixed: bottom tabs are hidden when persistent desktop navigation is active, removing duplicate navigation.
- Fixed: browser builds no longer request the unavailable native animation driver; a clean production export rendered without console warnings.
- Fixed in the current continuation: provider weekly schedule becomes a tablet/desktop grid with a bounded desktop save action.
- Fixed in the current responsive batch: provider job detail keeps canonical earnings and execution actions beside the job record; calendar separates the month grid from the selected-day schedule; chat keeps customer/job context beside the thread and now shows providers why the on-app record matters for support.
- Fixed in the provider-operations continuation: Withdrawal Preferences now uses a bounded Stitch-aligned two-column workspace, states the manual-only launch mode, preserves and exposes inactive legacy cadences, saves only canonical withdrawal details, and links directly to Withdraw and Payout History. Admin Financials no longer presents pending requests as an invented schedule (Bugs UX-069 through UX-074; E15; launch limitation 38).
- Fixed in the provider-operations continuation: job details and the legacy active-job surface now route browser/native direction actions into one bounded navigation workspace, and a successful Start Navigation transition opens it immediately. External maps require a loaded address or coordinates, arrival requires booking coordinates and the en-route state, and schedule load failures expose retry instead of editable defaults (Bugs UX-075 through UX-079).
- Open: jobs, clients, earnings, and the quote builder need per-screen wide-layout verification at 768, 1024, 1280, and 1440 pixels.
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
13. Removed the customer-profile link that incorrectly exposed a provider-staff invitation route.
14. Removed unsupported native-driver requests from every shared browser animation component.
15. Added rendered-output and route/service behavior tests for each claimed change.
16. Added the explicit 103-screen, 8-layout, and 35-admin-page linkage ledger; shell-only responsive coverage is no longer counted as per-screen completion.
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

## Verification record for this batch

- Admin TypeScript: passed.
- Mobile TypeScript: passed.
- API TypeScript: passed.
- Mobile suite after the service-scope batch: 192 suites passed, 718 tests passed, 88 explicit todos.
- Admin suite after the service-scope batch: 63 files passed, 1 skipped, 176 tests passed, 3 explicit todos.
- API suite after the service-scope batch: 286 suites passed, 3020 tests passed.
- Admin and mobile lint: passed with zero warnings or errors.
- API and admin production builds: passed.
- Mobile production web export: passed with `EXPO_OS=web` and the production same-origin API URL.
- Production baseline entering the service-scope batch: application source and assets were aligned through Tester Feedback commit `257ce394eb61eeb978ecf980cad742208d4e8f19`, including migration 147 and healthy API/admin/mobile services. Each later checkpoint must still pass GitHub CI before the source and affected production assets are advanced together.
- Production browser smoke: admin login rendered the Stitch operations workspace live at 1280 with 44 px controls and no overflow. Provider dashboard and Schedule were verified at 820/1280. Provider calendar, job detail, and chat now render their paired workspaces at 820/1280 with no horizontal overflow. Live QA caught and fixed an initial one-pixel calendar detail collapse before closeout. Customer tracker/chat still need an authenticated customer browser session; their rendered behavior tests pass.
- Production asset and service smoke: admin and mobile `index.html` SHA-256 hashes matched the local production builds; the public config endpoint returned `#003D9B`, `#0052CC`, and `#FE8A00`; every onService compose service remained healthy.
- Local visual regression record: all 21 Catalog states replayed cleanly after the endpoint interception was corrected. Populated scope queue, customer preview, and ordinary-admin read-only images were inspected directly at 1280 pixels. The admin baseline inventory is now 387 PNGs.

## Next implementation order

1. Continue the tester-backed customer findings in evidence order: wallet top-up recovery, Cebu address recognition, and support entry/linkage.
2. Work the tester-backed provider findings: job navigation, service editing, availability validation, team contact validation, certification/upload states, and payout presentation.
3. Audit and improve the remaining high-use wide layouts: customer projects, support, and notifications; provider earnings, client detail, and quote builder.
4. Continue the admin suspicion-first pass page by page, replacing generic confirmations only where impact preview, reason capture, and audit context are required.
5. Add real admin entity search after defining safe searchable fields and PII visibility.
6. Reconcile fine-grained staff authorization through an explicit architecture decision.
7. Resolve money/legal hard stops before changing those workflows.
