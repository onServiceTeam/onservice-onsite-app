# Admin password rehash concurrency

Date: 2026-09-06, Asia/Singapore. Baseline
`860c834145ecb5b933e5521a96f7110d925b0015`. Candidate correction, not deployed.

## Finding and selected correction

Admin login verifies the stored password, then upgrades a legacy or weaker
scrypt hash as a best-effort operation. The former UPDATE was conditional only
on user ID. If a real password replacement commits while that upgrade waits
for the account row lock, the later unconditional upgrade can store a hash of
the old password over the newly selected password. This was discovered from
source review, not a live-account experiment or reported production incident.

The correction makes the upgrade conditional on the exact stored hash that the
request verified. A newer password choice or another completed upgrade wins.
It does not lock the whole login/second-factor exchange or change password
policy, session issuance, required rotation, 2FA, migrations or dependencies.
The existing password replacement transaction and its audit remain unchanged.
This is a contained integrity correction under Ken's delegated engineering
approval, not approval to remove the recovery/security launch holds.

The database reasoning is specific: PostgreSQL Read Committed re-evaluates an
UPDATE's predicate after a concurrent row writer commits, and can proceed on
the original row after that writer rolls back. This lets the comparison reject
a committed replacement while still allowing a legitimate upgrade following
rollback. See [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED).

## Executable coverage, not yet database-executed at this checkpoint

`bug-sec-072-admin-rehash-preserves-new-password.test.ts` contains one numbered
regression with six interleavings: admin, super admin and DPO, each with legacy
and weaker-cost hashes. It uses actual auth/security Express routers, route
validation/authentication, password crypto, SQL transactions and JWT/cookie
issuance. The actual password replacement SELECT holds the row lock while an
older login starts. PostgreSQL `pg_stat_activity` must report the actual rehash
UPDATE waiting for a lock before the test releases the password transaction.

Assertions check the saved new password, rejected old password, generation,
rotation flag, exact audit details and revocation counts, retained replacement
refresh/CSRF records, replacement-cookie access, rejection of old access/refresh,
and rejection of stale pre-auth authority before factor verification. No live
TOTP secret is needed or decrypted. The socket-disconnect call is mocked, not
an actual realtime-client acceptance check.

`admin-password-rehash-postgres.test.ts` adds five supporting tests:

1. Four normal upgrades, crossing both hash formats with enrolled/unenrolled
   TOTP, preserve required rotation and demand the appropriate factor step.
2. Incorrect passwords and already-current hashes preserve stored credentials.
3. Two real logins reach the upgrade concurrently. After the first completes,
   PostgreSQL must report affected rows `[1, 0]`; the second cannot overwrite it.
4. A real PostgreSQL trigger rejects an upgrade. Best-effort login preserves
   the original password and still requires the second factor.
5. A real trigger rejects the password audit, forcing rollback while a login
   waits. Prior refresh/CSRF records and account generation remain unchanged,
   old access still works, and the waiting legitimate hash upgrade succeeds.

Scheduling wrappers pause real query results or delay real statements; they do
not implement SQL semantics. All queries, commits, rollbacks and final reads
execute in PostgreSQL. The fixture is a small test-owned auth schema, not the
complete migration chain. Only `NODE_ENV=test` and localhost/127.0.0.1 URLs
whose database names end in `_test` are accepted. CI fails at collection if
that isolated target is unavailable in configuration; local runs skip without
it. Only the random schema created by that test is dropped on cleanup.

These tests do not mount the complete API bootstrap. The numbered regression
enters password replacement with a real session cookie and stored CSRF token;
the actual auth middleware validates both. It then parses the actual replacement
cookies on `/auth/me`. The supporting rollback case uses a real bearer token.
Full-browser CSRF, cookie expiry/order, cross-tab behavior, external login telemetry, abuse-rate
enforcement and live sockets are not certified by this fixture. Redis and
external telemetry use the existing test mocks. All identities and passwords
are clearly synthetic.

## Actual local results

- API TypeScript and changed-file ESLint: exit 0.
- Focused Jest: **8 suites / 26 tests passed**, **2 suites / 6 database tests
  skipped**, **9.264 seconds**. Includes legacy rehash, LL12 rotation,
  SEC-036/039/042/045, UX-558/562 and compilation of both new files.
- Unchanged regression-ID gate: **1,569 titled regressions**, passed.
- Earlier collection of SEC-072 alone: one test skipped, 3.593 seconds. This
  was not a failing baseline, reproduction or passing database test.

Local PostgreSQL is unavailable and Docker Desktop's configured engine is not
running. No unrelated Docker applications were started, and no remote/live
database was used. **Fresh CI must actually execute the six database tests
before this candidate is claimed database-verified.** A source-derived defect
and an executable test are not an executed red/green result. No gate, test
assertion, timeout configuration or lint rule was weakened.

## Release and continuation boundaries

The preceding logout checkpoint has independently passed every CI job and the
gates; that result does not verify this newer SQL change. Publication stays on
the existing risky-review branch and PR 81, not master. There is no deployment,
live password change, migration, production repair or security-hold removal.

E79 still requires coherent per-session/cookie/cross-tab and refresh behavior,
not just in-memory ownership. Provider application revisions/resubmission and
privacy, remaining matching/assignment checks, all-role Stitch and usability
acceptance, migration-172 rehearsal, safe paired publishing, fresh live client
accounts, native baselines and external sign-offs remain separate unfinished
work. Local review candidate, master and production are not aligned.
