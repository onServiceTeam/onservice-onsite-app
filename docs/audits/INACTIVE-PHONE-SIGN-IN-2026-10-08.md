# Deactivated account sign-in history

Date: 2026-10-08. Base: `d1641c4daec3fce4b12818994b673eb82f34c3ef`.
Application: onService PH marketplace, existing PR 81.

## Finding and correction

A valid phone-code attempt for a deactivated marketplace account returned HTTP
403 without credentials, but first set `is_verified` to true and replaced
`last_login_at` and `updated_at`. Support could therefore see a new successful
login time on an account whose sign-in was refused. This is a reproduced
metadata defect, not a demonstrated unauthorized session or production incident.

OPS-523 checks the existing account's active state before those writes. It
retains the privileged-role check, the existing deactivation response, and
consumption of a valid one-time code. No account is reactivated, no existing
session is removed, and no historical metadata is repaired. The later active
check also remains for the newly created account path.

## Executed evidence

The named regression uses the real HTTP router, authentication service, OTP
hashing/consumption and PostgreSQL account/session storage. It stubs external
SMS and abuse telemetry; it does not send a real text message. The original
code failed the unchanged-account assertion in 30.139 seconds: verification
and both timestamps changed despite the 403 response.

After the correction, all six combinations of customer/provider/provider-staff
and real/development code pass. Assertions cover the full unchanged account
and refresh-session rows, no returned credentials or cookies, consumed real
codes, failed-attempt telemetry and no successful-device registration.

The selected auth run passed **7 suites / 19 tests** in 25.028 seconds,
including SEC-075, real active-marketplace sign-in/refresh, approved-provider
fresh sign-in, OTP hashing/reuse and configured development-code boundaries.
API TypeScript, changed-file lint, whitespace and the unchanged regression-ID
gate passed (1,604 titled regressions). No test or gate was weakened.

These fixtures use a guarded loopback PostgreSQL 17 test-owned schema, not a
restored production schema. The complete suites were not rerun locally for
this six-line service change. Fresh exact-candidate CI remains required;
successful base checks below are not evidence for the new commit.

## Preceding checkpoint

Base `d1641c4d` passed all four jobs in
[CI 37784763822](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37784763822)
and [Gates 37784763909](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37784763909).
Its API job passed 1,000 suites / 3,450 tests with two TODOs, including SEC-075
and both previously Docker-unavailable Nginx checks. Admin passed 705 tests;
mobile passed 879 tests. Optional exact release packaging was skipped. This
resolves the preceding correction's CI uncertainty, not its deployment or
previously issued privileged-session treatment.

## Remaining work

This pre-write check does not serialize account changes with credential
issuance. `verifyOtp` still reads the account and performs its metadata and
refresh-session writes separately. A later persistence failure can therefore
leave earlier metadata committed; concurrent role, active-state and session
generation changes require their own real interleaving tests. `createTokenPair`
and the wider issuer lifecycle also remain open. Canonical request checks are
unchanged; stale issuance is not established here as an authorization bypass.

No server connection, live data change, migration, deployment, master merge,
branch-protection change or launch approval occurred in this slice. The
separate production recovery hold and full migration/image, paired-artifact,
authenticated acceptance and rollback requirements remain in force.
