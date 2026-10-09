# Email sign-in request and delivery boundary, October 9

## Scope and status

This candidate connects public marketplace email request/confirmation routes to
the previously verified identity, proof/session transaction and email sender.
It remains **default-disabled, not deployed and not a working client feature**.
No real email, account, payment, sender configuration or production service was
used or changed. Administrator password/TOTP remains separate. Native worktree
edits are preserved and excluded from this slice.

The preceding `5deb00ae` completed CI `37922879922` and Gates `37922879915`.
Its complete receipt is appended to `EMAIL-SIGN-IN-TRANSACTION-2026-10-09.md`.
That preceding green source does not verify the new HTTP/coordinator code here.
No existing email-login route existed on that source. This is new behavior,
not an invented legacy failing regression or closure of a historical finding.

## Public and private contracts

- `POST /api/v1/auth/email/requests` requires the opt-in
  `EMAIL_SIGN_IN_ENABLED=1`, existing sender configuration/delivery flag,
  strict email/CAPTCHA input and successful CAPTCHA. Existing auth/global rate
  limits apply. Only the server allocates the request UUID; caller IDs, roles
  and account identifiers are rejected. Missing configuration fails closed.
- After these account-independent checks, HTTP 202 returns the same neutral
  receipt before lookup, account locks, proof hashing or provider work. The
  receipt contains only request ID, received status, cooldown and generic
  check-email/retry/phone guidance. Unknown/contact-only/ineligible/capped
  addresses and failed delivery do not alter it. No public polling endpoint
  exposes delivery state. Responses and early route errors are private/no-store.
- The handler then awaits private preparation/delivery, catching post-response
  failures into a fixed message without raw exception, email, code, SQL or
  credentials. This removes direct account-lock/provider-delay coupling from
  the receipt. It does **not** prove perfect timing equivalence, capacity under
  abuse, a durable queued acknowledgement or guaranteed receipt delivery.
- Preparation retains five requests/hour per normalized recipient and IP,
  recipient cooldown, decoys and exact verified-identity ownership. Legacy
  contact addresses do not create, merge, link or promote accounts. Provider
  admission and staff membership remain enforced by their respective APIs.
- A second account-first transaction rechecks active/verified marketplace role,
  generation, phone, identity proof, recipient binding and database-clock
  expiry, then commits a one-attempt claim. No database/account lock spans the
  network call. The existing bounded, fixed-destination sender receives only
  its private delivery instruction and uses the request's idempotency key.
- Additive migration 179 stores only private attempt/outcome dates and state.
  Timestamp checks reject incomplete/backward receipts. It introduces no
  plaintext code/address queue and replaces no historical migration. Acceptance
  means provider acceptance, not inbox delivery, identity proof or a session.
- A failed/suppressed claim sends nothing. Failed/suppressed receipt storage
  leaves `attempting` as uncertainty, not permission to resend. Later receipt
  storage cannot reopen or consume a finished proof. Current-authority checks
  still deny completion after revocation, even if an email has already gone out.
- `POST /api/v1/auth/email/:id/confirm` validates UUID, six-digit code and bounded
  optional device fingerprint, then uses the existing atomic proof/session
  operation. Success retains the marketplace bearer-token response contract,
  not administrator cookies. Invalid/replayed/expired proof returns fixed 400;
  an unexpected session-write failure returns fixed 503 without tentative
  credentials. A rolled-back write leaves the same unexpired code retryable.
- Owner export includes delivery metadata, not challenge IDs, hashes, recipient
  digests, identity proof IDs or codes. Existing row deletion and bounded
  cleanup cover these additional columns without changing retention policy.

The 202 is explicitly a request receipt, not a send promise. Process death before
preparation/claim can lose unsent work; after claiming, a lost outcome remains
uncertain. There is no plaintext durable payload, new worker, automatic resend
or extra permanent process. Existing graceful shutdown does not establish that
post-response preparation drains before exit. A client must preserve the returned
request ID, avoid blindly retrying the POST, and offer an explicit fresh request
after cooldown or phone fallback. A lost successful confirmation response needs
a fresh sign-in, not spent-code credential replay. Actual process-death, full K08
response-cache acceptance and native/browser recovery are not certified.

The existing CAPTCHA verifier is reused, not newly certified for outbound
deadline/response-size bounds. Real provider configuration, client CAPTCHA,
inbox acceptance and whole-service timing/load remain separate requirements.
No dependency, gate, assertion, phone policy or privileged factor is weakened.

## Executable verification

`email-sign-in-http-postgres.test.ts` has **22 checks: three non-SQL HTTP checks
and nineteen real PostgreSQL/HTTP cases**. It checks safe CI URL configuration
before connection, then actual loopback TCP peer, requested port and database
name before creating its owned schema. The scoped UUID/FK fixture applies the
real repository migrations 175 through 179, not the full production chain.

