# onService PH application status

**Snapshot date:** 2026-09-05 (Asia/Singapore)  
**Purpose:** current product, implementation, test, deployment, and client-testing status.  
**Honesty boundary:** this is a status snapshot, not a launch certificate. A route, screen, test file, or reachable hostname is not by itself proof that the full business workflow works in production.

## Executive answer

The app has a large working foundation, but it is not complete or ready to hand to an external client as a final product. The three user-facing areas exist, the shared API/database exists, and the admin console has broad operational coverage. The remaining work is concentrated in end-to-end workflow truth, production controls, legal/financial approvals, native-device evidence, and production synchronization.

The most important current facts are:

- Customer and provider use the same Expo app and web entry point, with role-specific routes after login.
- The admin console is a separate React web application for company operators, support, finance, compliance, and super-admin controls.
- The API and Postgres database are the shared source of business state. Customer, provider, and admin screens are not independent mock products.
- A substantial amount of desktop/tablet browser work and admin linkage work is implemented and historically tested.
- Some important workflows are deliberately held or only partially implemented. Payments, legally compliant invoicing, provider application review, proof-to-close operations, privacy/security governance, and production deployment are not all closed.
- No live testing credentials are currently verified. The local seeded accounts in `docs/TESTING-GUIDE.md` are not production logins.

## The areas of the product

| Area | Who uses it | What it contains now | Current status |
|---|---|---|---|
| Customer workspace | Homeowners, tenants, businesses, and other service buyers | Discover services, select an address, request fixed-price or quote work, pay through the supported wallet path, track bookings, communicate, provide proof/review/tip input, recurring bookings, referrals, data-rights controls, and the staged business-account workspace | **Built foundation, partial end-to-end.** Browser surfaces are broad and responsive. External payment authorization, recurring auto-charge, preferred-provider guarantees, some business booking capabilities, and several proof-to-close capabilities remain held or incomplete. |
| Provider workspace | The worker or business supplying the service, such as a painter, cleaner, plumber, electrician, or construction worker | Provider onboarding/application, profile, services and skills, service areas, schedule/availability, incoming work, quotes, active-job execution, photos/proof, reviews, earnings, payouts, notifications, goals, and tier-related views | **Built foundation, partial end-to-end.** Provider screens and API contracts are broad. The provider-application source-of-truth conflict remains open, and payout/payment, native-device, and some business/proof workflows need further evidence or decisions. |
| Provider staff workspace | Staff members working under a provider business | Staff identity, employer linkage, job access, staff-driven completion, and provider-level quality roll-up | **Implemented in bounded form.** Staff privacy and role/permission policy still require a governed decision before expanding access. |
| Admin/company console | Operations, support, finance, compliance/DPO, managers, and super admins | Customer/Provider 360, Booking 360, Dispatch, support tickets, Communications, disputes, financials, payouts, B2B accounts, catalog, pricing, service areas, analytics, marketing, audit log, staff/roles, settings, security operations, data protection, consent, and password/2FA controls | **Broad UI and linkage, not a finished operator system.** Many views are real and role-gated. Several money, privacy, source-of-truth, and governance paths are intentionally read-only, fail-closed, or held. |
| Shared API and database | All three application areas | Auth, role checks, bookings, quotes, escrow/payment records, provider matching, notifications, messaging, support, disputes, invoices, compliance, audit records, migrations, and background workers | **Substantial implementation, not fully launch-proven.** The API is the shared business layer, but some architectural decisions and external integrations are still open. |
| Infrastructure and operations | Company/platform operators | Docker, Nginx, Terraform, backups, monitoring hooks, deployment/runbooks, and launch verification scripts | **Partially ready.** Public web entry points are reachable, but current branch-to-GitHub-to-server alignment cannot be claimed because production SSH access is rejected and several launch sign-offs are absent. |

## How the main records link together

The intended operating chain is:

```text
Customer or business account
        -> service request / booking
        -> provider matching, quote, or assignment
        -> provider job execution and proof
        -> customer acceptance, dispute, or support case
        -> escrow / payment / payout / invoice evidence
        -> customer, provider, and admin audit history
```

