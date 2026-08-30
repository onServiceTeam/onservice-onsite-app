# Current platform audit, 2026-08-22

## Status and honesty boundary

This is the current living audit for the customer, provider, staff, admin, API, documentation, CI, and production-server surfaces. It records only checks repeated against the current repository and live server. It does not claim that every interaction has already been manually exercised. Items not yet closed remain in the open register below.

The 2026-08-23 Stitch, cross-role UX, and company-operations implementation audit continues this record at `docs/audits/STITCH-UX-OPERATIONS-AUDIT-2026-08-23.md`. The attached ProofFlow/FieldOS comparison and its onService-specific product model continue it at `docs/audits/PROOF-TO-CLOSE-CORE-VALUE-AUDIT-2026-08-25.md`.

Current verified repository identity:

- GitHub: `onServiceTeam/onservice-onsite-app`, branch `master`
- Production checkout: `/opt/onservice` on `46.62.207.225`, remote `git@github.com:onServiceTeam/onservice-onsite-app.git`
- The server also contains other applications. `/opt/crm-odoo/custom-addons/onservice` is not this product.
- The server directory was not renamed. Deployment, backup, certificate, nginx, and volume paths depend on `/opt/onservice`. A safe alias, `/opt/onservice-onsite-app`, resolves to that canonical path so operators can identify it clearly without breaking existing automation.

## Current surface inventory

The old 29-admin-page and 84-mobile-screen counts are stale.

| Surface                      | Current code inventory |
| ---------------------------- | ---------------------: |
| Admin routed page components |                     35 |
| Mobile task screens          |                    110 |
| Mobile route layouts         |                      9 |
| Mobile route files total     |                    119 |
| API route modules            |                     48 |
| API migrations               |                    145 |
| API Jest suites / tests      |            456 / 3,100 |

Mobile route-screen families:

| Family                       | Files |
| ---------------------------- | ----: |
| Customer tabs                |     4 |
| Customer detail/flow screens |    41 |
| Provider tabs                |     4 |
| Provider operations screens  |    38 |
| Provider onboarding          |    10 |
| Provider staff               |     5 |
| Shared support               |     3 |
| Authentication               |     3 |
| Shared root/onboarding       |     2 |

The 35 admin components are Login, Change Password, Dashboard, Providers, Provider Detail, Customers, Customer Detail, Bookings, Booking Detail, Catalog, Projects, Disputes, Dispute Detail, Financials, Payouts, Notification Templates, Recurring, Business Accounts, Business Account Detail, Service Areas, Analytics, Audit Log, System Settings, Cancellation Policy, Support Tickets, Staff & Roles, Pricing Rules, Marketing, Dispatch Console, Communications, Tester Feedback, Compliance, Data Protection Log, Consent Versions, and Not Found.

## Cross-role source-of-truth trace

| Lifecycle                 | Customer surface                                     | Provider/staff surface                                        | Admin/support surface                                                  | Primary API/domain                                        |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Account and identity      | Login, OTP, profile, account management, data rights | Login, provider onboarding, KYC, certifications, team/staff   | Provider 360, Customer 360, Staff & Roles, Compliance, Data Protection | auth, providers, staff, security, account, compliance     |
| Discovery and coverage    | Home, search, category, provider profile, addresses  | Services, skills, service area, availability                  | Catalog, Providers, Service Areas, Pricing Rules                       | catalog, providers, service-areas, addresses, settings    |
| Request and quote         | Booking configure/form/job request, quotes           | Leads, quote builder/templates                                | Bookings, Booking 360, Dispatch                                        | bookings, providers, pricing                              |
| Payment and price truth   | Checkout, pay, wallet, payment methods               | Earnings and job price breakdown                              | Financials, Payouts, BIR, Settings                                     | payments, wallet, escrow, payouts, financial admin        |
| Fulfilment                | Booking detail, tracker, photos, chat, change order  | Job detail, navigation, checklist, photos, chat, change order | Booking 360, Dispatch, Communications                                  | bookings, checklist, uploads, messaging/socket            |
| Completion and trust      | Complete, tip, review, dispute                       | Complete, reviews, response/evidence paths                    | Disputes, Compliance, Audit Log, Support                               | reviews, tips, disputes, escrow, audit                    |
| Retention and larger work | Recurring, Suki, projects, referrals                 | Suki customers, clients, reminders, insights                  | Recurring, Projects, Marketing, Business Accounts                      | recurring, suki, projects, referrals, business, marketing |
| Support                   | Help, safety, shared support inbox/thread            | Provider Help and shared support                              | Support Tickets, Communications, booking/customer/provider detail      | support-tickets, messaging, notifications                 |

This trace exposes the key company rule: admin pages must not invent a second status, price, policy, or identity model. They are support and control surfaces over the same API records used by the customer and provider apps.

## Repairs completed in this audit batch

