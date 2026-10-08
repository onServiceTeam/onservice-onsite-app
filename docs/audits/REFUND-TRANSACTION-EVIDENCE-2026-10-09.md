# Wallet refund transaction verification

Date: October 9 2026, Asia/Singapore. Source base:
`6799d65701321ad02e13b4d451f6f056be00fdd2`. Application: onService PH marketplace.
This slice adds database evidence for existing refund code, not a new money-path
implementation or a production repair. Stage 1 and live release remain open.

## Historical findings and current scope

The attached October repair register describes older source at
`738641095d3ae1dcbba14c5803b96cf63ae93ee8`. Its R-MON-01 headline says wallet
refunds never credit customers. The current `refundFromEscrowInTransaction`
does credit the customer wallet and writes both ledger entries. Its existing
OPS-284 test checks SQL calls with a mocked database. The new test executes the
actual helper, wallet service and `db.transaction` against PostgreSQL.

| Finding | Fresh evidence | Remaining acceptance |
| --- | --- | --- |
| R-MON-01 wallet credit | Actual wallet funding followed by a full refund restores the customer's original balance; two refund entries balance to zero. | Each customer cancellation, admin refund and dispute caller, payment-intent accounting, HTTP/render and live acceptance. |
| R-MON-03 booking cap | A request exceeding the booking's funds is rejected despite another booking's larger shared escrow balance. Two concurrent refunds that would exceed that cap yield one success and one rejection. | Entire operator route, permission/audit/replay semantics and refund versus release races. |
| R-MON-02 payment retry | Existing OPS-286 regression still passes with payment-only retry; the real wallet tests do not contact a payment processor. | Original-source identity, ambiguous processor outcomes, process death and durable external replay. |
| R-ACC-01 setup-token boundary | Existing SEC-039/040 HTTP/socket regressions pass in the connected selection. | Complete purpose/session contract, legacy untyped-token transition and authenticated client acceptance. |

These are scoped implementation and evidence states, not withdrawal of the
original attachment, closure of all six P0 findings, or reconciliation of all
124 findings. The attachment's proposed migrations are not installed.

## Actual database checks

`packages/api/__tests__/refund-transaction-postgres.test.ts` adds four checks:

1. Fund a PHP 1,000 booking using the real wallet debit and escrow hold helpers,
   with a second booking holding PHP 10,000. Refund the first booking in full.
   Its customer returns to the original PHP 2,500 balance, the second customer's
   balance and ledger remain unchanged, and the refund has exactly matching
   negative escrow and positive customer entries. Repeating the exhausted full
   refund rejects without any additional changes.
2. Request 100,001 centavos against that booking's 100,000. The helper rejects
   and preserves all wallet rows and ledger entries. Two concurrent 70,000
   centavo requests yield exactly one committed refund, one 409, and 30,000
   centavos still owned by the booking.
3. An actual PostgreSQL trigger rejects the customer refund-ledger insert after
   the balance writes. The transaction rolls back both wallets, both refund
   ledger writes and timestamps. Removing that trigger permits the same refund
   with exactly two committed refund entries.
4. Zero, negative, fractional, NaN, infinite and unsafe-integer amounts reject
   with 400 and preserve all wallets and ledger entries.

The focused fixture reproduces wallet constraints from migrations 005, 034 and
053, including nonnegative balances, wallet uniqueness and ledger foreign keys.
It uses BIGINT centavos and the existing type parser. Generated schemas are
owned by each test and removed afterward. The requested URL and actual client
TCP peer must be loopback, and the database name and peer port must match the
request exactly. Missing or unsafe CI configuration fails rather than silently
skipping. The production schema, payment processor, API callers and live data
are not exercised by this fixture.

The first fixture run failed before creating a schema because PostgreSQL's
inet-to-text conversion included `/32`. Selecting `host(inet_server_addr())`
corrected the identity check while retaining exact IPv4/IPv6 loopback validation.
That was a test-fixture error, not a reproduced refund-code defect. The later CI
failure below exposed a second problem with using the server interface; the
client-peer guard supersedes that original approach.

