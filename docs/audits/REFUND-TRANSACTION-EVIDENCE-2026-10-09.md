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

## Completed operator-caller CI receipt

Candidate `642fca928eb02833a65a997874b21573fcc4ce6f` completed
[CI 37835727840](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37835727840)
and [Gates 37835727865](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37835727865).
API logs explicitly pass the eleven-check PostgreSQL refund suite and both
Nginx checks: **1,016 suites / 3,494 tests passed**, two TODOs, no skips,
**82.161 seconds**. Admin passed 598 files / 706 tests, one skipped file and
three TODOs, in 291.69 seconds. Mobile passed 595 suites / 879 tests, 84 TODOs,
in 31.949 seconds, and exported web. Docker built and booted the API with actual
`/health` liveness. Optional exact release packaging was skipped.

CI's merge `1be80fb92dde7dbc682802c0d643e513ef6a2022` and the topic candidate
share source tree `9fd98b3d2c9ea90d0d5995b4c24b7771f5019b38`. This verifies the
preceding caller coverage, not the later runtime correction below, full release
acceptance or live deployment. Browser audit output is not deployment eligible.

## OPS-533: wallet accounting and retry acknowledgement

The next actual-database acceptance test found a real failure on that published
base. After a single **25,000-centavo (PHP250) wallet refund**, a real SQL trigger
refused the retry queue's success update. Payment accounting had already
committed. The next worker delivery incremented accounting again to **50,000
centavos (PHP500)**. Customer wallet, refund ledger, operator audit and internal
support note were unchanged across those worker attempts. This demonstrates
duplicate reported accounting, not an external double refund.

The first run passed eleven checks and failed the new twelfth in 36.642 seconds.
An additional immediate-operator acknowledgement test also failed: eleven
passed, two failed in 5.987 seconds. The immediate path committed accounting
while leaving the same operation pending. No test or gate was skipped to hide
these failures.

### Correction and scope

`payment.service.ts` now accepts an internal durable retry context. For a
wallet-funded payment without an external processor call, it locks the payment
intent and then the existing retry operation. It verifies booking, action,
amount, stored reason and processing state. Accounting and acknowledgement then
commit in the **same transaction**. An acknowledgement failure rolls back
accounting; the earlier local wallet refund, audit and linked support note stay
durable and are not repeated. A matching already-completed operation returns its
completion receipt without another update, including after cumulative refunds
made the intent fully refunded.

The immediate operator handler and payment-only worker consume that receipt
instead of acknowledging a second time. No new migration, financial source of
truth or external dependency was introduced. The internal context is not a new
client-controlled HTTP field. Existing route role, token-purpose, current-user,
CSRF, linked-case and input guards still execute in the database/HTTP tests.

The first corrected thirteen-check run passed in 7.212 seconds. Further testing
injected a **synthetic caller error after a real PostgreSQL transaction and
COMMIT**, revealing two holes in that intermediate repair: the worker could
reopen completed work, and the immediate operator response said queued although
the operation had succeeded. That run passed fourteen checks and failed two in
5.604 seconds. The real transaction and SQL results were not fabricated; the
injected post-commit caller error is not actual OS process termination or a
processor network fault.

Failure updates now require the retry claim still be `in_progress`. If it has
already completed, the worker reads that durable result and does not reopen or
mark it permanently failed. Both a normal and final-attempt delivery are tested.
The immediate operator similarly reads the canonical operation when its pending
failure update affects zero rows, returning processed when completion is proven.

### Verification

The guarded PostgreSQL suite now contains **sixteen checks: fifteen actual
database cases and one connection-guard unit case**. Supporting acceptance
checks cover immediate and worker acknowledgement-trigger failures, caller
failure after committed acknowledgement, mismatched booking/amount/reason/action/
state/missing operation, concurrent duplicate deliveries, and completed replay
after a subsequent cumulative full refund. Wallet, ledger, audit and support-note
snapshots must remain unchanged across payment-only delivery and replay. The
fixture rejects external fetch and asserts zero calls.

A connected local run passed **fourteen suites / 56 tests in 9.615 seconds**,
including all sixteen database-suite checks without skips. Three existing admin
real-render tests passed in **48.99 seconds**; they still use mocked API
responses, not a database-connected browser or live journey. API types and
changed-file lint passed. Local Gate A's ten fragments, all seven smoke scripts
and Gate C's seven articles passed without changing gates, modes or allowlists.

