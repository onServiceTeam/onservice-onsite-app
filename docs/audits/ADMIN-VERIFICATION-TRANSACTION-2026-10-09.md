# Administrator second factor verification transactions

Date: 2026-10-09, Asia/Singapore. Base: `126ec031eedc7eea9a3279a4d8460326e68c1dd9`.
Application: onService PH marketplace, existing PR 81. Candidate only, not live.
Scope: `POST /auth/admin/2fa/verify` and its recovery-code consumption helper.

## Reproduced findings

OPS-531: verification used account and factor state read before a concurrent
account writer committed. The fresh real-PostgreSQL baseline returned 401 after
session-generation revocation, but changed `last_login_at` and `updated_at`.
The later issuer check denied credentials without undoing the login metadata.
This is not a demonstrated protected-route bypass or production exploitation.

OPS-532: recovery-code use and its audit committed before the login metadata
update. An actual database trigger rejected that update with HTTP 500, but the
code's `used_at` and `used_ip` changed instead of remaining unused for retry.

Both baseline regressions failed in **6.464 seconds**. Only the local verify
handler was temporarily restored to the exact base implementation, with no diff
in that source file against HEAD. The standalone recovery helper's transactional
behavior remained. The corrected handler was then restored byte-for-byte,
verified by SHA256, before repeating the focused tests. No live account was used.

## Transaction correction

Verification now locks the account with `FOR NO KEY UPDATE` before recovery-code
rows. Under that lock it requires an active privileged account, the exact earlier
role and positive safe-integer session generation, and the currently enabled
factor. It verifies the current authenticator secret or consumes the recovery
code, records recovery use, and updates login metadata in one transaction.
Revoked authority returns 401 before those writes. A missing or disabled factor
returns 400. A failed metadata or recovery-audit write rolls back the transaction.

The transaction-aware recovery helper uses the caller's database client rather
than opening a nested transaction. The existing standalone service wrapper
retains its transaction and successful-consumption logging for compatibility;
the login route uses the new helper. Code format, remaining-count response,
authenticator tolerance, token purposes and lifetimes, cookie-only credentials,
password-rotation routing, dependencies and schema are unchanged. Held removal
and regeneration routes are not enabled.

## Database and HTTP verification

The final focused selection, repeated after the baseline and byte-for-byte
restoration, passed **5 suites / 11 tests in 17.136 seconds**:

- `bug-ops-531-admin-verification-revocation.test.ts` executes 18 combinations:
  admin, super-admin and DPO; authenticator or recovery code; committed generation,
  role or activity changes. Actual blocking is observed in PostgreSQL. Every
  denied request preserves the committed account and all recovery, audit, refresh
  and CSRF rows and sets no session cookie.
- `bug-ops-532-admin-verification-rollback.test.ts` uses a real failing metadata
  trigger. HTTP 500 preserves the account, recovery codes and audits and creates
  no session. Removing the trigger permits the same code on retry, with exactly
  one used code and one consumption audit.
- `admin-verification-transaction-postgres.test.ts` executes seven supporting
  tests: normal authenticator sign-in for all three roles with actual signed
  cookies and `/auth/me`; audit-insert failure and retry; account-writer rollback;
  post-verification revocation; competing uses of one recovery code; replacement
  of the current factor; and missing or disabled factors. Normal forced-password
  state is preserved. Concurrent code use creates exactly one session and audit.
- Existing SEC-038 and CRIT-N11 tests retain the response and cookie assertions,
  supplying the newly locked account read and transaction-aware helper.

These checks use guarded, test-owned PostgreSQL 17 schemas on loopback, real SQL,
real signed JWTs and authenticator cryptography, and the mounted Express auth
router. Scheduling hooks pause actual SQL or transaction completion, not fabricate
results. Rate limiting, security-event storage and diagnostic logging are isolated
test dependencies. This is not a restored production database or live acceptance.

The complete local API run passed **1,013 suites / 3,481 tests**, with two existing
TODOs and **two failed suites/tests**, in **472.327 seconds**. Only unchanged
UX-860 and UX-201 failed because the local Docker Linux engine was unavailable.
All new PostgreSQL tests executed; none were skipped. This is not a green full
local suite. The corrected source bytes match that full-run input.

API TypeScript, ESLint of all eight changed/new TypeScript files, the unchanged
**1,614-ID regression gate**, and whitespace checks passed. Four existing admin
real-render tests passed in **13.94 seconds**: UX-1023, UX-1024, UX-026 and UX-1382.
They exercise recovery login, the save step, login layout and copy feedback with
mocked API responses, not a live server or newly compiled browser acceptance.
Fresh exact-candidate CI remains required; earlier candidate CI does not verify
this change. Machine-readable red, focused and full-run reports remain in the
ignored repair-intake directory, not published with synthetic credential values.

Local Gate A passed all ten fragments. Initial gate smoke runs failed because
Git Bash selected the Windows Store `python3` launcher, then an exported-function
attempt could not satisfy the mode lookup's `exec`. A private process-local
executable shim selecting installed Python 3.12 corrected that tooling boundary.
All seven smoke scripts and all seven Gate C articles then passed. Gate source,
enforcement modes, assertions and allowlists were not changed. This is not fresh
GitHub verification of Gates B, D or E.

## Remaining login and release boundaries

Refresh-session issuance still follows the verification commit in a separate
transaction. The new post-commit test deliberately revokes generation for all
three privileged roles: issuance returns 401 with no credentials, refresh or
CSRF row, but the already committed recovery use, audit and login metadata remain.
That behavior is explicitly asserted, not described as rolled back. Issuer
failure, CSRF persistence and response delivery still require caller-level work.
This slice does not complete durable recovery acknowledgement or interrupted
enrollment recovery, and does not revoke previously issued privileged sessions.

The actual `LoginPage` and its recovery login test were read. Its request fields
and cookie-based completion remain compatible; no frontend source changed.
Its saved-codes checkbox is still browser-local. Wider lock ordering, other
issuers, response ordering and cross-tab behavior remain separate review items.

This is a bounded access repair within Stage 1 of the new repair program, not
completion of Stage 1 refunds, retry safety or all 124 historical findings.
The attachment's proposed migrations are not installed over existing history.

Production recovery remains held separately. No live account mutation, money
movement, master merge or deployment occurred. Complete migration and exact-image
rehearsal, matched API/admin/customer-provider artifacts, authenticated multi-role
acceptance, backups and rollback still gate release. Full latest-Stitch screen
acceptance, native evidence, legal review and live payment proof remain open.

Relevant live entry: [admin sign-in](https://admin.onservice.ph/login).
Loading that page is not proof of a working API or authenticated access.
