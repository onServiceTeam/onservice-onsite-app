# onService PH Stitch, UX, linkage, and operations audit

Date: 2026-08-23
Status: living implementation audit
Repository baseline: `3b656d6ace1c353f0b5b7bc0e144e77feaf0fc5e`
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
- 34 admin page components plus the admin router and shared shell;
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
| Fulfilment      | Tracker, chat, active booking, changes             | Active job, navigation, checklist, photos, change order | Dispatch, booking detail, communications                   | Broad coverage; desktop composition and live-state honesty need work      |
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
- Fixed: shared design tokens preserve the server-canonical teal/cyan/orange brand while adopting Stitch's stronger contrast, hierarchy, and accessible default body sizing.
- Fixed: web animations use the JavaScript driver in browsers, eliminating the unsupported native-driver warning while retaining native acceleration on iOS and Android.
- Fixed: content padding now scales for phone, tablet, and desktop.
- Open: several complex screens remain single-column inside the desktop content area. Booking detail, quotes, tracker, projects, and support should use context side panels where that materially helps.
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
- Open: jobs, calendar, clients, and earnings need per-screen wide-layout verification at 768, 1024, 1280, and 1440 pixels.
- Open hard stop: provider response inside a dispute is not implemented.
- Open hard stop: checklist `Report Issue` has no approved API endpoint.
- Open hard stop: milestone escrow behavior is unresolved.

## Admin page register and operating purpose

| Group            | Pages                                                                                                         | Required operating purpose                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Command          | Dashboard, Analytics                                                                                          | queues, alerts, marketplace pulse, demand, quality, growth               |
| Operations       | Bookings, Booking Detail, Dispatch, Recurring, Projects, Service Areas                                        | fulfilment, assignment, exceptions, capacity, market controls            |
| People           | Providers, Provider Detail, Customers, Customer Detail, Business Accounts, Business Account Detail            | onboarding, vetting, account history, risk, access, billing context      |
| Support & Trust  | Support Tickets, Communications, Disputes, Dispute Detail                                                     | case ownership, conversation, evidence, decisions, escalation            |
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
- Fixed: booking reassignment uses a named online-provider picker rather than asking an employee to paste a UUID.
- Fixed: dispute assignment uses a named active-admin picker rather than asking an employee to paste a UUID.
- Open high: global entity search by booking number, ticket number, person, phone, payout, or provider is absent.
- Open high: custom `admin_roles.permissions` are metadata and are not the enforcement source for page/API access. The app still fundamentally authorizes `admin`, `super_admin`, and `dpo` user roles.
- Open high: several admin pages remain collections of local cards and tabs rather than linked case workspaces.
- Open: operational SLA deadlines are not modeled, so the support UI must not invent countdowns.
- Open: analytics and dashboard numbers need metric definitions, source labels, comparison periods, and freshness indicators.
- Open: destructive or money-affecting actions need consistent reason capture, preview, server authorization, and audit display.
- Open low: the admin production build still warns about the 540.39 kB main JavaScript chunk and 399.24 kB dashboard chunk; route loading is already split, but shared-library and dashboard chart splitting need a focused performance pass.

## Documentation and environment findings

- Production admin demo auto-login is intentionally disabled; demo documentation now states that admin access requires an authorized account.
- Several operations documents still state that in-app support ticketing is absent, but customer and provider support inbox, create, and thread routes now exist.
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

## Verification record for this batch

- Admin TypeScript: passed.
- Mobile TypeScript: passed.
- API TypeScript: passed.
- Mobile suite: 176 suites passed, 706 tests passed, 88 explicit todos.
- Admin suite: 49 files passed, 1 skipped, 158 tests passed, 3 explicit todos.
- API suite: 282 suites passed, 3029 tests passed.
- Admin and mobile lint: passed with zero warnings or errors.
- API and admin production builds: passed.
- Mobile production web export: passed with the production same-origin API URL and demo test mode.
- Production release: local, GitHub `master`, and `/opt/onservice` aligned at `75ea2fc4e715ccf4b6ed7ff46e013f50e4cf2060`; GitHub CI run 32638203116 passed every job.
- Production browser smoke: customer and provider rendered at 800 by 1000 and 1280 by 900 with no horizontal overflow or current console errors/warnings; admin served the new login bundle with public demo access disabled.
- Production service smoke: API, nginx, Postgres, and Redis remained healthy; MedClaimsPro and both Cochi Loco public endpoints remained HTTP 200.

## Next implementation order

1. Audit and improve the remaining high-use wide layouts: customer booking detail and quote comparison; provider jobs, schedule, and clients.
2. Convert provider/customer complex pages to responsive split layouts only where context remains useful beside the primary task.
3. Add real admin entity search after defining safe searchable fields and PII visibility.
4. Reconcile fine-grained staff authorization through an explicit architecture decision.
5. Resolve money/legal hard stops before changing those workflows.