The first broader local run had **1,013 passed suites / 3,496 passed tests**,
three failures and two TODOs, in 303.970 seconds. Two failures were unchanged
Docker-unavailable Nginx checks. The third was an incomplete existing Bug71
unit fixture: its transaction mock created a pending operation, but its
post-commit update mock reported no matching row. That setup now represents
the existing pending row; all original assertions remain. The connected run
above includes the corrected regression. Final full-run evidence and fresh
exact-candidate CI must be checked before accepting publication or advancing.

The reviewed final full local run passed **1,014 suites / 3,497 tests**, with
two TODOs and only the **two unchanged Docker-unavailable Nginx failures**, in
**338.051 seconds**. All sixteen refund-suite checks executed and passed, and
the seven Bug71 transactional regressions passed. This is not a green full
local run. Final API types, all six changed TypeScript files' lint and whitespace
checks passed after source review. Fresh runtime-candidate Linux CI must execute
the sixteen-check suite and both Nginx tests; the older `642fca92` success cannot
verify this correction. No master merge or deployment follows this publication.

After final readback and test-only indentation cleanup, the reviewed caller/
worker repeat passed **four suites / 34 tests in 9.768 seconds**, including all
sixteen SQL-suite checks. Types and lint passed again. Local runtime was Node
24.13.0 and the isolated PostgreSQL fixture was 17.9, not a rehearsal of the
production PostgreSQL 18 migration chain. No generated refund schema or other
client backend remained; only the reverified owned test server was stopped,
with its listener/process absence checked and its data preserved.

### Remaining acceptance

This wallet-only correction does **not** implement the attachment's full K01/K08
money-operation and response-cache contracts. It does not resolve original
funding-source identity when multiple intents exist, external acceptance before
local commit, gateway refund IDs/reconciliation, actual process death, stale
claims, legacy escrow/release actions, cancellation and dispute caller acceptance,
refund/release races or the wider wallet lock graph. The external processor path
retains its separate acknowledgement/ambiguous-outcome risk. No historical
accounting records were backfilled or reconciled.

All 124 historical findings remain **118 not reconciled / six partial / zero
closed**. Stage 1, E68, production recovery and release remain incomplete. No
production account, money record, server configuration or running artifact was
changed by this correction. Full source, migration/image restoration rehearsal,
backup/rollback and authenticated multi-role acceptance still gate deployment.
Relevant live entries remain [customer/provider](https://app.onservice.ph/auth/login)
and [admin](https://admin.onservice.ph/login); this source correction is not live
and no verified production test credentials are provided by these fixtures.

### October 9 completed wallet CI and participant caller continuation

The preceding pending-CI checkpoint is superseded for exact OPS-533 candidate
`0e96abee1dc274253d33e3955b4174aaca179db3`: CI `37842510229` and Gates
`37842510347` completed successfully. Actual API logs execute all 16 refund
checks and both Nginx checks, with 1016 suites / 3499 tests, two TODOs and no
skips. Admin passes 706 tests with one skipped file / three TODOs; mobile
passes 879 tests / 84 TODOs and compiled web export. API Docker build and boot
liveness pass. CI merge `1bb330d49821a65738a0d0923e80e2caa22ed629` and topic
share source tree `dbdef984a0775194cfe11aa669df664e61312033`. Optional exact
API/admin release packaging was skipped; the web audit artifact is not
deployment eligible. This resolves source verification for that wallet-only
correction, not release or live acceptance.

The next participant caller audit reproduces historical R-ACC-02 with real
funded-booking SQL and the mounted status router. SEC-076 blocks unassigned
provider actions before cancellation/refund and false customer notices.
Customer late-unassigned full-refund and assigned-owner navigation checks
are added without changing refund policy. The suite now contains 20 checks;
this newer correction requires its own final local and exact CI evidence.
See `docs/audits/BOOKING-PROVIDER-ASSIGNMENT-2026-10-09.md`. The historical
118/six/zero inventory count above remains a point-in-time receipt, not a
claim that all finding states were reconciled by this continuation.