The corrected standalone run passed **four tests in 1.857 seconds**. A connected
selection then passed **15 suites / 36 tests in 14.593 seconds**, including the
four real database tests and existing wallet credit, operator replay, parameter
conflict, durable outbox, missing payment reference, claim delay, manual-attention,
partial release and setup-token regressions. The other existing tests retain
their own mocked boundaries; they are not upgraded to database acceptance by
being included in this selection. API types, new-file ESLint and whitespace
checks passed.

The complete local API run passed **1,014 suites / 3,485 tests**, with two existing
TODOs and **two failed suites/tests**, in **523.553 seconds**. Only unchanged
UX-860 and UX-201 failed because the local Docker Linux engine was unavailable.
The new refund suite executed all four checks without skips. This is not a green
full local run. The preceding authentication candidate's successful Linux CI
does not verify this newly added suite; publication needs its own CI receipt.

Local Gate A passed all ten fragments, seven gate smoke scripts passed, and
Gate C passed all seven articles. These used the existing private process-local
Python shim, without gate, mode or allowlist changes. An initial guessed Gate A
filename failed before running a gate; the actual `run-gate-a.sh` then passed.
These are not fresh GitHub results for all five gates.

A separate negative check set CI mode with a synthetic non-loopback database
URL. The suite rejected it at module load, before connecting or creating a
schema, with the expected exit code 1 and zero executed tests. This verifies
the guard, not a passing money regression. Machine-readable reports remain in
the ignored repair-intake directory. After the full run, no owned refund schema
or other client connection remained in the isolated test database.

## CI fixture failure and connection guard correction

Published candidate `17875c0b28d40cf755dc4bbde77bed7694d068a5` failed
[CI 37827644358](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37827644358).
The API passed **1,015 suites / 3,483 tests**, with two TODOs, but the new refund
suite failed all four tests at its identity guard before creating a schema.
The API runner took **77.055 seconds**. Admin and mobile jobs succeeded; the
dependent Docker build was skipped. Gates 37827644429 reported success with
existing dispatch/report-mode limits. None of this is a successful release.