1. Production API outage fixed. Shared nginx had resolved the generic hostname `api` to the Cochi Loco container. onService now has the unique network alias `onservice-api-backend`, nginx uses it, and `scripts/server/verify-onservice-upstream.sh` verifies the mapping.
2. API CI timeout fixed. Unit suites no longer create real Redis and PostgreSQL clients in every Jest sandbox. All 278 suites and 3,025 tests now pass and the process exits normally.
3. Invoice-number security test corrected. It now calls real behavior with deterministic cryptographic bytes instead of inspecting source text.
4. Browser width lock fixed. `?view=mobile` no longer persists in browser storage and trap later provider/customer visits in a 480-pixel phone column.
5. Online accessibility state fixed. The offline alert is no longer mounted while the browser is online.
6. Web export fixed. Native-only EAS and Google Maps settings are omitted for an explicitly targeted web export; native production builds still require their real values.
7. Demo and Hetzner deployment documentation updated to match the same-origin web API and automatic phone/tablet/desktop behavior.
8. Customer, provider, and provider-staff web now have role-specific persistent desktop navigation instead of a widened phone-only shell.
9. Admin navigation is grouped by operating purpose and shared with page command search; the dashboard now leads with action queues.
10. Admin support list/detail PII masking is wired at the route boundary, named assignment replaces pasted UUIDs, assignments are validated and audit-logged, and closed-case resolution notes persist.
11. Production deployment documentation now matches the real shared Hetzner topology; the API deploy workflow is manual until its repository secrets are deliberately configured.
12. The customer/provider and admin artifacts plus API were deployed, followed by the CI, transaction, icon, routing, bundle-splitting, and deployment-document hardening through `17337c3a53cd59b45c5eda0493dbbc2720b28734`. GitHub, the local working clone, and `/opt/onservice` were reverified clean and aligned after deployment.

## Open register, ordered by risk

### Launch-blocking decisions and compliance

- Cancellation-policy display and refund money math are separate and can disagree. Escalation E09 is an active money-path hard stop.
- Final guarantee/protection wording and legal basis remain open (E10 and F#10).
- Milestone escrow for Projects is not legally/accountingly approved (E12).
- Provider dispute response and checklist Report Issue flows remain unresolved product/API gaps (E04 and E05).
- Customer-acceptance signature identity remains held under E19; the provider-session bitmap is not verified customer identity evidence.
- Suki redemption has a centavo/peso unit mismatch under E25. No redemption or wallet change is authorized until the money-path option is approved.
- Property/site/visit architecture for the proof-to-close direction requires D28. Read-only consolidation and current proof-integrity fixes can proceed; schema/backfill cannot.
- The operational launch runbook still requires legal, tax, payments-live-mode, backup/PITR, DNS/TLS, and regulator sign-offs. The staging demo must not be described as launch-ready production.

### Engineering and production operations

- Fixed in the follow-up infrastructure batch: `.github/workflows/gates.yml` runs on direct `master` pushes, report-only Gate D/E skip unnecessary setup, and their blocking setup uses the repository's npm lockfile.
- Fixed in the follow-up infrastructure batch: Docker CI starts the built image against ephemeral Postgres/Redis services and requires a successful `/health` response.
- Fresh install requires `npm ci --legacy-peer-deps` because ESLint 10 conflicts with the supported peer range of `eslint-plugin-react`.
- The current dependency audit reports 42 findings (1 critical, 20 high, 18 moderate, 3 low). Production-only audit reports 38 (1 critical, 17 high, 18 moderate, 2 low). Upgrades need staged testing; do not run a forced audit rewrite.
- The shared server has shown severe short-term load spikes and SSH `MaxStartups` rejections. Capacity and process attribution need monitoring before traffic is opened.
- Docker Compose warns that the existing uploads volume is not declared external. This must be reconciled without risking uploaded customer/provider files.
- Fixed: `/opt/SERVER-MAP.md` documents the shared host without storing credentials.
- Static frontend deployment is still manual. The verified procedure extracts into existing bind-mounted directories, preserving their inodes and avoiding a shared-nginx restart.

### Product, admin, and documentation

- Admin access is mostly one broad authenticated shell. The training manual itself says finance/super-admin gating and a limited support role are still pre-launch work. Route, sidebar, button, and server RBAC must be reconciled as one permission matrix.
- Dispatch still has a TODO for deriving its initial map center from active/default service-area data.
- Pricing contains a deferred surge-rule resolution TODO in a money path; this cannot be changed without resolving the current pricing authority and tests.
- Historical audits and strategy files contained stale screen counts, Boracay-first direction, old fee values, and old server details. They are retained as history but now carry warnings.
- The 354 admin visual baselines cover the former 29-page catalog. Newer route components need explicit visual-state coverage.
- Customer/provider web now uses a responsive role workspace, but every inner screen still needs interaction and overflow checks at phone, tablet, and desktop widths. A shared desktop shell does not by itself prove every route is fully responsive.
- Provider-staff suspension immediately revokes assigned-job access but does not resolve the retained `performer_staff_id`. E29/D31 recommends state-aware reassignment for pre-start work and an explicit provider/admin exception for work already under way; automatic booking or money mutation remains held.

## Verification required for each remaining batch

For each defect: reproduce it, change the smallest source of truth, add one behavioral test for that defect, run the affected type check and full suite, push to `master`, wait for CI, fast-forward the verified production checkout, deploy only the affected services/assets, and recheck the live customer/provider/admin path plus the unrelated shared-server vhosts.

Money, compliance, legal wording, destructive migrations, and production-data changes remain hard stops that require the existing escalation/decision process.
