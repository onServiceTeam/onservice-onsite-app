# Current platform audit, 2026-08-22

## Status and honesty boundary

This is the current living audit for the customer, provider, staff, admin, API, documentation, CI, and production-server surfaces. It records only checks repeated against the current repository and live server. It does not claim that every interaction has already been manually exercised. Items not yet closed remain in the open register below.

Current verified repository identity:

- GitHub: `onServiceTeam/onservice-onsite-app`, branch `master`
- Production checkout: `/opt/onservice` on `46.62.207.225`, remote `git@github.com:onServiceTeam/onservice-onsite-app.git`
- The server also contains other applications. `/opt/crm-odoo/custom-addons/onservice` is not this product.
- The server directory is not being renamed. Deployment, backup, certificate, nginx, and volume paths depend on `/opt/onservice`. A clearer alias may be added later, but the canonical path must remain stable.

## Current surface inventory

The old 29-admin-page and 84-mobile-screen counts are stale.

| Surface | Current code inventory |
| --- | ---: |
| Admin routed page components | 34 |
| Mobile route-screen files | 103 |
| API route modules | 47 |
| API Jest suites / tests | 278 / 3,025 |

Mobile route-screen families:

| Family | Files |
| --- | ---: |
| Customer tabs | 4 |
| Customer detail/flow screens | 39 |
| Provider tabs | 4 |
| Provider operations screens | 35 |
| Provider onboarding | 10 |
| Provider staff | 3 |
| Shared support | 3 |
| Authentication | 3 |
| Shared root/onboarding | 2 |

The 34 admin components are Login, Change Password, Dashboard, Providers, Provider Detail, Customers, Customer Detail, Bookings, Booking Detail, Catalog, Projects, Disputes, Dispute Detail, Financials, Payouts, Notification Templates, Recurring, Business Accounts, Business Account Detail, Service Areas, Analytics, Audit Log, System Settings, Cancellation Policy, Support Tickets, Staff & Roles, Pricing Rules, Marketing, Dispatch Console, Communications, Compliance, Data Protection Log, Consent Versions, and Not Found.

## Cross-role source-of-truth trace

| Lifecycle | Customer surface | Provider/staff surface | Admin/support surface | Primary API/domain |
| --- | --- | --- | --- | --- |
| Account and identity | Login, OTP, profile, account management, data rights | Login, provider onboarding, KYC, certifications, team/staff | Provider 360, Customer 360, Staff & Roles, Compliance, Data Protection | auth, providers, staff, security, account, compliance |
| Discovery and coverage | Home, search, category, provider profile, addresses | Services, skills, service area, availability | Catalog, Providers, Service Areas, Pricing Rules | catalog, providers, service-areas, addresses, settings |
| Request and quote | Booking configure/form/job request, quotes | Leads, quote builder/templates | Bookings, Booking 360, Dispatch | bookings, providers, pricing |
| Payment and price truth | Checkout, pay, wallet, payment methods | Earnings and job price breakdown | Financials, Payouts, BIR, Settings | payments, wallet, escrow, payouts, financial admin |
| Fulfilment | Booking detail, tracker, photos, chat, change order | Job detail, navigation, checklist, photos, chat, change order | Booking 360, Dispatch, Communications | bookings, checklist, uploads, messaging/socket |
| Completion and trust | Complete, tip, review, dispute | Complete, reviews, response/evidence paths | Disputes, Compliance, Audit Log, Support | reviews, tips, disputes, escrow, audit |
| Retention and larger work | Recurring, Suki, projects, referrals | Suki customers, clients, reminders, insights | Recurring, Projects, Marketing, Business Accounts | recurring, suki, projects, referrals, business, marketing |
| Support | Help, safety, shared support inbox/thread | Provider Help and shared support | Support Tickets, Communications, booking/customer/provider detail | support-tickets, messaging, notifications |

This trace exposes the key company rule: admin pages must not invent a second status, price, policy, or identity model. They are support and control surfaces over the same API records used by the customer and provider apps.

## Repairs completed in this audit batch

