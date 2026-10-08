# Administrator initial setup: current authority and factor preservation

Date: 2026-10-08. Base: `c09a6f5d00bb7fa48373a5816ebb50c13f003af0`.
Application: onService PH marketplace, existing PR 81. Candidate only, not deployed.
Scope: `POST /auth/admin/2fa/setup`, the initial pending-key writer. This is not
a redesign of enrollment completion, recovery or acknowledgement.

## Findings and correction

OPS-527: initial setup trusted authorization performed before the key-writing
transaction. A request could continue after a concurrent account change revoked
that authority. The real PostgreSQL/HTTP regression paused after the middleware
read, deactivated the synthetic account, resumed setup and received HTTP 200
instead of 401 against unchanged base code.

OPS-528: setup checked whether the factor was enabled before its transaction.
A delayed request could replace the key and set enrollment back to disabled
after another request completed enrollment. The regression paused the first
setup transaction, successfully completed the actual enable route with a real
authenticator code, then resumed setup. Unchanged base code returned 200 instead
of 409. These two baseline tests failed in 1.379 seconds. Their first failing
assertions establish the accepted responses, not separately printed state
comparisons. No live account or production exploitation was involved.

Setup now locks the account with `FOR NO KEY UPDATE` inside the existing key/audit
transaction. It requires the account to remain active with exactly the earlier
authorized role and session generation. It does not substitute newer authority
for an older proof. Missing or changed authority receives 401. Normal access
also rechecks mandatory password rotation (428); the dedicated setup token
retains its existing rotation exception. Already-enabled enrollment receives
409 before key generation or writes. That message directs the operator to sign
in or contact support, not to the separately held disable operation.

The encrypted pending key and enrollment audit still commit together. The
secret/QR URI returns only after commit, and setup creates no full session.
No schema, dependency, token lifetime, role list, factor requirement or recovery
policy changes are included.

## Executed evidence

- `bug-ops-527-admin-setup-current-authority.test.ts`: 27 combinations across
  admin, super-admin and DPO, using setup and normal access tokens. It tests
  deactivation, changed privileged role, revoked generation, missing account
  and, for normal access, newly required password rotation. Rejection preserves
  account rows and creates no enrollment audit or backup codes.
- `bug-ops-528-admin-setup-enabled-factor.test.ts`: all three privileged roles
  complete the real enable route while setup waits. Delayed setup returns 409
  and preserves the completed account, audit, backup-code, refresh-session and
  CSRF rows. This tests one interleaving, not all enable-route races.
- `admin-setup-transaction-postgres.test.ts`: six eligible role/token paths
  return matching QR data and store the encrypted pending key without a full
  session; setup waits for account-writer commit or rollback; setup-first order
  makes the account writer wait while another account's setup proceeds.
  PostgreSQL blocking is observed directly. The competing revocation writer is
  fixture SQL, not an exercised operator screen.
- `med-n82-n84.test.ts`: MED-N82's source-text check is replaced by a real audit
  insert failure, full account rollback and successful retry through HTTP and
  PostgreSQL. MED-N84's existing schema assertions and source-wiring check are
  unchanged; the latter is not behavioral acceptance evidence.

Scheduling hooks pause actual queries or transaction entry without fabricating
query results. Database transactions, enrollment handlers, token authorization,
factor cryptography and enable-side cookie/session storage execute. Rate-limit
storage, security-event logging and the test logger are isolated. Fixtures use
test-owned PostgreSQL 17 schemas on loopback and a focused backup-code table,
not a complete production schema or restoration.

The extended selection passed **10 suites / 16 tests in 9.141 seconds**. It
includes existing rotation, setup-token boundaries, no-body-token delivery,
database-error, backup-login and disable-hold regressions. API TypeScript,
lint of all six changed/new TypeScript files, whitespace checks and the
unchanged **1,609-ID gate** passed.

The full local API run passed **1,007 suites / 3,465 tests**, with two existing
TODOs and **two failed suites/tests**, in **257.124 seconds**. Only unchanged
UX-860 and UX-201 failed because the local Docker Linux engine was unavailable.
All new database tests executed; none were skipped. This is not a green full
local suite. Both Nginx checks remain enabled for fresh exact-candidate CI.

The preceding issuer candidate passed CI 37797176521 and Gates 37797176560,
including both Nginx checks. That receipt is in
`TOKEN-ISSUER-AUTHORITY-2026-10-08.md`; it does not verify this newer setup change.

## Remaining work and release boundary

The enable route is unchanged. Its later account read can supply newer
role/generation values to the shared issuer after earlier authorization, and
it verifies the pending secret before its activation transaction. The reverse
setup-first/enable-later stale-code interleaving needs its own real regression
and correction. Do not interpret this setup fix or the shared issuer's current
account check as solving that caller-level proof binding.

Enrollment acknowledgement durability, concurrent setup response ordering,
restart/recovery generations, already-committed caller effects, backup-code
consumption, the full account-writer lock graph and cross-tab cookie behavior
remain open. Existing recovery/disable holds are not relaxed. No new visual,
native or browser acceptance is claimed.

No production connection, account mutation, older-session invalidation,
migration, master merge or deployment occurred. The separate production recovery
hold is unchanged. Full migration/image rehearsal, matched frontend artifacts,
authenticated acceptance, backups/rollback, provider correction/resubmission,
Stitch/UX coverage and launch requirements remain separate work.
