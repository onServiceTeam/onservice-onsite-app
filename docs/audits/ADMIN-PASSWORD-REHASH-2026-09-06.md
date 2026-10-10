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

## Independent database execution

Published candidate `806892aad5a2dd5407cd6836b3d7b6ff92602912` triggered
CI `34015709677` and Gates `34015709675`. Gates passed. Actual API job
`101438972334` logs record the five supporting PostgreSQL tests passing at
`06:10:10.7663268Z` (7.193 seconds) and SEC-072 passing at
`06:10:30.8710292Z` (12.194 seconds). All **967 API suites / 3,335 tests**
passed at `06:11:47.5438206Z`, **115.3 seconds** total. The six database
tests executed, not skipped. This resolves their initial database-execution
uncertainty; no executed failing old-runtime baseline is claimed.

The final local cookie/CSRF-strengthened focused rerun also passed **8 suites /
26 tests**, with **2 suites / 6 database skips**, in **9.797 seconds**. Lint
and diff checks passed afterward. Earlier local timings above are retained.

Mobile and Docker jobs have succeeded; Admin and full-run completion were
still pending when this update was written. Same-run API/source and browser
rehearsal artifacts identify CI merge source
`7f97b4a9c9f2fc038705162268cad75ef0274657`, not topic HEAD or master.
They must not be relabeled as either. Artifact receipt, exact-image migration
rehearsal, paired publishing and authenticated live acceptance remain separate.

## Final CI and artifact receipt

All four jobs in CI `34015709677` completed successfully. Admin job
`101438972297` passed **590 files / 697 tests**, with one skipped file /
three TODOs, at `06:20:14.3360134Z`. It explicitly repeated UX-1373 and the
five logout-ownership tests. Mobile job `101438972266` passed **594 suites /
878 tests**, with **84 TODOs**, at `06:10:47.1833059Z` (94.734 seconds).
Docker job `101439392915` built, boot-checked and retained the requested image.
This resolves the preceding full-run uncertainty, not launch or deployment.

Matching API/source, Admin and customer/provider artifacts were downloaded to
a new private temporary directory, preserving previous builds. Their metadata
all identify merge source `7f97b4a9c9f2fc038705162268cad75ef0274657`; both
frontend origins are the appropriate onservice.ph hosts, demo mode is false,
and all three metadata files retain `deploymentEligible: false`.

The API package's three SHA-256 manifest entries were independently checked
after download: `api-image.tar.gz`, `onservice-source.bundle` and
`api-candidate.json`. `git bundle verify` succeeded, reporting complete history;
its HEAD matches the recorded merge source. This is receipt/integrity evidence,
not a local Docker load, a database rehearsal or an authenticated browser test.
The temporary `release-candidate` PR label was removed after the successful
run so ordinary later changes do not retain large image archives.

No source or artifact was relabeled as master. Migration 172, exact running
image, shared-server resource isolation, frontend/API overlap and recovery
still require their separate release checks. No SSH or live mutation occurred.

## Later read-only release preflight

After artifact receipt, a read-only SSH preflight confirmed the correct
marketplace origin and clean tracked server checkout at
`7ed367cdca1e277f03fc08ff5bbb03b0dc142bd5`. GitHub master remains
`738641095d3ae1dcbba14c5803b96cf63ae93ee8`; PR 81 still identified the
verified `806892aa` candidate. These are not aligned. The exact marketplace
API container returned `ready` with PostgreSQL and Redis `ok` at
`2026-09-06T06:35:03.206Z`. This does not identify the bytes of either live
frontend or prove authenticated customer/provider/admin journeys.

The first Git read stopped at the root-owned checkout's ownership guard.
After verifying ownership and the resolved directory, a command-scoped
exception for that exact checkout allowed the read. No global Git setting,
service, account, live record, checkout, migration or neighboring app changed.
Connection details, image identity and resource inventory remain private.

Received frontend metadata, demo flags and deployment-ineligible flags were
independently checked; no extracted reparse points were found and both actual
entrypoints were nonempty. Receipt inventory: Admin **61 files**, entry SHA-256
`3ef6043983cf0a879ba715bb9b7dba51655604dcbfda90aa398a79a249bfb97b`;
customer/provider **23 files**, entry SHA-256
`baac0b8c981ee38ebb8eb256e717d4e9361f925de7747229e997f0b429afd8d0`.
These are local receipt hashes, not live-server or fresh browser acceptance.
