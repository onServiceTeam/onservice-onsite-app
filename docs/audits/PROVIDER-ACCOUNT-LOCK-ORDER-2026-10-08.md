# Provider review and moderation lock order

Date: 2026-10-08. Base: `0a186b1d0aafe046179b1f73f09916e2f5b0f434`.
Application: onService PH marketplace, existing PR 81. This slice fixes the
owner/provider lock inversion in four admin lifecycle operations. It does not
enable correction/resubmission, change retention policy or authorize deployment.

## Completed CI for the preceding checkpoint

[CI run 37772436216](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37772436216)
completed successfully for exact base `0a186b1d`. Its completed logs confirm:

- API: 992 suites and 3,436 tests passed, with two TODOs. All six OPS-512 through
  OPS-517 database regressions passed. Docker-dependent nginx UX-860 and UX-201
  also passed, resolving the preceding local environment-only failures in CI.
- Admin: 597 files and 705 tests passed, one skipped file and three TODOs.
  Type checking and production build passed. React `act` warnings remain in
  some existing tests; successful exit is not a claim of warning-free tests.
- Mobile: 595 suites and 879 tests passed, with 84 TODOs. Type checking and the
  customer/provider web export passed.
- API Docker build and liveness passed. Optional exact API/admin release
  packaging was skipped; no paired release artifact acceptance is inferred.

[Gates run 37772436346](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37772436346)
also passed. Advisory/report-only visual and mutation jobs do not establish
native/Stitch acceptance. These receipts apply to the base, not the lock-order
changes below, which require their own subsequent CI.

## Failure and correction

Draft and initial submission lock the owner account before the provider.
Approval, rejection, suspension and reactivation previously reached the
provider first, then its account. An owner-first writer could therefore wait
for a provider retained by a review that was itself waiting for that owner.

OPS-518 reproduced this on real PostgreSQL before the fix: while approval was
observably blocked by an owner lock, the owner-holding transaction could not
take the provider with `FOR UPDATE NOWAIT`. OPS-520 independently reproduced
the same inversion in suspension before extending the correction. Both failed
with the actual provider-row lock error, not a source-text assertion. These
tests deliberately use NOWAIT rather than waiting for PostgreSQL to terminate
a deadlock; they demonstrate the inversion, not a production incident.

One helper now acquires the account with `FOR NO KEY UPDATE`, then the provider
with `FOR UPDATE`, at the start of each of those four transactions. The first
query locks only the account, not the provider read by its scalar subquery.
The account lock serializes role/activation/fraud changes while remaining
compatible with foreign-key key-share checks; these operations do not change
account IDs. Ownership is rechecked after acquiring the provider lock. Drift
returns a conflict without chasing a different account lock or writing a
decision. Missing records remain not-found errors.

The original validation and atomic writes remain: pending status, exact latest
revision, KYC completeness and drift, eligible account roles, prior admission
for reactivation, audit and inbox records, session invalidation on suspension,
and in-flight booking holds. Reactivation does not clear those holds or change
historical amounts. No new migration or dependency is required by this slice.

## Executed verification for this slice

- OPS-518 now passes for approval and rejection, including legacy role repair.
  The blocked review holds no provider lock, waits for the owner-first writer,
  then refuses its committed deactivated application without decision/audit/
  notification writes or a role change.
- OPS-519 passes both decision paths against concurrent legacy ownership drift,
  returning the explicit owner conflict with no writes. Its first draft used a
  preserved submission and correctly failed at migration 173's existing owner
  foreign key. The test was corrected to the unprotected legacy case; that
  database constraint was not weakened. This is a defensive ownership check,
  not evidence of an owner-transfer API or a bypass of preserved submissions.
- OPS-520 now passes suspension and reactivation with observed database waits.
  It checks exact status, session generation, refresh-token removal, original
  admission decision, reasoned audit and notice, active escrow remaining held,
  and historical bookings remaining unchanged.
- Existing OPS-479/480/481, OPS-512 through OPS-517 and other provider tests
  passed, preserving evidence, eligibility, concurrent revision/decision,
  rollback, privacy and admission checks. OPS-514 still inserts a synthetic
  next revision, including its owner foreign key, while review waits on the
  provider. A real resubmission endpoint remains unimplemented.
- Final `jest --runInBand --testPathPatterns='provider|med-n71-n91-n113-n118'`:
  **142 suites / 310 tests passed**, 32.964 seconds, using an identity-checked
  loopback synthetic PostgreSQL 17 database. This is a focused selection, not
  a full suite or full production-schema rehearsal.
- API TypeScript, lint on all changed/new TypeScript, whitespace checking and
  the unchanged unique-regression-ID gate passed, now 1,600 titled regressions.
  Existing narrow mock fixtures only gained the new lock-read responses; their
  original role, audit, notice and hold assertions remain. Actual concurrency
  evidence comes from PostgreSQL, not those mocks.

## Remaining work and release boundaries

This standardizes the four admin lifecycle operations, not the entire database
lock graph. Account erasure currently deletes refresh tokens before updating
the account and later the provider. Session revocation uses account then token
writes; token rotation locks its token first and later reads the account and
inserts a replacement. Those interactions and other provider profile/recovery
writers still need bounded, real concurrency verification before a global
ordering claim or same-provider correction/resubmission release. Existing
erasure comments about deleting tokens first do not prove pre-commit visibility.

Do not treat this as completion of E35/E74, E21/E43, E67/E68 or E79. Governed
legacy admission, decision data-rights/export classification, actual retained
object bytes, reviewer assignment, correction and resubmission remain open.
No UI/Stitch/native acceptance was repeated for this backend-only change.

Review the accumulated topic-branch changes, require fresh CI for this commit,
rehearse the selected image and complete migration chain through 174 on an
isolated restored database, verify matched API/admin/customer-provider builds
and authenticated journeys, and confirm backup/rollback before promotion.
No production connection, migration, financial action, merge, branch-protection
change or gate weakening occurred in this slice.
