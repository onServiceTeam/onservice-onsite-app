# onService — QA Risk Register

Living list of known risks with severity, current state, workaround, and owner.
Severity: P1 (launch-blocking / money / legal), P2 (degraded), P3 (minor).
This complements `LAUNCH-LIMITATIONS.md` (which is the product-decision record);
this register is the QA/operational view.

| ID | Risk | Sev | State | Workaround / mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | **PayMongo is in LIVE mode on staging** — a tester running checkout charges a real card. | P1 | Open | Tester handoff says stop before payment. Real fix: load PayMongo TEST keys on the staging box. | Ken |
| R-2 | Dev-OTP (`000000`) login bypass is enabled on the public box. | P1 | Mitigated | Gated behind Basic Auth (E07); closes at production cutover with real SMS OTP. | Ken / infra |
| R-3 | In-app chat send + photo attachment is unreliable. | P2 | Known (LL §25) | Support routes users to "Call provider"; photo evidence via job-photos/dispute upload. | Eng (v1.1) |
| R-4 | Live provider GPS streaming not shipped. | P3 | Known (LL §32) | UI shows status pills (en route/arrived/in progress), not a moving pin. | Eng (v1.1) |
| R-5 | Promo codes can be created in admin but cannot be redeemed by customers. | P2 | Known (LL §30) | Admin banner explains the unwired state; don't run promo campaigns. | Eng (v1.1) |
| R-6 | Hourly-pricing subcategories unsupported — booking returns 400. | P2 | Known (LL §24) | Ops must not set `pricing_type=hourly`; admin UI hardening pending. | Eng / ops |
| R-7 | BIGINT money values coerced to JS Number (safe to ~₱90T/value). | P3 | Documented (LL §15) | Fine at launch scale; analytics summing all-time GMV must use BigInt. | Eng |
| R-8 | Webhook idempotency was app-layer only (lost/double credit edge). | P3 | Resolved (mig 133) | Event-level idempotency table; covered by `webhook-idempotency.test.ts`. | — |
| R-9 | Appium / native-device E2E blocked. | P2 | Blocked | Native build fails: `react-native-mmkv` v3 needs `react-native-nitro-modules`. Fix the dep, then Appium + Maestro baselines unblock together. | Eng / QA |
| R-10 | OTP login rate limiting blocks repeatable automated login. | P3 | By design | Good security posture. Automation reuses sessions / mints tokens; don't log in per test. | QA |
| R-11 | Accessibility workstream (B1) not started across ~96 screens. | P2 | Open | Shared UI kit carries a11y props; needs a per-screen pass + automated axe checks. | QA / eng |
| R-12 | English-only; Tagalog/Cebuano catalogs deferred. | P3 | Known (LL §28) | i18n shim is the swap point; no broken strings today. | Product (v1.1) |

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
