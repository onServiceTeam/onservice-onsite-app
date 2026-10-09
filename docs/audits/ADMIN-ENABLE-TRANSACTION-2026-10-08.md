# Administrator enrollment completion proof binding

Date: 2026-10-08. Base: `05c6ebf89f7d5b6c89fe62fa9d44dc8c1e0d4fae`.
Application: onService PH marketplace, existing PR 81. Candidate only, not deployed.
Scope: `POST /auth/admin/2fa/enable`. Initial setup was corrected separately.

## Reproduced findings

OPS-529: completion trusted middleware authorization obtained before activation,
then re-read account authority for credential issuance. Against unchanged base
code, a request paused after authorization received HTTP 200 after the account's
session generation was incremented, instead of the expected 401. Supplying the
new generation to the shared issuer hid the earlier proof's revocation.

OPS-530: completion verified the pending authenticator key before beginning the
activation transaction. The actual setup route could replace that key while
completion waited. The old code still received HTTP 200 instead of the expected
400. The regression explicitly verifies that the code is not valid for the
replacement key before resuming. Both baseline tests failed in 1.774 seconds.
Their first failing assertions establish accepted responses, not a separately
executed protected-route bypass. Only synthetic local accounts were involved.

## Correction and limits

Completion now locks the account with `FOR NO KEY UPDATE`, before recovery-code
rows. Under that lock it requires active state and exactly the earlier authorized
role/session generation, then checks enabled state and verifies the current key.
Normal access rechecks mandatory password rotation; the dedicated setup token
keeps its existing rotation exception. A changed or missing account receives
401, mandatory rotation receives 428, already-enabled state receives 409 and an
invalid current code receives 400.

Activation and the eight recovery codes still commit together. Forced-enrollment
login metadata now belongs to that same transaction. The profile returned from
the locked read supplies the original role/generation to subsequent issuance;
there is no later read that upgrades the proof. Issuance independently refuses
any intervening revocation. Existing response fields, cookie-only credentials,
clock-drift tolerance, token lifetimes, dependencies and factor policy remain.
There is no migration or change to the held recovery/disable operations.

Activation, subsequent refresh-session storage, CSRF storage and HTTP delivery
are still separate boundaries. A test deliberately revokes authority after
activation commits and proves that no credentials are issued, while also proving
that the factor and recovery codes remain committed. This is not durable
recovery-code acknowledgement or successful delivery. The approved server-owned
enrollment generation/acknowledgement and interrupted-response recovery work
remains required, including the existing-account rollout and browser integration.

## Executed verification

- `bug-ops-529-admin-enable-current-authority.test.ts` executes 27 combinations
  across admin, super-admin and DPO, using setup or access tokens. Changed
  generation, role, activity, missing account and applicable password rotation
  deny completion without modifying account, audit, recovery, refresh or CSRF rows.
- `bug-ops-530-admin-enable-current-factor.test.ts` exercises actual setup and
  enable in both token modes for all three roles. Stale-key rejection preserves
  the replacement pending key and its setup audit and creates no recovery set
  or session. Rare six-digit collisions select another real setup-generated key;
  authenticator verification is not mocked.
- `admin-enable-transaction-postgres.test.ts` executes five supporting tests:
  six eligible role/token paths with actual signed cookies and consumption of
  a returned recovery code; account-writer commit/rollback with observed database
  blocking; enable-first contention with actual setup/enable requests and
  unrelated-account progress; six post-commit revocation cases; and actual
  recovery/audit insert failures with rollback and retry. Revocation writers are
  fixture SQL, not exercised operator screens.
- The existing CRIT-N11 cookie-only test supplies the new locked account read.
  Its response/cookie and forced-rotation assertions remain. Initial setup,
  backup-login, setup-token, database-error and disable-hold checks still execute.

The focused selection passed **4 suites / 8 tests in 10.871 seconds**. The full
local API run passed **1,010 suites / 3,472 tests**, with two existing TODOs and
**two failed suites/tests**, in **318.530 seconds**. Only unchanged UX-860 and
UX-201 failed because the local Docker Linux engine was unavailable. All new
database tests executed; none were skipped. This is not a green full local run.

After test-only cleanup replaced a cookie-header double cast with a real type
guard and simplified a promise type, the final selection passed **13 suites /
23 tests in 23.526 seconds**. API TypeScript and lint of all six changed/new
TypeScript files were rerun successfully. The unchanged **1,611-ID gate** and
whitespace checks passed. Fresh exact-candidate CI remains required.

The real database evidence uses guarded, test-owned PostgreSQL 17 schemas on
loopback, not a complete production restoration. Scheduling hooks pause actual
SQL or transaction completion without fabricating results. Rate-limit storage,
security-event services and logging are isolated test dependencies. This is not
new browser/native acceptance or a complete authentication/lock-graph audit.

## Preceding candidate and remaining work

Exact initial-setup candidate `05c6ebf8` passed all four jobs in CI 37800735318
and Gates 37800735101. Its API job explicitly passed OPS-527/528, their supporting
transactions, MED-N82 and both Nginx checks: 1,009 suites / 3,467 tests, two TODOs,
60.626 seconds. The receipt is in `ADMIN-SETUP-TRANSACTION-2026-10-08.md` and does
not verify this newer completion change. Optional release packaging was not
requested.

Remaining work includes durable recovery acknowledgement/restart, setup response
ordering, earlier privileged sessions, backup-code consumption and other issuer
callers, the wider account-writer graph, cookie/cross-tab behavior, provider
correction/resubmission, privacy/export and role-specific Stitch/UX/linkage work.
The login page's existing recovery-code checkbox is still browser-local; its
source and test were inspected, not changed or newly rendered in this slice.

No production connection, account mutation, older-session invalidation, master
merge or deployment occurred. The separate production recovery hold remains.
Exact-image/full-migration restoration, matched frontend/API artifacts,
authenticated acceptance, backup/rollback and all launch requirements still gate
release. Engineering approval is not production, payment or legal sign-off.

## Independent CI verification

Exact candidate `be6fea61dd4d457648161eb47aa5f2dff3873553` passed all four jobs
in CI `37804191578` and Gates `37804191579`. API job `113404032661` explicitly
passed OPS-529/530, `admin-enable-transaction-postgres.test.ts`, CRIT-N11 and
both previously Docker-unavailable Nginx tests, UX-860 and UX-201. The API result
was 1,012 suites / 3,474 passing tests, with two existing TODOs, in 48.614 seconds.
Admin, mobile and API Docker build/liveness jobs also succeeded. Optional exact
release packaging was skipped. This resolves the candidate CI uncertainty,
not durable recovery acknowledgement, deployment or the remaining release gates.
