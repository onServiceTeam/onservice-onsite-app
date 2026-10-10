# Operator refund support-case lock: OPS-536

## Failure and scope

During exact-source verification of the phone CAPTCHA correction, candidate
`7fa7c520d699a142f4f1f1f853fab7d8b32f5c03` failed
[CI 37895823523](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37895823523).
An unchanged mounted HTTP/PostgreSQL test expected concurrent 70,000-centavo
refunds against one 100,000-centavo booking to return 200 and 409. Instead it
received 200 and 500. The API passed 1,016 suites / 3,517 tests, with one failed
suite/test and two TODOs, in 60.547 seconds. SEC-080, the issuer SQL suite and
both Nginx checks passed. Admin and mobile jobs completed successfully; the
dependent API Docker build was skipped. Gates 37895823510 succeeded, which did
not make the failed candidate release-ready.

This was not a reason to weaken or retry away the concurrency assertion. A
normal unchanged local run passed the original 26 checks, so a second test
controlled the real database schedule to reproduce the overlapping transactions.

Each distinct-key refund took `FOR SHARE` on the same support case before
locking its booking. The transaction later updated that support case. Two
requests could both hold the case's shared lock: one then held the booking
while the other waited for it. The first needed to upgrade its case lock to
perform the timestamp update, but the second still held a conflicting shared
lock. PostgreSQL detected the cycle and aborted one request.

The new named regression holds the real booking row in a separate transaction,
starts two actual HTTP requests, observes both PostgreSQL lock waits, and then
releases the booking. On unchanged runtime code it returned 200/500 instead of
two successes for two 25,000-centavo refunds. The HTTP error logger reported
`deadlock detected`, and the actual PostgreSQL server log showed the cycle
between `SELECT ... FROM bookings ... FOR UPDATE` and
`UPDATE support_tickets SET updated_at=NOW()`. No fabricated SQL result or
synthetic exception caused this failure. The original report retains **26
passes / one failure**, 11.856 seconds.

## Narrow correction

Only the case-lock acquisition in `refundBookingEscrow` changes, from
`FOR SHARE` to `FOR NO KEY UPDATE`. The existing transaction will write this
case, so it takes its writer lock before acquiring the booking lock. Distinct
refunds on that case now serialize there, without the shared-to-writer upgrade
cycle. The lock remains compatible with key-share readers and applies to that
case row, not all support cases. See PostgreSQL's
[row-lock and deadlock contract](https://www.postgresql.org/docs/current/explicit-locking.html).

The current active-case and booking-link predicates, canonical super-admin
authorization, token-purpose/current-account checks, CSRF, logical-key replay,
booking cap, wallet movement, payment accounting, audit, internal note and
durable outbox remain unchanged. No new retry loop, swallowed database error,
global lock, financial source of truth, migration, dependency or gate change
was introduced. Existing support-case update/message transactions were read
for lock-order consequences; this is not certification of every wider wallet,
account, provider, dispute or release lock path.

## Actual verification

The first corrected 27-check SQL run passed in **10.427 seconds**. The final
expanded fixture contains **28 checks: 27 database cases and one connection-
guard unit case**. The two new cases establish:

- Controlled same-case overlap yields two 200s for affordable partial refunds,
  or one 200 and one 409 when their sum exceeds the booking's funds. Exact
  wallet/payment totals, paired refund ledger entries, audit/note/outbox counts,
  completed delivery and unchanged other-booking records are asserted. Replaying
  a successful key preserves the full database snapshot.
- While a refund waits on a held case row, another booking's case can complete
  its own refund. If the held case becomes resolved or closed before release,
  the waiting request rechecks eligibility and returns 409 without any additional
  wallet, intent, booking, case, ledger, note, audit or outbox mutation.

Connected local verification passed **11 suites / 46 tests**, no skips/TODOs,
in **12.390 seconds**, including all 28 SQL-suite checks and all nine SEC-080
checks. Existing selected unit regressions retain their mocked boundaries.
Three unchanged admin render tests passed in 10.466 seconds, covering linked case/centavo/key
submission and queued/manual-attention feedback. Those API responses are mocked,
not a database-connected browser journey. API typecheck and changed-file ESLint
passed. A mistyped initial Jest config path failed before tests ran; it is
retained separately and not counted as verification.

The focused database uses the owned loopback PostgreSQL 17.9 test cluster,
generated isolated schemas, actual HTTP handlers and synthetic identities.
External fetch is forbidden and asserted unused. Existing migrations 045,
092, 131, 162 and 163 execute where the respective fixture requires them; this
is not a complete production-chain or selected-image rehearsal through 174.

The full local API run passed **1,015 suites / 3,518 tests**, with two TODOs,
zero skips and two failed suites/tests, in **313.647 seconds**. The only failures
were unchanged UX-201/UX-860 because the local Docker Linux engine was
unavailable. All 28 refund/participant checks, nine SEC-080 checks and five
issuer SQL checks executed and passed. This is not a green full local run.
Local Gate A (ten fragments), Gate C (seven articles) and seven smoke scripts
passed with zero blocking/report failures and no assertion/mode/allowlist edits.
The same private process-local Python shim was used.

After testing, the owned cluster's exact database, user, loopback port and data
directory were reverified, with zero generated schemas, other client backends
or owned test runners. Only that server was stopped; listener and process
absence passed, and its data was retained. No foreign or live service changed.

The reviewed source still needs exact new-candidate CI before advancing to
another changed function. The preceding failed CI and original local red
reports remain preserved. No production deployment is made by this source
change. No claim of complete refund safety or a deadlock-free system is made:
original funding identity, external ambiguous outcomes, actual process death,
stale claims, refund/release races and wider lock ordering remain open.

Related live entry points are [customer/provider sign-in](https://app.onservice.ph/auth/login)
and [admin sign-in](https://admin.onservice.ph/login). They do not serve this
candidate. Email/social sign-in, device APK acceptance, authenticated release
acceptance and launch readiness remain separate work.