The first guard confused the server's accepting interface with the client's
network target. PostgreSQL defines [`inet_server_addr()`](https://www.postgresql.org/docs/current/functions-info.html)
as the address on which the server accepts a connection. That need not be
loopback behind CI container port forwarding. The corrected fixture checks the
actual client's [`Socket.remoteAddress`](https://nodejs.org/api/net.html#socketremoteaddress),
the exact requested database name, and the client's peer port before creating
its schema. It does not allow arbitrary private subnet addresses or bypass
validation in CI. Unsupported URL protocols, query overrides and fragments are
also rejected before a connection is opened.

A local rehearsal used an owned loopback TCP relay and actual PostgreSQL, not
a fabricated database response. The client reached `127.0.0.1`, while the
server accepted that forwarded connection on a different loopback interface.
The unchanged published fixture failed all four tests in **18.859 seconds**.
The corrected fixture passed **five tests in 1.932 seconds**: all four original
money assertions and one additional connection-guard behavior test. That guard
test rejects missing/non-loopback peers, missing/mismatched database names and
non-test targets. An ordinary direct database rerun then passed the connected
**15 suites / 37 tests in 22.234 seconds**, without skips. A preceding selector
mistake named three nonexistent test paths; it is retained as a failed run,
not counted as passing acceptance.

Five separate unsafe-CI checks rejected a remote URL, a query-based host override,
a wrong protocol, a production database name and missing configuration. Each
exited 1 at the expected module guard with zero executed tests. These are
negative safety checks, not passing refund runs. API types and changed-test lint
passed. Local Gate A again passed ten fragments, all seven gate smoke scripts
passed, and Gate C passed seven articles with zero blocking/report failures.
The existing private Python shim was used; no gate or allowlist was changed.
After the runs, the isolated database had zero owned refund schemas and zero
other client connections. Its owned server was stopped, with listener and
process absence verified and its data directory preserved.

Fresh full Linux CI was still required at that publication checkpoint. The
subsequent receipt follows; the local relay was not treated as a substitute.

## Completed connection-guard CI verification

Exact candidate `882ff8d5484f2a6a5fec7e598b2ee48bf6dcbf2e` passed all four jobs in
[CI 37830757089](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37830757089)
and [Gates 37830756882](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37830756882).
The actual API log explicitly passes the refund SQL suite and both Nginx tests:
**1,016 suites / 3,488 tests**, two TODOs, no skips, **73.976 seconds**. All four
SQL checks and the guard unit check executed against the Linux CI service.
Admin passed **598 files / 706 tests**, one skipped file and three TODOs,
**286.57 seconds**. Mobile passed **595 suites / 879 tests**, 84 TODOs,
**53.016 seconds**, and its web export succeeded. API Docker build and actual
boot liveness passed. Optional exact release packaging was skipped.

The workflow checkout and browser artifact identify PR merge
`d5445424c324a68a9040621efd1a137b2e44b22c`; GitHub commit records verify that its
tree equals the topic candidate at `1bef549052dacb1e8a25a5905b70f5ef2ceaa4c6`.
The browser artifact is not deployment eligible or authenticated acceptance.
Existing Gate D/E report and conditional Gate B limits remain. This resolves
that fixture's fresh-CI uncertainty, not release or the newer coverage below.

## Operator HTTP, support-case and payment-only retry verification

Continuation base: `882ff8d5484f2a6a5fec7e598b2ee48bf6dcbf2e`. This adds six
behavioral checks of existing code to the same guarded database suite. No runtime
money implementation, schema history, dependency, workflow or gate changes.
The first expanded standalone run passed **11 tests in 27.532 seconds**:
**ten actual database checks and one connection-guard unit check**, with no skips.
There is no failing-before-passing runtime correction claimed in this slice.

The new checks mount the real booking-admin Express router, canonical account
authentication, cookie/CSRF guard and error handler. They execute real wallet,
escrow, payment-intent, support-note, admin-audit and retry-worker SQL:

1. A 25,000-centavo partial refund credits the customer, leaves 75,000 held for
   that booking, updates its wallet-funded intent, and links one support note,
   audit and payment-only outbox record. The actual money read route exposes
   the matching ledger and accounting. The same logical key replays without a
   second write even after its case closes; changed amount, reason, case or
   booking rejects with 409. A distinct key can refund the remaining 75,000.
2. Customer, provider, provider-staff, ordinary admin and DPO tokens are refused.
   Setup-purpose, stale-generation, inactive and forced-rotation requests fail
   without money writes. Missing, mismatched and unrecognized cookie CSRF proofs
   fail; a persisted valid proof permits the refund. Invalid amounts, reason,
   IDs, another booking's case and a resolved case preserve the money records.
3. Actual database triggers reject each of the outbox, audit and internal-note
   inserts. HTTP 500 preserves wallet, ledger, booking, intent, case, timestamps
   and operation records. Removing each trigger permits the same-key retry with
   one operation, not a partial commit or duplicate movement.
4. Concurrent same-key partial-refund HTTP requests return one original result
   and one replay, sharing the audit identity and one balance/accounting change.
5. Concurrent distinct keys requesting 70,000 each yield one success and one
   409. The larger second booking's ledger and intent remain unchanged; it cannot
   subsidize the first booking's cap.
6. A real payment-intent update trigger fails after the local refund commits.
   The route reports credited wallet funds and queued accounting. Same-key replay
   preserves that state. After removing the trigger, the actual retry worker
   updates only payment accounting and succeeds; it does not repeat the wallet,
   ledger, audit or support note. A later worker pass attempts zero jobs.

The fixture reproduces focused wallet constraints and executes existing
migrations **045, 092 and 163** in its own generated schema. Other relevant
tables are minimal fixtures; its schema-local `uuidv7` delegates to random UUID
generation and does not test production UUID ordering. This is not the complete
migration chain, restored production data or the complete server middleware
stack. The standard test configuration isolates Redis, and diagnostic logging
is mocked. A fetch spy refuses external delivery and asserts zero calls. Signed
tokens, database results and HTTP responses are real, with synthetic identities.

Three existing admin real-render tests also passed in **35.10 seconds**:
OPS-287 checks centavos, support-case linkage and the logical key; OPS-288 checks
queued-outcome wording; OPS-294 checks manual-attention replay wording. Their API
responses remain mocked. They are not a database-connected browser journey,
complete Booking 360 screen audit or latest-Stitch acceptance. An initial wrong
relative Vitest path failed before runner startup; the corrected invocation
passed without changing those tests.

This proves one wallet-funded operator caller's scoped replay and rollback
behavior, not all historical findings or Stage 1 completion. Customer cancellation
and dispute callers still need actual database/HTTP acceptance. The worker failure
here occurs before payment accounting commits, not after an external processor
accepts or between accounting commit and queue acknowledgement. Original-source
refunds, ambiguous outcomes, process death, stale worker claims, refund/release
races and the wider wallet lock graph remain open. The attachment's full K08
header/response-cache contract is not implemented or accepted by these checks.

The final connected rerun passed **15 suites / 43 tests in 17.424 seconds**,
including all eleven checks in the expanded SQL suite without skips. Other
selected suites retain their mocked boundaries. The complete local API run
passed **1,014 suites / 3,492 tests**, with two existing TODOs and **two failed
suites/tests**, in **574.405 seconds**. Only unchanged UX-860 and UX-201 failed
because the local Docker Linux engine was unavailable. All ten database checks
and the guard check explicitly passed. This is not a green full local run.

API TypeScript, changed-file ESLint and whitespace checks passed again after
review. Local Gate A passed ten fragments, seven smoke scripts passed and Gate C
passed seven articles, with zero blocking/report failures. The private process-
local Python shim was reused; no gate assertion, mode or allowlist changed.
Full CLAUDE, README and LAUNCH-LIMITATIONS alignment reads are complete. The
completed administrator CI receipt is now recorded alongside limitation 95;
separate issuance, durable acknowledgement and the production boundary remain.

Machine-readable first, full and connected reports remain private in the ignored
repair-intake directory. Fresh exact-candidate Linux CI is still required for
this newer coverage. It is not deployed and does not establish live credentials.
After all runs, the isolated database had zero owned refund schemas and zero
other client backends. Its exact owned server was stopped; listener and process
absence were verified and the data directory was preserved. Foreign services
were not stopped.

## Boundaries before further repair

Exhausted-full-refund rejection is not partial-refund request idempotency. The
helper does not receive a logical request key. `paymentService.processRefund`
still has a processor call within a payment-intent transaction; source review
and the payment-only mock do not prove ambiguous-outcome or crash recovery.
Wider wallet lock ordering also needs concurrency review: wallet lookup/create
can acquire an individual row lock before the later sorted multi-wallet lock.
No claim of deadlock-free behavior is made by the same-booking refund test.

No runtime source, schema, dependency, gate, production account or financial
record changed in this slice. Production Redis recovery remains subject to the
separate E80 hold. Matched release artifacts, all migrations, restored-database
rehearsal, rollback and authenticated customer/provider/admin acceptance still
gate deployment. Existing legal, live-payment and design acceptance limitations
remain.

Relevant entry points are [customer/provider sign-in](https://app.onservice.ph/auth/login)
and [admin sign-in](https://admin.onservice.ph/login). These are not verified
live test logins or evidence that this candidate is deployed.
