# Behavioral smoke-test repair

Date: 2026-09-06, Asia/Singapore. Base: `2f2f95bef228bb7f043248e37432d2428ac88297`.
Test/documentation-only work on the existing review branch. No application
runtime, money rule, migration, dependency, gate, live account or server change.

## Finding and scope

The complete legacy `packages/api/__tests__/smoke.test.ts` had four checks that
could pass without executing the behavior their names implied. Three searched
source strings. The fourth constructed its own payout as the captured amount
minus the other allocations, then added them back. That tautology did not call
any application money code. These were test-quality findings, not evidence of
a new production incident. No failing old-runtime baseline is claimed.

| Old assertion | Replacement and explicit limit |
| --- | --- |
| `/health` text appears in `server.ts` | `server-health-smoke.test.ts` imports the actual server app and makes HTTP requests to its mounted liveness/readiness handlers. PostgreSQL/Redis success and independent/together failure branches are asserted. Only the production listener/startup callback, background services and external IO are suppressed; this is not real dependency readiness or a container boot test. |
| Admin-named files mention an auth guard | `admin-access-smoke.test.ts` runs actual signed JWTs, cookie parsing, canonical authentication, permission middleware and route handlers for Projects, privacy DSR list and Staff role profiles. The earlier staff self-service router sharing the prefix is retained. Account reads and downstream list services are mocked. All six roles are tested with Bearer and cookie credentials, plus anonymous, malformed, expired, temporary/refresh, revoked/deactivated, mandatory-password and conflicting-credential cases. Full route/method/ownership/write-CSRF inventory remains TODO. |
| Config source contains `15m` and `30d` | `auth-token-expiry-smoke.test.ts` calls actual token issuance, verifies signatures and exact expiry boundaries, and asserts the refresh hash/expiry arguments sent to mocked storage. Customer/provider/team-member defaults are 15 minutes/30 days; all three privileged roles use 15 minutes/8 hours. Override tests ensure the mobile refresh override does not extend privileged refresh lifetime. This is not refresh rotation or real PostgreSQL persistence proof. |
| Self-constructed 100-row money decomposition | The actual commission calculator runs against fixed synthetic settings with independently specified centavo outputs covering rounding, fee floor and fee cap. Existing fixed-input assertions remain. Persisted capture/refund/escrow/payout lifecycle conservation is now an explicit TODO rather than a false passing ledger claim. |

Existing validator, booking-transition predicate, commission, TOTP and audit-CSV
behavior assertions remain. The TOTP round-trip also checks an independent
expected value: the app's six-digit SHA1 result at Unix second 59 is `287082`,
derived from the eight-digit reference using the same truncation modulo
`10^6`. [RFC 6238, Appendix B and reference implementation](https://www.rfc-editor.org/rfc/rfc6238#appendix-B)
provide that reference. This one vector does not certify the whole 2FA flow.

Synthetic settings in these tests, including a `standard` fixture tier and
customer service fee, are not statements of current live pricing policy. No
commission agreement, historical booking term, refund or payout was changed.

## Verification

Initial focused execution: **4 suites, 83 passed, 2 TODO, 22.196 seconds**.
No failed or skipped executable test. API TypeScript and four-file ESLint
checks passed. A later refinement uses the exact current pre-auth token type
names and gives the isolated full-app import a bounded 30-second hook timeout.
The final focused rerun passed the same **83 tests / 2 TODO in 4.761 seconds**;
final four-file ESLint and tracked whitespace checks also passed. At this local
verification checkpoint CI has not yet run for this slice. The preceding documentation checkpoint's CI
`34017132941` and Gates `34017132914` both finished successfully.

Reproduction from `packages/api`:

```sh
npx jest --runInBand --runTestsByPath \
  __tests__/smoke.test.ts \
  __tests__/server-health-smoke.test.ts \
  __tests__/auth-token-expiry-smoke.test.ts \
  __tests__/admin-access-smoke.test.ts
```

The two TODOs deliberately prevent a stronger acceptance claim. This is not a
blanket certification of the other legacy tests, UI/Stitch parity, authenticated
live journeys, legal readiness or release readiness. In particular, another
discovered older graceful-shutdown test uses source assertions and still needs
its own behavioral review; it was not changed in this slice.

## Published checkpoint and independent CI verification

Commit `428f9e37c87c8653d96d05ea5ff2de507e6d995c` is published on the existing
review branch. [CI 34018485518](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/34018485518)
and [Gates 34018485516](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/34018485516)
completed successfully. All four CI jobs passed: API, Admin, Mobile/web and
actual Docker image boot. API job `101446584230` explicitly passed all four
smoke files and reported **970 suites, 3,405 passed tests, 2 TODO, 93.811 seconds**.
The TODOs remain unimplemented; neither green CI nor its report-mode gates
certifies whole-app acceptance. This supersedes the earlier local-checkpoint
CI-pending statement, not its scope limits. No master merge or live deployment
occurred. Candidate retention was not requested for this test/docs-only push.
