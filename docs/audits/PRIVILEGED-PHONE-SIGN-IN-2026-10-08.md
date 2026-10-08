# Privileged account phone sign-in boundary

Date: 2026-10-08. Base: `54b275f0a6b1e82e359016f717101831fc1d3e0d`.
Application: onService PH marketplace, existing PR 81.

## Finding and scope

The shared phone-code service issued credentials using the account's stored
role without excluding privileged accounts. A synthetic PostgreSQL/HTTP
reproduction obtained administrator authority without the separate password
and authenticator flow. This contradicts the existing security contract, not
a new authentication policy choice. There is no evidence here of live abuse;
no production account, phone code or server was accessed for this test.

SEC-075 permits this sign-in method only for customer, provider and provider
staff accounts. Administrator, super-administrator, DPO and unknown roles
are refused after code verification but before account metadata or session
credentials change. Valid denied codes remain consumed. Incorrect codes keep
their existing attempt limits and do not expose the privileged-role error.
Configured development codes obey the same role boundary. First-time customer
registration and the dedicated administrator sign-in flow are unchanged.

This is a candidate fix, **not a production containment claim**. It blocks
new issuance through this path; it does not revoke previously issued sessions.
The account read and credential writes still require their own concurrency
review. Canonical role/generation checks are not weakened or automatically
upgraded, and no migration, dependency, recovery hold or money policy changes.

## Reproduction and executed checks

- The new named SEC-075 regression failed against the original service:
  an enrolled synthetic administrator received HTTP 200 instead of 403
  (3.708 seconds). A temporary diagnostic run also verified that the resulting
  signed administrator credential was accepted by the real protected identity
  route, before the same expected-403 assertion failed (1.771 seconds). That
  diagnostic conditional was removed from the final regression. No credential
  was printed or sent to a live service.
- The corrected regression uses the real auth router/service and PostgreSQL
  for all three privileged roles, both enrolled and not enrolled. It verifies
  denial, no returned credentials/cookies, no new refresh records, unchanged
  account rows, consumed codes and a recorded failed rather than successful
  sign-in attempt. External SMS, abuse services and Redis are test doubles.
- Supporting PostgreSQL tests preserve actual one-use sign-in and refresh for
  all three marketplace roles, stored session generation and device binding;
  verify incorrect-code attempt accounting; and reject privileged/unknown
  roles with the explicitly configured development code.
- The focused auth selection passed **12 suites / 20 tests** in 30.019 seconds,
  including the approved-provider fresh-sign-in regression, existing OTP
  hashing/reuse checks and administrator cookie/two-factor tests.
- API TypeScript and changed/new TypeScript lint passed. The unchanged
  unique-regression-ID gate passed with **1,603 titled regressions**; whitespace
  checks passed.
- The complete local API run passed **998 suites / 3,448 tests**, with two
  existing TODOs and two failed suites/tests in 477.867 seconds. Only UX-860
  and UX-201 failed, both because the local Docker Desktop Linux engine was
  unavailable. The four new PostgreSQL tests executed. This is **not a green
  full local suite**. Fresh candidate CI must execute the unchanged Docker
  checks too; the base's successful CI is not this fix's CI.

Database fixtures use a guarded loopback test-owned schema with UUID foreign
keys, not a complete migrated/restored production database. The unknown-role
test deliberately exercises a text-role fixture for fail-closed future behavior;
it does not claim that production currently admits that value. No existing
tests or gates were skipped or relaxed to make this correction pass.

## Preceding checkpoint receipt

Exact base `54b275f0` passed all four jobs in
[CI 37781347237](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37781347237)
and [Gates 37781347354](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37781347354).
The API log explicitly passed OPS-521, OPS-522, their supporting account-session
tests and both Docker-dependent Nginx checks: **998 suites / 3,446 tests passed**,
with two TODOs. Mobile passed **595 suites / 879 tests**, with 84 TODOs, and
exported its web bundle. Admin passed its build/type/test job with 597 passing
files and one skipped file. Docker build/liveness passed. Optional exact API
and admin candidate packaging was skipped. This resolves the preceding local
Docker uncertainty, not release acceptance or the new finding.

## Release and continuation requirements

1. Require the exact published correction's CI, including executed PostgreSQL
   regressions and unchanged Nginx tests. Inspect the accumulated PR before
   promotion. Do not release all topic work solely to close this one defect.
2. Privately verify the actual running marketplace source/image and privileged
   sign-in configuration. Do not test a bypass against real users. Determine a
   bounded containment release from that verified state and retain rollback
   that does not restore this defect. Shared services must remain untouched.
3. Review existing privileged sessions and sign-in evidence privately. A
   prospective guard cannot establish whether an older session used the
   required factors. Plan any account-generation/session invalidation with
   verified operator recovery and an audited, scoped process, not an unreviewed
   blanket account change. Do not infer an incident or its absence from these
   synthetic results, and do not claim old sessions are already remediated.
4. Follow the existing exact-image, isolated-restoration, migration-through-174,
   matched frontend/API, backup/rollback and authenticated acceptance process
   if promoting the accumulated candidate. Previous through-172 restoration
   evidence does not cover that release.
5. Continue issuer/account concurrency, E79 cookie/cross-tab boundaries,
   governed recovery, provider revisions/resubmission, decision privacy,
   durable dispute delivery and the remaining role-specific UX/linkage audits.

No production connection, deployment, live session revocation, master merge,
branch-protection change or launch approval occurred in this slice.

## Independent CI verification

Published candidate `d1641c4daec3fce4b12818994b673eb82f34c3ef` subsequently
passed all four jobs in
[CI 37784763822](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37784763822)
and [Gates 37784763909](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37784763909).
The actual API log passes SEC-075, the supporting OTP PostgreSQL tests and both
Nginx checks: 1,000 suites / 3,450 tests, with two TODOs. Admin passes 705 tests
and mobile passes 879 tests. Optional exact release packaging was skipped.
The fresh-CI requirement is resolved for that candidate, not deployment,
existing privileged-session treatment or the broader issuer review.

The subsequent inactive-account metadata correction is tracked separately in
`INACTIVE-PHONE-SIGN-IN-2026-10-08.md`. It does not complete issuer concurrency.