The sender and CAPTCHA use real native HTTP against an owned synthetic loopback
peer. Only outbound destinations, Redis rate middleware and diagnostics are
substituted; service SQL, constraints, locks, scrypt, JWT issuance and canonical
authorization execute. All post-response coordinator promises settle before
fixture teardown. No external provider receives credentials or account data.

Coverage includes:

- Receipt arrival before held private work, actual account lock and delayed
  provider acknowledgement; feature/config/input/CAPTCHA rejection before work.
- Customer/provider/staff usable canonical credentials, stored device/IP,
  purpose enforcement, refresh-token rejection as access, replay and revocation.
- Three privileged-role denials, contact-only/unknown decoys and unchanged
  account/session/audit state; no administrator cookie bypass or issuance.
- Private rejection/unknown provider outcomes, recipient/IP caps, concurrent
  starts, wrong attempts, expiry and confirmation after sender configuration loss.
- Real throwing/suppressing SQL claim/receipt failures, no unclaimed send,
  retained uncertainty, explicit later request and exactly one delivery attempt.
- Real refresh-session insertion failure, no tentative credentials/audit,
  rolled-back proof use and successful same-code retry after removing the fault.
- Receipt database constraints and actual owner-scoped export query with foreign
  owner denial and no proof secrets. Unrelated export queries return empty
  fixture results; this is not full archive/erasure acceptance.

The 33 prior internal transaction checks and existing assertions remain. The
export fixture adds the newly declared metadata, not relaxed ownership checks.

## Local results and required CI

Initial focused: three suites / six passing unit checks, 63 SQL skips, 8.176s.
Final reviewed focused: three suites / six passing unit checks, **64 SQL skips**,
1.421s. Nineteen new SQL cases have not executed locally. Local PostgreSQL remains
unavailable after the retained bind denial; no alternate-port/elevation bypass
was used and no existing foreign PostgreSQL process was touched.

Initial full local run: 959 suites / 3424 tests passed, 66 suites / 210 tests
skipped, two TODOs and two failed suites/tests, 327.125s. This ran across the
last unpublished HTTP error-handling review, so it is not the final-source
receipt. The separate reviewed full repeat exited 1 in **245.615s**: 959 suites /
3424 tests passed, 66 suites / **211 tests skipped**, two TODOs and the same
two failed suites/tests. Only unchanged UX860/UX201 Nginx checks failed because
the local Docker Linux engine is unavailable. This is not a green full run.

Final API types and changed-file lint pass. Gate A's ten fragments, Gate C's
seven articles and all seven smoke scripts pass unchanged. Five unsafe CI
configurations reject before connection with zero tests. The initial diagnostic
command expected the new guard message for a remote host; the imported existing
helper rejected it earlier, so that command's assertion failed. The retained
corrected probes require the actual applicable guard and zero executed tests;
no application/test guard changed to make that diagnostic pass.

Before another function changes, require actual execution of all 22 HTTP checks,
33 internal sign-in checks, 21 linking-foundation checks, 15 linking-HTTP checks,
affected lifecycle/export/issuer/refund regressions, both Nginx checks, complete
API/admin/mobile tests, types/compiled artifacts and API Docker build/boot at
the exact published source. Local skips and prior green CI are not acceptance.

After verified source, continue role-aware linking/sign-in UI and actual delivery
acceptance, safe phone-required onboarding and configured Google/Apple adapters.
Facebook evaluation remains separate. Before enabling on the live server, review
the accumulated PR, rehearse the selected image and complete migration chain
through 179 on an isolated restoration, prove backups/rollback, and validate
matched API/admin/web/native authenticated behavior. Existing live-payment,
private-access, signing/update, legal and launch limitations remain open.

## Completed exact-source verification of the HTTP slice

Published `9c0d37597f958692c0162a9a9c26751ac1515f24` completed CI
`37926401909` and Gates `37926401967`. The actual API job passes **1027 suites /
3637 tests**, two TODOs, no skips/failures, 112.393s. All 22 HTTP cases, 33 internal
sign-in checks, 21 linking-foundation checks, 15 linking-HTTP checks, affected
lifecycle/export/issuer/refund/scheduler checks and both Nginx checks execute.
Admin passes 598 files / 706 tests, one skipped file and three TODOs, 212.99s,
with types/build. Mobile passes 595 suites / 879 tests and 84 TODOs, 52.686s,
with types and compiled web export. The API Docker image builds and serves
`/health`; its blank-database missing-settings errors limit this to liveness,
not full-schema readiness or authenticated acceptance.

CI merge `dd11cbf07a388945f4efb4a056f634778b7104cc` and the topic share tree
`5a39820c1e540738e4c1e2d27ce2bfbf2d62b49b`, checked against actual commit objects.
All four complete job logs are retained privately. Optional exact API/admin
packaging was skipped; web artifact `11614496798` is not deployment eligible
and was not downloaded/rendered. Existing conditional Gate B and D/E report
workloads remain unchanged. Local failed/skipped receipts above remain true.

This completes this bounded source verification. Email remains disabled and
not live. The next shared CAPTCHA transport correction has its own audit and
must obtain fresh verification, not inherit this green candidate.