1. Production API outage fixed. Shared nginx had resolved the generic hostname `api` to the Cochi Loco container. onService now has the unique network alias `onservice-api-backend`, nginx uses it, and `scripts/server/verify-onservice-upstream.sh` verifies the mapping.
2. API CI timeout fixed. Unit suites no longer create real Redis and PostgreSQL clients in every Jest sandbox. All 278 suites and 3,025 tests now pass and the process exits normally.
3. Invoice-number security test corrected. It now calls real behavior with deterministic cryptographic bytes instead of inspecting source text.
4. Browser width lock fixed. `?view=mobile` no longer persists in browser storage and trap later provider/customer visits in a 480-pixel phone column.
5. Online accessibility state fixed. The offline alert is no longer mounted while the browser is online.
6. Web export fixed. Native-only EAS and Google Maps settings are omitted for an explicitly targeted web export; native production builds still require their real values.
7. Demo and Hetzner deployment documentation updated to match the same-origin web API and automatic phone/tablet/desktop behavior.

## Open register, ordered by risk

### Launch-blocking decisions and compliance

- Cancellation-policy display and refund money math are separate and can disagree. Escalation E09 is an active money-path hard stop.
- Final guarantee/protection wording and legal basis remain open (E10 and F#10).
- Milestone escrow for Projects is not legally/accountingly approved (E12).
- Provider dispute response and checklist Report Issue flows remain unresolved product/API gaps (E04 and E05).
- The operational launch runbook still requires legal, tax, payments-live-mode, backup/PITR, DNS/TLS, and regulator sign-offs. The staging demo must not be described as launch-ready production.

### Engineering and production operations

- `.github/workflows/deploy.yml` watches `main` and pulls `origin main`, while the real branch is `master`. It also loads a tagged image that the compose service does not select. Automatic deployment is therefore not trustworthy yet.
- `.github/workflows/gates.yml` does not run on direct `master` pushes even though the rulebook says master is gated. Gate D/E also invoke pnpm in an npm-lockfile repository and tolerate install failures.
- Docker CI builds an image but carries a stale comment deferring runtime smoke, although the Dockerfile now runs through `tsx`. A real container boot check is still needed.
- Fresh install requires `npm ci --legacy-peer-deps` because ESLint 10 conflicts with the supported peer range of `eslint-plugin-react`.
- The current dependency audit reports 42 findings (1 critical, 20 high, 18 moderate, 3 low). Production-only audit reports 38 (1 critical, 17 high, 18 moderate, 2 low). Upgrades need staged testing; do not run a forced audit rewrite.
- The shared server has shown severe short-term load spikes and SSH `MaxStartups` rejections. Capacity and process attribution need monitoring before traffic is opened.
- Docker Compose warns that the existing uploads volume is not declared external. This must be reconciled without risking uploaded customer/provider files.
- `/opt/SERVER-MAP.md` is referenced by production comments but absent.
- Static frontend deployment is still manual and must recreate nginx after replacing bind-mounted assets to avoid stale inodes.

### Product, admin, and documentation

- Admin access is mostly one broad authenticated shell. The training manual itself says finance/super-admin gating and a limited support role are still pre-launch work. Route, sidebar, button, and server RBAC must be reconciled as one permission matrix.
- Dispatch still has a TODO for deriving its initial map center from active/default service-area data.
- Pricing contains a deferred surge-rule resolution TODO in a money path; this cannot be changed without resolving the current pricing authority and tests.
- Historical audits and strategy files contained stale screen counts, Boracay-first direction, old fee values, and old server details. They are retained as history but now carry warnings.
- The 354 admin visual baselines cover the former 29-page catalog. Newer route components need explicit visual-state coverage.
- Customer/provider web uses a responsive outer surface, but every screen still needs interaction and overflow checks at phone, tablet, and desktop widths. Fixing the persistent 480-pixel lock does not by itself prove every inner screen is fully responsive.

## Verification required for each remaining batch

For each defect: reproduce it, change the smallest source of truth, add one behavioral test for that defect, run the affected type check and full suite, push to `master`, wait for CI, fast-forward the verified production checkout, deploy only the affected services/assets, and recheck the live customer/provider/admin path plus the unrelated shared-server vhosts.

Money, compliance, legal wording, destructive migrations, and production-data changes remain hard stops that require the existing escalation/decision process.
