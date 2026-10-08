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
owned by each test and removed afterward. Both the requested connection and
actual server identity must be a loopback test database; missing unsafe CI
configuration fails rather than silently skipping. The production schema,
payment processor, API callers and live data are not exercised by this fixture.

The first fixture run failed before creating a schema because PostgreSQL's
inet-to-text conversion included `/32`. Selecting `host(inet_server_addr())`
corrected the identity check while retaining exact IPv4/IPv6 loopback validation.
That was a test-fixture error, not a reproduced refund-code defect.

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
