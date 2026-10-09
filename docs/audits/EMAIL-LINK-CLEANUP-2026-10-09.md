# Email-link proof expiry and request cleanup, October 9

## Scope and status

This is a bounded continuation of the verified internal linking foundation
`1638b15a`. It is **not email login, configured delivery, a public endpoint or
a live cleanup**. No production record, account, message or server was changed.
No new process, dependency or queue is introduced. Existing phone and
administrator sign-in contracts are unchanged.

Pending proofs already fail verification after their server-derived expiry.
However, an abandoned operation has no later verification request to clear its
stored hashes. This new scheduler action clears expired hashes and bounds the
retention of the new request metadata before a public producer is enabled.
There was no previous cleanup function; a missing-module failure would not be
an honest reproduced runtime regression. No such red claim is made.

## Contract and operational bounds

- The existing scheduler attempts one batch every five minutes, with three
  attempts and exponential retry starting at sixty seconds. It retains only
  thirty completed and one hundred failed job receipts.
- Each attempt expires at most one hundred pending proofs and removes at most
  one hundred old terminal requests. It does not drain indefinitely. The
  internal service rejects noninteger, nonpositive and above-five-hundred limits.
  The scheduler always supplies one hundred and ignores payload cutoffs/limits.
- PostgreSQL selects eligible rows with ordered `FOR UPDATE SKIP LOCKED` batches.
  Active/locked requests are left alone. Expiry changes state and clears both
  hashes. The second phase removes terminal request metadata older than ninety
  days from creation, using the database statement clock, not a queued/client date.
- Both phases commit together. A deletion failure rolls back hash clearing too;
  it propagates for retry, without a false success receipt. Verification's own
  expiry rejection remains effective even if this housekeeping fails.
- An abandoned request older than ninety days can expire and be removed in one
  transaction. Returned numbers count actions, not distinct requests or owners.
- Only challenge rows are locked. Cleanup does not subsequently acquire account,
  identity or audit locks, avoiding reversal of linking's account-first order.
  This is not proof that the application's wider lock graph is deadlock-free.
- Verified identities, accounts, sessions and audits are not removed by cleanup.
  A retained identity's opaque original proof reference does not require retaining
  the request's phone, email, IP or hashes forever. Very old completed-response
  replay becomes invalid after request removal; ownership itself remains.
- Logs/results contain only counts. No proof, recipient or queued payload is
  included in a successful cleanup result. Unrelated scheduler jobs are unchanged.

Ninety days is an engineering default for this new authentication-request
metadata, aligned with the existing login-attempt default, **not qualified legal
retention approval**. It does not authorize deletion of financial, dispute,
compliance or company audit records. E21's broader retention matrix is still
open. This is not complete account erasure, backup/export erasure or a guarantee
that every hash is physically cleared exactly at five minutes: outages, locked
rows and a backlog can delay a bounded attempt. No live backfill/purge occurs.

Additive migration 176 supplies separate partial indexes for pending expiry and
terminal retention. Migration 175 and all earlier history are unchanged. The
selected release must apply the reviewed chain before starting these workers.
The scoped fixture applies actual 175/176 SQL, but is not a complete restored
production-chain/selected-image rehearsal through 176.

## Verification

The email-link suite now contains twenty-one checks: nineteen actual PostgreSQL
cases and two pre-database unit checks. Existing sixteen checks are retained.
Four new SQL cases verify:

1. Expired hash clearing, active/recent request preservation, old completed-request
   removal, preserved identity/audit/account/session state, replay and repetition.
2. Real locked rows skipped by concurrent two-row batches, exact combined counts,
   preserved locked state and completion after release.
3. A real DELETE trigger failure rolling back both phases, followed by retry.
4. Preserved recent abuse counts and a still-usable active proof, alongside removal
   of a very old abandoned request. Cleanup cannot reset the hourly account limit.

Two scheduler tests execute the actual dispatch function with a mocked BullMQ
boundary and spied cleanup primitive. They verify fixed scheduling/batch arguments,
untrusted payload rejection, count-only success and propagated failure. These
are not actual Redis delivery or a deployed scheduler exercise. Database behavior
is checked separately by the SQL cases above, not inferred from mocks or SQL text.

First local connected run: five suites / ten passing checks, twenty explicit
SQL skips, 1.718 seconds. Local PostgreSQL remains unavailable after the retained
bind-permission failure; no alternate-port/elevation workaround was used. These
skips are not database acceptance. Full local API is **not green**: 956 suites /
3,417 checks passed, 66 suites / 147 checks skipped, two TODOs and two unchanged
Docker-unavailable Nginx failures, 234.822 seconds. Reports are retained privately.
API types, changed-file lint, Gate A's ten fragments, Gate C's seven articles and
all seven gate smoke scripts passed, without assertion/mode/gate changes.

Final reviewed selection passed five suites / eight checks with twenty SQL skips
in 1.512 seconds, including the account-deletion revalidation and role-aware
export regressions. An earlier repeat used two incorrect test filenames and
failed file loading; that 6.440-second report is retained, not counted as green.
The corrected command changed paths only, not source, tests or assertions.
The final gate repeat first selected Windows' WSL `bash`, where Gate A could
not find Node. That incomplete attempt was stopped by its verified owned
launcher identity. The existing Git Bash environment then passed A/C and all
seven smoke scripts again; no gate, environment policy or source was weakened.

Actual execution of all twenty-one guarded email-link checks, existing affected
account-session/deletion fixtures, full API/admin/mobile regressions, both Nginx
checks, compiled builds and actual API Docker build/boot remain required on the
exact published cleanup candidate. Preceding green CI does not verify this stage.

## Remaining work

After exact cleanup acceptance: governed delivery outcomes and interrupted
responses, authenticated fresh-proof HTTP integration, verified-email session
issuance, neutral account discovery/abuse handling, actual sender/domain/inbox
configuration and role-aware web/native screens. Google/Apple stable-subject
adapters and Facebook evaluation remain separate unimplemented stages. No fake
social buttons or legacy-contact auto-linking are enabled.

Full selected-image restoration through 176, preserved data, backup/rollback,
matched API/admin/web/native artifacts and authenticated multi-role acceptance
remain necessary before release. No email/social method is available on live,
no APK was delivered, and no zero-bug or launch-ready claim is made.

## Completed independent cleanup verification

Exact `7bb06275ad91f456e5489c668d6147af8c697a1f` passed CI `37915363720`
and Gates `37915363736`. Actual API job `113770107084` passes 1024 suites /
3566 tests, two TODOs, no skips/failures, in 98.032 seconds. All twenty-one
email-link checks execute, including nineteen real SQL cases, alongside both
scheduler checks, affected account lifecycle, issuer/refund and both Nginx checks.
Admin passes 598 files / 706 tests, one skipped file / three TODOs, types/build.
Mobile passes 595 suites / 879 tests, 84 TODOs, types/compiled web. Actual API
Docker build and served `/health` pass. Complete per-job logs are retained.

CI merge `2e14a9cd25db4eb59a2b94af0cb82c46b3491ac6` and the topic share tree
`ab4d90a49d99887374a0f781f0a9f5ac7d5bea15`. Web artifact `11609822396` is
explicitly not deployment eligible and was not downloaded/exercised. Optional
exact API/admin packaging was skipped. Gate B conditional dispatch and D/E
report-workload limits remain. No gate, mode or assertion was weakened.

This resolves the cleanup source-verification requirement, not its failed/skipped
local receipt, deployment or full sign-in. This receipt accompanies the next
related delivery/HTTP implementation, not a documentation-only CI loop. That
new candidate needs its own actual SQL/full CI and remains disabled by default.