The current code contains many of these joins. Admin Booking 360 and Business Account 360 can link work to customer, provider, contract, invoice, support, proof, dispute, and audit context where the authoritative relationship exists. The remaining gaps are not cosmetic: a few business relationships, provider-application records, proof-to-close records, and money/legal decisions still need a single agreed source of truth before more UI or mutations are added.

## What is built and evidenced

The current local inventory is:

- **Admin:** 29 navigable destinations and 36 concrete page modules, including list pages, 360/detail pages, authentication, settings, and error handling.
- **Mobile:** 122 route files across customer, provider, onboarding, support, staff, tab, and shared layouts. The current visual-flow tree contains 94 Maestro YAML flows, 49 customer flows, and 45 provider flows.
- **API:** 50 route modules, plus services, validators, migrations, workers, and infrastructure configuration.
- **Admin visual evidence:** 33 Playwright visual specs and 552 checked-in PNG snapshots in the current working tree. Older handoff documents say 32 specs/411 screenshots and `AGENTS.md` says 354; this is documentation drift, not three separate products. The actual checked-in inventory is the stronger local fact, but the visual gate still needs a fresh release-level reconciliation.
- **Mobile visual evidence:** 94 committed flow definitions and no checked-in PNG baselines. F#3 still needs a supported iOS simulator or Android emulator capture.
- **Historical browser evidence:** prior audit records show populated customer coverage at 768/1024/1366 widths, populated provider coverage, fixed-price and quote flows, and provider onboarding coverage. Those records are useful evidence of the work completed, but they are not a current production release certificate.
- **Recent local verification:** the current audit wave added real rendered regressions for customer business-workspace loading truth, admin approved-term visibility, and admin business-account URL/history state. The related admin business tests pass, and admin TypeScript/lint pass locally.

## What is working versus what is not proven

### Working or substantially implemented

- Customer and provider role-specific navigation and shared authentication foundation.
- Catalog/service discovery, addresses, coverage checks, booking and quote paths.
- Provider onboarding, provider service/profile management, schedule and job execution surfaces.
- Booking 360, Dispatch, support queue/case views, communications moderation, and cross-record admin exits.
- Customer and provider 360 views with role-aware contact handling in the audited paths.
- Versioned business terms and controlled B2B statement preparation/finalization boundaries.
- Append-only or evidence-based patterns for sensitive admin actions in many audited paths.
- Responsive admin shell and customer/provider browser surfaces at desktop and tablet widths in the existing browser evidence.
- Fail-closed loading, error, empty, stale, and unavailable-source states in the audited screens, with additional fixes continuing in the current loop.

### Not complete, held, or not proven

- **Production synchronization:** the current local branch is `codex/financials-operator-truth` at `b110d897`. It is 100 commits ahead of the locally known origin copy of that topic branch and 326 commits ahead of the locally known `origin/master`. It has not been pushed as the current release, and production has not been updated from it.
- **Server verification:** the current production SSH authorization is rejected with `Permission denied (publickey)`. The correct onService deployment area was documented as `/opt/onservice` with `/opt/onservice-onsite-app` as an alias; an unrelated Odoo add-on path must not be used. Until authorized access is restored, the server cannot be checked or updated safely.
- **Native visual gate:** F#3 mobile PNG baselines are missing. F#4 admin baselines exist, but the count needs reconciliation before calling the release gate complete.
- **Legal/compliance:** attorney-reviewed disclaimer wording, entity/DPO details, NPC registration, DTI and city permit verification, BIR document authority, and related operational sign-offs are not complete.
- **Payments:** the external PayMongo authorization path is not launch-safe until the approved Checkout Session or client Payment Method flow is implemented and tested. Existing-wallet behavior is the supported local/demo path. Do not treat live-looking environment keys as evidence of a working payment integration.
- **Recurring billing:** recurring booking instances are supported with manual payment; recurring auto-charge remains blocked.
- **Proof-to-close:** identity, booking, checklist, and completion-gate foundations exist, but the full property/site/visit, issue or punch correction, daily report, proof package, ready-to-invoice, structured reading/serial, warranty/callback, secure external-link, and integration set is not complete.
- **Provider applications:** mobile application submission and the latent admin onboarding-progress path do not currently share one unambiguous authoritative application record. Review/approve/backfill work remains paused under E74.
- **Admin money operations:** controlled B2B statement actions exist, including evidence-backed adjustments and reversals, but this is not proof that every booking, refund, provider commission, rate, payout, dispute, or customer-support adjustment has a complete governed operator path. Direct blind edits and retired mark-paid paths remain disabled where the current contract requires evidence and versioning.
- **Privacy/security governance:** raw audit PII reveal, admin 2FA disable/recovery behavior, provider-staff privacy, global audit correlation, and certain dispute notification decisions remain governed holds.
- **Third-party feedback:** the tester export and screenshots were traced into the audit records and influenced fixes. Feedback is input to the product decision process, not proof that every requested behavior is implemented.

