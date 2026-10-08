# Phone-code account and session transaction

Date: 2026-10-08. Base: `65d53d60a9e6ab0b9318cea3ed37957628b77d5a`.
Application: onService PH marketplace, existing PR 81. Candidate changes only.

## Findings

OPS-524: phone-code verification committed account creation or successful-login
metadata before storing the refresh session. A refresh-session insert failure
therefore left those earlier changes behind even though sign-in failed.

OPS-525: verification read the account before obtaining its update lock. A
concurrent account-first writer could deactivate the account or promote it to
a privileged role before the login metadata update completed. Sign-in still
returned credentials based on the earlier account snapshot. This is stale
issuance, not proof of unauthorized protected access: canonical request checks
separately enforce active state, role and session generation.

Both failures were reproduced against the unchanged base with real PostgreSQL.
The first regression failed its full unchanged-account assertion; the second
expected a refusal but observed issued credentials. That red run reported
two failing suites / two tests in 1.982 seconds. No production account or code
was used, and returned credentials are excluded from the failure assertion.

## Correction and boundaries

Real OTP verification and consumption still commit first, independently. A
second transaction now locks an existing account, checks its current allowed
role and active state, updates or creates the account, and persists its new
refresh session. All these statements use the same transaction client. Tokens
are returned and successful authentication is logged only after that transaction
commits. Failure rolls back the account/session work without restoring the
consumed code; a retry must use a new valid code.

The account lock precedes refresh-session storage, consistent with the reviewed
account-first refresh/revocation order. Configured development codes pass through
the same account transaction. The SEC-075 privileged-role exclusion and OPS-523
inactive-account boundary remain intact. No schema, dependency, token lifetime,
administrator factor requirement or production policy changes.

## Executed evidence

- `bug-ops-524-phone-sign-in-atomicity.test.ts`: real refresh-insert trigger
  failure, unchanged complete account/session rows, consumed-code rejection,
  and successful new-code retry for customer, provider, provider-staff and new
  customer creation. SMS delivery and the fixture's OTP-policy lookup are
  substituted; OTP hashing, database statements and transactions are real.
- `bug-ops-525-phone-sign-in-account-lock.test.ts`: each marketplace role against
  concurrent deactivation and privileged-role promotion. A real separate SQL
  writer holds the account lock; observed PostgreSQL blocking establishes the
  interleaving. After the writer commits, sign-in refuses with 403, preserves
  the writer's account and existing sessions, and keeps the real code consumed.
- `phone-sign-in-transaction-postgres.test.ts`: the reverse order with sign-in
  first, account-first session revocation, unrelated-account progress, writer
  rollback preserving the original role/generation, and two simultaneous uses
  of one real OTP producing exactly one new session. The revocation writer is
  canonical fixture SQL, not an exercised administrator screen or service.

The first focused selection passed **6 suites / 8 tests in 26.276 seconds**,
including OPS-523, SEC-075 and existing real marketplace sign-in/refresh tests.
The OTP hashing/development-boundary selection passed **3 suites / 13 tests in
2.869 seconds**. The three additional transaction/interleaving tests passed
**1 suite / 3 tests in 1.464 seconds**. API TypeScript and lint of all six
changed/new TypeScript files passed. Existing unit fixtures now supply the
second transactional client; their OTP locking and policy assertions remain.

The complete local API run finished with **1,002 suites / 3,454 tests passed**,
two existing TODOs, and two failed suites/tests in **520.089 seconds**. The only
failures were unchanged UX-860 and UX-201: both require the unavailable local
Docker Linux engine for Nginx. The new PostgreSQL regressions actually executed
and passed; they were not skipped. This is not a green full local suite. Those
Nginx checks remain enabled and need fresh CI alongside the rest of the suite.
The unchanged regression-ID gate passed with 1,606 titled regressions; whitespace
checks also passed. No gate or failure expectation was weakened.

These tests execute guarded, test-owned PostgreSQL 17 schemas on loopback.
They do not represent the complete restored production schema, an external SMS
delivery test, or authenticated browser/native acceptance. Fresh exact-candidate
CI remains required; earlier CI is not proof for these edits.

## Preceding candidate verification

The exact base passed all four jobs in
[CI 37788789344](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37788789344)
and [Gates 37788789503](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37788789503).
Its API log explicitly passed OPS-523, SEC-075 and both Nginx checks: **1,001
suites / 3,451 tests**, with two TODOs, in 45.672 seconds. This resolves OPS-523's
prior CI uncertainty, not deployment. Optional exact release packaging was not
performed for that candidate.

## Remaining work

The lock protects existing accounts, not an absent phone row. Distinct accepted
codes or configured development requests racing first-time registration still
need a defined retry/conflict path; the unique phone constraint prevents two
accounts but is not a completed user-experience contract. Other token issuers
(`createTokenPair` and its callers), phone-identity changes, device/logout,
recovery/staff/profile writers and the wider lock graph remain under review.

No historical metadata repair, existing privileged-session invalidation,
server connection, live data write, migration, master merge or deployment was
performed. The separate production recovery hold remains unchanged. Full
migration/image rehearsal, matched frontend artifacts, authenticated acceptance,
backups/rollback, provider correction/resubmission, broader UX and launch
requirements are not completed by these auth changes.
