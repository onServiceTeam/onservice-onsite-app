# Account session renewal and partial anonymization lock order

Date: 2026-10-08. Base: `8f5f2dfd98d382e7ee40e71f4376e26cadc516ff`.
Application: onService PH marketplace, existing PR 81. This candidate fixes
two account/token lock inversions. It changes neither deletion eligibility
policy nor retained-data scope, and does not enable provider resubmission.

## Preceding checkpoint verification

[CI 37776247900](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37776247900)
completed successfully for exact base `8f5f2dfd`, including all four jobs.
Actual API logs show 995 passing suites and 3,439 passing tests, with two TODOs.
OPS-518/519/520 and both Docker-dependent Nginx checks explicitly passed.
Admin passed its type/build/test job with 597 passing files and one skipped
file. Mobile passed 595 suites / 879 tests with 84 TODOs and exported its web
bundle. The API image built and served liveness. Optional exact API/admin
release packaging was skipped, so this is not paired-release acceptance.
[Gates 37776247781](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37776247781)
also passed. Advisory visual/mutation results are not full Stitch/native proof.
These receipts apply to the base, not the new changes below.

## Reproduced failures and correction

Refresh rotation locked the old token before reading the account and inserting
its replacement. Partial anonymization deleted tokens before updating the
account. An account-first writer could therefore need a token retained by a
transaction waiting on that writer's account lock. OPS-521 and OPS-522 each
failed against the unchanged services in actual PostgreSQL: after observing
the account wait, the account-holding transaction could not acquire the old
token using `FOR UPDATE NOWAIT`. These tests prove lock inversion, not a live
incident or a measured deadlock rate.

Both paths now acquire the account with `FOR NO KEY UPDATE` before any refresh
token lock/write. They retain their existing transaction and original account,
token, role/session-version and cascade checks. A missing account fails closed.
The weaker-than-`FOR UPDATE` row lock is deliberate: rotation's separate
security-event insert needs a compatible account foreign-key key-share lock.
Real database tests exercise that insert in observe and strict fingerprint modes.

Revocation and partial anonymization become visible together at commit. The old
comment claiming the first uncommitted token deletion revoked sessions before
other changes was incorrect and is corrected. No new table, migration,
dependency, session duration, security hold or production setting is introduced.
Only test fixtures use injected database failures and scheduling hooks.

## Executed verification

- Before the fix, both new PostgreSQL regressions failed on the actual token
  row lock, in 1.962 seconds. Afterward, seven selected suites / 24 tests passed
  in 5.635 seconds, including the existing fingerprint, atomicity, retry and
  eligibility fixtures.
- OPS-521 exercises all six account roles. A waiting rotation retains no old
  token lock and rejects the committed session-generation change without
  creating a replacement credential.
- OPS-522 exercises the actual cooling-off worker and provider cascade after
  an owner-first revocation fixture. It verifies account/provider deactivation,
  token/contact cleanup, redacted text, completed request, and an unchanged
  completed booking amount. It does not execute real admin revocation UI.
- Five supporting PostgreSQL tests cover one-winner duplicate rotation,
  replacement-insert rollback, the real separate fingerprint audit insert,
  both renewal/anonymization orderings, and cascade-failure rollback/retry.
  The seven database tests passed together in 4.069 seconds.
- API TypeScript, changed/new TypeScript lint, whitespace checks and the
  unchanged unique-ID gate passed (1,602 titled regressions).

- Complete local API run: **996 suites / 3,444 tests passed**, two existing
  TODOs, and two failed suites/tests in 394.343 seconds. Only UX-860 and UX-201
  failed because the Docker Desktop Linux engine was unavailable. Their tests
  are unchanged. This is **not a green full local suite**; fresh CI must execute
  them and the new database tests. All seven new database tests executed locally.

Focused fixtures use real services/transactions and UUID foreign keys in a guarded
loopback test-owned schema, not a restored production schema or full migration
chain. They do not make every existing SQL-mock/source-only test behavioral.

## Remaining work and release boundary

Account-deletion eligibility still runs outside the anonymization transaction;
its request claim and completion marker are separate writes. This slice does
not prove race-free booking/dispute/balance eligibility, an exclusive worker
lease, or atomic request completion. DSR linkage, approved retention/erasure
manifests, preserved provider decisions/revisions, physical uploads and backup
treatment remain open. No additional data class is deleted by this change.

Other issuance paths (`verifyOtp`, `createTokenPair`), logout/device revocation,
profile/staff/recovery writers, cross-tab cookies and multi-instance sockets
still require their own concurrency review. This is not a global lock-graph
fix or full session-lifecycle acceptance. Provider correction/resubmission,
governed legacy admission and decision export/privacy classification remain
unfinished. Existing external-payment and legal holds remain in force.

Before promotion, review the accumulated topic changes, require fresh CI,
rehearse the selected image and complete migrations through 174 against an
isolated restoration, verify matched API/admin/customer-provider artifacts and
authenticated journeys, and confirm backups/rollback. No master merge,
production connection, deployment, gate weakening or branch-protection change
occurred in this slice.

## Independent CI verification and next finding

Published source commit `c9b042562a637d70b6965e0942834af4990886e6` and the
documentation-only follow-up `54b275f0a6b1e82e359016f717101831fc1d3e0d` were
subsequently verified at the latter exact head. CI `37781347237` and Gates
`37781347354` completed successfully. Actual API logs explicitly pass OPS-521,
OPS-522, supporting account-session tests and both Nginx checks: 998 suites /
3,446 tests pass, with two TODOs. All four CI jobs succeeded; optional exact
API/admin candidate packaging was skipped. This resolves fresh-CI uncertainty
for these lock corrections, not release acceptance.

The subsequent issuer review reproduced a distinct privileged phone-sign-in
bypass. Its candidate containment and remaining existing-session/release work
are recorded in `PRIVILEGED-PHONE-SIGN-IN-2026-10-08.md`. Do not treat the green
lock-order run as evidence for that later change or the entire login lifecycle.
