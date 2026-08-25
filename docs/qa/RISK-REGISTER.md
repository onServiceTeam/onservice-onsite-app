# onService — QA Risk Register

Living list of known risks with severity, current state, workaround, and owner.
Severity: P1 (launch-blocking / money / legal), P2 (degraded), P3 (minor).
This complements `LAUNCH-LIMITATIONS.md` (which is the product-decision record);
this register is the QA/operational view.

| ID | Risk | Sev | State | Workaround / mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | **The production/demo host contains PayMongo live credentials while the external hosted checkout entry is invalid under E14.** A real gateway call can charge money, but the current API-created browser URL is not an approved hosted checkout. | P1 | Open (E14) | Do not test with real payment methods, infer payment from a redirect, or manually mark an attempt paid. Use protected test credentials in non-production and validate the approved Checkout Session or client Payment Method flow plus verified webhooks before enabling external checkout. | Ken / eng |
| R-2 | Developer OTP, relaxed rate limits, and the admin 2FA bypass were enabled on the public box. | P1 | **Resolved in deployment (2026-08-24)** | Real SMS credentials were verified present; all three bypasses are off, the fixed OTP value was removed, one account using the published demo credential was deactivated, 13 sessions were revoked, and the remaining privileged account has TOTP. | — |
| R-3 | In-app chat send + photo attachment is unreliable. | P2 | Known (LL §25) | Support routes users to "Call provider"; photo evidence via job-photos/dispute upload. | Eng (v1.1) |
| R-4 | Live provider GPS streaming not shipped. | P3 | Known (LL §32) | UI shows status pills (en route/arrived/in progress), not a moving pin. | Eng (v1.1) |
| R-5 | Promo codes have a canonical server resolver and redemption ledger, but customers have no checkout input and the feature flag remains off. | P2 | Partially built (LL §30) | Admin banner explains the unwired customer state; do not run promo campaigns until the mobile input, preview/create linkage, and end-to-end tests ship. | Eng / product |
| R-6 | Hourly-pricing subcategories were previously unsupported. | P2 | **Resolved** (D27, LL §24) | Capped pre-authorization, server-clock settlement, unused-escrow refund, provider payout, catalog configuration, and customer/provider presentation are implemented and tested. Keep the approved overage/minimum/increment policy documented. | — |
| R-7 | BIGINT money values coerced to JS Number (safe to ~₱90T/value). | P3 | Documented (LL §15) | Fine at launch scale; analytics summing all-time GMV must use BigInt. | Eng |
| R-8 | Webhook idempotency was app-layer only (lost/double credit edge). | P3 | Resolved (mig 133) | Event-level idempotency table; covered by `webhook-idempotency.test.ts`. | — |
| R-9 | Native-device E2E visual evidence is incomplete. | P2 | Native alignment not on master; capture pending | A historical branch proved the aligned APK, but the branch is no longer on the current remote and master still reports SDK-55 native-module drift. Recreate the migration from current master and run its dedicated APK/Jest/web/staging gates. F#3 has 89 screen flows plus two setup helpers and still needs 89–356 baseline PNGs from a supported iOS simulator or Android emulator session. See `.ai-coder/handoff/F3-maestro-baseline-capture.md` and `docs/qa/NATIVE-BUILD-REQUIREMENTS.md`. | Eng / QA |
| R-10 | OTP login rate limiting blocks repeatable automated login. | P3 | By design | Good security posture. Automation reuses sessions / mints tokens; don't log in per test. | QA |
| R-11 | Accessibility coverage is incomplete across the customer, provider, and admin surfaces. | P2 | In progress | Shared and per-screen fixes have landed, but remaining evidence and gaps are tracked in `docs/audits/SCREEN-BY-SCREEN-UX-LINKAGE-LEDGER-2026-08-23.md`; F#3 native visual evidence is still pending. | QA / eng |
| R-12 | English-only; Tagalog/Cebuano catalogs deferred. | P3 | Known (LL §28) | i18n shim is the swap point; no broken strings today. | Product (v1.1) |
| R-13 | Final customer-facing guarantee/disclaimer language has not been supplied by counsel (E10/F#10). | P1 | Open legal hold | Keep interim no-insurance/no-guaranteed-payment wording; do not publish a guarantee limit or protection promise until attorney-approved text lands. | Ken / counsel |
| R-14 | Provider authority to set fixed service prices is unresolved (E16). | P1 | Open money-policy hold | Treat admin catalog pricing as canonical. Do not expose or imply provider-set fixed prices until the source-of-truth decision is approved. | Ken / product |
| R-15 | The internal large-payout review threshold is an application control, not a legal AML classification. The company's covered-person and reporting obligations have not been determined by Philippine counsel/compliance. | P1 | Open legal/compliance determination | Keep conservative internal holds and reasoned audit records. Do not label a held request a statutory covered/suspicious transaction or file/report based only on the app threshold; obtain counsel/compliance advice before live payout operations. | Ken / counsel / compliance |
| R-16 | The live API cannot yet use `NODE_ENV=production` because no real Turnstile secret or Cloudflare provisioning token is configured. | P1 | Open deployment hold (LL §41) | Keep every bypass independently disabled. Do not weaken the production secret guard or use test keys. Provision real server/client keys, run the verifier and deployed challenge flow, then switch the environment label. | Ken / eng |

## Findings from the automated test runs (2026-06-10/11)

| ID | Finding | Sev | State |
|---|---|---|---|
| F-1 | Web uploads / camera / signature / captcha broken in browsers. | P1 | **Fixed** (round-3 web-compat commits). |
| F-2 | Provider Jobs tab crashed the whole app (query-cache collision). | P1 | **Fixed** + regression test; verified on live. |
| F-3 | Password gate collided with the app's bearer token → every authenticated API call 401'd. | P1 | **Fixed** (gate no longer covers the bearer API). |
| F-4 | API authz verified: no IDOR, RBAC enforced, no privilege escalation, wallet self-scoped. | — | **Pass** (`qa/api-security/authz.test.mjs`, 14 checks). |
| F-5 | "You're offline" banner present in the a11y tree while online. | P3 | Verify a11y fix is in the deployed bundle. |

## Review cadence

Re-review this register at the start of each sprint and before any release that
touches a Tier 1 path.