## Launch blockers and next order

The next work order is:

1. Restore authorized production access and identify the exact deployed commit, environment, database, containers, and rollback point. Do not deploy blindly.
2. Reconcile the branch, GitHub, and server commit identity once access exists. Only then publish a client-test release.
3. Capture and review F#3 native baselines, reconcile F#4 counts, and keep the visual gate honest.
4. Close the attorney/legal decision and the external operational items in `docs/runbooks/launch-cutover.md`.
5. Resolve E74 provider-application authority and the held proof-to-close architecture before adding more operator actions.
6. Finish payment/invoice/commercial controls with real staging evidence, not production-looking fixtures.
7. Run a seeded, two-party client acceptance pass: customer, provider, support/admin, payment evidence, booking timeline, proof, dispute, refund/adjustment, notification, and audit trail.

## Live entry points checked on 2026-09-05

- [Customer and provider web app](https://app.onservice.ph/) - HTTPS returned 200 and the page title was `onService`.
- [Admin/company console](https://admin.onservice.ph/) - HTTPS returned 200 and the page title was `onService Admin`.
- [API host](https://api.onservice.ph/) - the API host exists, but protected readiness access returned 403 from the current checking host, consistent with an IP allowlist. The raw server IP must not be used as a client URL.

Both public web apps returned the same non-secret config at the time of the check: app version `0.1.0`, PHP, Asia/Manila, primary `#003D9B`, secondary `#0052CC`, accent `#FE8A00`, promo redemption disabled, and A/B testing disabled.

## Client logins

There are **no verified live client credentials in this snapshot**. Do not give a client the local seeded OTP or demo admin accounts as if they work in production. The local-only setup and demo-account instructions are in [docs/TESTING-GUIDE.md](TESTING-GUIDE.md).

For a real client pilot, the remaining controlled setup is:

- create dedicated test customer and provider accounts through the production-safe OTP flow;
- create dedicated admin/support accounts with real passwords and mandatory 2FA, using the proper least-privilege policy;
- record the account owner, expiry, and test data boundary outside the public repository;
- test only against a release whose commit is verified on GitHub and the server;
- revoke the test accounts and sessions after the client review.

Until production SSH authorization and the required operational decisions are resolved, creating or advertising those credentials would be unsafe and would overstate the readiness of the product.

## Source records

- [AGENTS.md](../AGENTS.md) - current operating rules and launch gate.
- [Launch readiness status](LAUNCH-READINESS-STATUS.md) and [launch cutover runbook](runbooks/launch-cutover.md).
- [Customer desktop/linkage audit](audits/CUSTOMER-DESKTOP-LINKAGE-AUDIT-2026-08-31.md).
- [Provider desktop/linkage audit](audits/PROVIDER-DESKTOP-LINKAGE-AUDIT-2026-08-31.md).
- [Admin/company continuous audit](audits/ADMIN-COMPANY-CONTINUOUS-AUDIT-2026-08-31.md).
- [Customer/provider 360 audit](audits/CUSTOMER-PROVIDER-360-AUDIT-2026-08-31.md).
- [Proof-to-close audit](audits/PROOF-TO-CLOSE-CORE-VALUE-AUDIT-2026-08-25.md).
- [Third-party feedback trace](audits/THIRD-PARTY-TESTER-FEEDBACK-TRACE-2026-08-24.md).
- [Production SSH escalation](../.ai-coder/escalations/E32-production-ssh-authorization-2026-08-30.md).
- [Provider application source-of-truth escalation](../.ai-coder/escalations/E74-provider-application-source-of-truth-2026-09-04.md).
