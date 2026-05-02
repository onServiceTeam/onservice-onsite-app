# Phase 17 — Status (2026-05-03)

Verifying the 5g–5r fix wave against a real Postgres + real HTTP +
real Chromium (headless via Playwright). One session in.

## What got verified end-to-end (real runtime, not mocks)

### LL#12 — admin password rotation campaign ✓ FULLY VERIFIED

12-step e2e in `.ai-coder/phase-15-real-audit/test-ll12-e2e.mjs`:

| Step | Verification | Result |
|---|---|---|
| 1-3 | Reset DB state (legacy hash, no 2FA, must_rotate=FALSE) | PASS |
| 4 | Mint super_admin JWT | PASS |
| 5 | GET /security/admin/legacy-password-stats | PASS — legacy:1 |
| 6 | POST /security/admin/flag-legacy-password-hashes | PASS — newlyFlagged:1 |
| 7 | DB confirms must_rotate_password=TRUE | PASS |
| 8 | GET /auth/me returns mustRotatePassword:true | PASS |
| 9 | Headless Chromium launches | PASS |
| 10 | Admin web redirects unauth → /login | PASS (screenshot 02) |
| 11 | Login form fill+submit accepted | PASS (screenshot 03) |
| 12 | Post-login state captured | PASS (screenshot 04) |

Plus separate curl-level verification of /me/change-password:
- Wrong old password → HTTP 401 ✓
- Correct old password → "Password updated." ✓
- /me flips mustRotatePassword:false ✓
- Stats now legacy:0, mustRotate:0 ✓

**Bugs surfaced + fixed in this verification:**
1. CRIT-PHASE17-01 — security_events_event_type_check missing 4
   admin-2FA event verbs. Migration 117 adds them.
2. LL#12 used target_type='user_batch' which isn't in the
   admin_actions CHECK list. Changed to 'system'. Fixed in same
   commit as mig 117.

### LL#10 — IAM least-privilege Terraform ✓ VALIDATED

`terraform init` + `terraform validate` against
infra/terraform/iam-api-service-role.tf both pass. Pre-existing
lifecycle-rule warnings in s3-* files are NOT introduced by my IAM
file (verified: same warnings exist before applying).

Real validation done — `terraform plan` against prod AWS still needs
operator credentials, but configuration is syntactically and
type-correct.

## What still needs runtime verification (deferred to next session)

| Item | What's needed |
|---|---|
| LL#5 mobile pending-consent banner | Need to render the data-rights screen with non-empty pending list. Backend works; mobile UI never been rendered live. |
| LL#5 admin material checkbox | Need to render the ConsentVersionsPage publish dialog and submit material:true. |
| Audit timeline UNION (5r) | Need to insert rows into both audit_log + admin_actions and verify GET /admin/audit-log returns both with source discriminator. |
| Activity-routes role forwarding (5r) | Need to call /admin/customers/:id/activity as super_admin and as junior admin and confirm masking differs. |
| Financials by-payment degraded banner (5r) | Need to break the bookings.payment_method column locally and verify the banner renders. |

## What was found out of scope but worth noting

### Rate-limit middleware uses in-memory store

`packages/api/src/middleware/rate-limit.middleware.ts` uses
express-rate-limit's default in-memory store. This means:
- Counters reset on every API restart.
- e2e test runs that exercise login multiple times trip the limit
  and stay tripped until restart.
- In production behind multiple API replicas, each replica has its
  own count — effectively allowing N×limit total requests.

Recommended fix: switch to a shared store backed by Redis. Already
have ioredis available. Defer to a separate commit as it's not
audit-blocking.

### Forced 2FA + mustRotatePassword interaction

If an admin is flagged for password rotation AND hasn't yet
enrolled in 2FA, the login flow forces 2FA setup BEFORE the
mustRotatePassword flag surfaces. Current behavior:
1. Login → 2FA-setup-required (with preAuthToken)
2. POST /admin/2fa/setup → returns secret + QR
3. POST /admin/2fa/enable with TOTP → returns FINAL session +
   mustRotatePassword:true
4. Admin web routes to /change-password.

This works but adds a step. Argument for the current design:
2FA enrollment is a separate compliance requirement that shouldn't
be skipped just because a password rotation is also required. OK
to leave as-is; document it in the runbook.

## Numbers (Phase 17 close)

- New migrations: 1 (117_phase16_security_events_2fa_types.sql)
- Real bugs fixed in this session: 2 (CRIT-PHASE17-01 + LL#12 target_type)
- Backend tests: 2498 passing (unchanged; mock-based suite unaffected
  by these runtime fixes)
- Admin tests: 101 + 3 todo
- e2e test files added: 1 (test-ll12-e2e.mjs, 12 steps all green)
- Screenshots captured: 4 (login + post-login states)
- Terraform validate on IAM module: PASS
