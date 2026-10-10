# Verified email sign-in transaction, October 9

## Scope and status

This candidate adds the internal proof/session operation that follows the
verified-email linking stage. It is **not a public email sign-in endpoint,
delivered email, client screen or live feature**. No new sign-in method is
enabled. No production account, sender, service, database or native worktree
changed. The separate administrator password/TOTP boundary stays in place.

The preceding `db0255772667d8be29144ea05c5f893f9ef6bfb5` completed CI
`37918764034` and Gates `37918764050`: API 1025 suites / 3581 tests, two TODOs,
no skips/failures, all fifteen email-link HTTP checks and twenty-one foundation
checks, affected lifecycle/issuer/refund checks and both Nginx checks. Admin
passed 706 tests with one skipped file / three TODOs and types/build; mobile
passed 879 tests / 84 TODOs and types/compiled web. API Docker build and boot
liveness passed, not full-schema readiness. Merge
`093d8970643bf4df93cabdbfae8552c516c06581` and topic share tree
`649fc77479ab1b62d7a029322b4797af79a3140a`. Optional exact API/admin release
packaging was skipped; web audit artifact `11610108266` is not deployment
eligible or a browser acceptance journey. This verifies the preceding linking
stage only, not the new code described here.

## Contract

- Only explicit `sign_in_email_identities` ownership is considered. A legacy
  contact email never links, creates, merges or upgrades an account. Eligible
  owners are currently active, phone-verified customers/providers/provider staff.
  Staff membership and provider admission are still enforced by their own APIs.
- Migration 178 appends a purpose-specific challenge table. It does not replace
  earlier migrations or backfill identity. Known proofs bind UUID, recipient
  digest, owner, exact identity proof, role, session generation and phone into
  a salted scrypt hash. Plaintext codes/emails and session credentials are not
  stored in this table. Recipient digests remain private personal metadata,
  not anonymous data.
- Preparation has hard recipient/IP limits of five requests/hour and a
  sixty-second recipient cooldown, including unknown recipients. IPs and email
  case are normalized. Account-first locks and sorted advisory rate buckets
  serialize competing starts. An explicit later request invalidates the old one.
- Unknown/ineligible addresses get unowned decoys with the same hash cost and
  no delivery payload. The internal result deliberately includes a private
  delivery instruction only for eligible owners. **It must never be serialized
  as the anonymous HTTP response.** This is not timing-equivalence, neutral
  public discovery or external delivery acceptance.
- Completion locks current account before challenge, uses database clock expiry,
  commits incorrect attempts and invalidates after three attempts. A correct
  code must still match current active/verified role, generation, phone and
  verified identity. Linking proofs cannot substitute for sign-in proofs.
- The existing canonical issuer is extracted into a transaction-aware internal
  helper. Its original standalone wrapper retains current-authority checks,
  token format/lifetimes and existing callers. The email verifier uses that
  helper in its own transaction, not a nested transaction under an account lock.
- Refresh credential storage, login metadata, a minimal audit event and proof
  consumption commit together. Suppressed/missing writes fail closed. Expiry
  after a real audit wait rolls back tentative credentials/metadata/audit to a
  savepoint before invalidating the proof. Tokens return only after COMMIT.
- Concurrent consumption commits one login. Replay never returns credentials.
  A lost post-commit response requires a fresh sign-in, not a persistent token
  response cache or reuse of the spent code. Actual OS process-death/browser
  delivery acceptance is not established by the SQL failure tests.
- Owner exports include state, attempt count, IP and dates, never challenge IDs,
  recipient digests, hashes, identity proof IDs or credentials. Existing partial
  anonymization erases owned challenge rows in its account-first transaction.
  Unowned decoys use bounded expiry/retention rather than invented ownership.
- The existing five-minute email cleanup job also processes at most 100 sign-in
  expiries and 100 old terminal requests. Locks skip other active work; a failed
  batch rolls back and retries safely. Recent abuse counters, verified identities,
  account state, sessions and audits are not cleanup targets. Ninety-day request
  metadata retention is an engineering default, not qualified E21 legal approval.

No new dependency, permanent process, listener or queue is added. Existing
phone/admin proof semantics, payment paths and provider admission do not change.
There was no prior public email login implementation to reproduce as a legacy
bug. An absent module/route is not claimed as a security regression baseline.

## Verification

`email-sign-in-postgres.test.ts` contains 33 checks: one pre-database input test
and thirty-two actual PostgreSQL cases. Before schema creation it verifies the
actual loopback TCP peer, requested port and exact `*_test` database; unsafe CI
configuration fails at module load. The scoped UUID/FK fixture applies actual
migrations 175 through 178, not the full restored production chain.

The cases exercise all three marketplace roles and existing refresh credentials;
real dual-code linking followed by customer email login; unknown/contact-only
and privileged/unknown-role decoys; concurrent one-time consumption; durable
wrong attempts; purpose and recipient substitution; role/generation/phone/
active/verified/identity changes; a real account lock wait; expiry during a real
audit lock wait; actual failed or suppressed refresh/login-metadata/audit/consumption writes;
case/IP abuse limits; owner export and failed/successful partial anonymization;
bounded expiry, retention, concurrent locked cleanup and cleanup rollback.

Only unrelated export reads are replaced with empty fixture results in the
focused export case; the new owner query and all new transaction/cleanup SQL
execute against PostgreSQL. No real account, code delivery or external identity
provider participates. Scheduler tests exercise the real processor with mocked
queue and cleanup services, not a running Redis worker.

Initial local focused verification passed four suites / eight unit checks, with
62 explicit SQL skips, in 29.365 seconds. Review then added an actual row-count
check for login metadata and two SQL failure/suppression cases. The reviewed
focused repeat passed four suites / eight unit checks, with 64 explicit SQL
skips, in 2.603 seconds. The thirty-two new database cases have **not executed
locally**. Local PostgreSQL remains unavailable after the retained bind
permission failure; no alternate-port/elevation workaround was used. An initial
command referenced the wrong Jest config extension and failed before tests ran;
the corrected command uses the repository's existing `.cjs` configuration.
API TypeScript and changed-file lint pass. Gate A's ten fragments, Gate C's
seven articles and all seven gate smoke scripts passed without gate/mode changes.

The first complete local API run exited 1 in 313.767 seconds: 958 suites / 3421 tests
passed, 66 suites / 190 tests skipped, two TODOs and two failed suites/tests.
Only the unchanged UX860/UX201 Nginx checks failed because Docker Desktop's
Linux engine was unavailable. The thirty then-existing new SQL cases remained
skipped, not accepted. This is not a green full regression run. All five unsafe CI URLs
(remote host, non-test database, wrong protocol, query and fragment overrides)
were rejected before connection/schema creation with zero tests executed.
Exact-candidate CI and actual database execution remain mandatory.

The final reviewed full API repeat exited 1 in 379.151 seconds: 958 suites /
3421 tests passed, 66 suites / 192 tests skipped, two TODOs and the same two
Docker-unavailable Nginx failures. All thirty-two new SQL cases were discovered
but skipped. Typecheck, changed-file lint and Gate A/C/seven-smoke repeats passed.
Both original and reviewed receipts remain retained; neither is a green local
full run or new SQL acceptance.

## Before advancing or enabling

Require all 33 new checks to execute, affected linking/lifecycle/issuer callers,
both Nginx checks, full API/admin/mobile regressions, compiled artifacts and API
Docker build/boot at this exact candidate. Skips and preceding green CI are not
acceptance. Correct real failures without changing assertions or weakening gates.

After that source verification, finish neutral public HTTP, CAPTCHA and delivery
coordination, cookie/native session transport, then role-aware email linking and
sign-in UI with actual configured provider/inbox, refresh/logout/reload and error
journeys. No public handler may expose the private preparation result or infer
delivery from a configured sender. Safe phone-required onboarding, Google/Apple
stable-subject adapters and Facebook evaluation remain unfinished.

Before live enablement, rehearse the complete selected image and migrations
through 178 on an isolated restoration, prove backup/rollback and historical
preservation, and validate matched API/admin/customer-provider artifacts and
controlled authenticated web/native acceptance. The existing private test guide,
live payment restriction, APK/signing/update and broader launch limitations remain.

## Completed exact-source verification

Candidate `5deb00aee0e5408500d5b703d70983c1683209fa` completed CI
`37922879922` and Gates `37922879915` successfully. Actual API logs pass
1026 suites / 3615 tests, two TODOs and no skips/failures in 115.782 seconds.
All 33 sign-in checks, 21 linking-foundation checks, 15 linking-HTTP checks,
affected lifecycle/export/scheduler/issuer/refund tests and both Nginx checks
execute and pass. The failed/skipped local receipts above remain unchanged.

Admin passes 598 files / 706 tests, one skipped file / three TODOs, types and
production build. Mobile passes 595 suites / 879 tests, 84 TODOs, types and
compiled web export. Actual API Docker build and `/health` boot liveness pass;
the blank test database's missing platform settings are not readiness evidence.
Merge `36ec4bfb6300e86416208eb9517ec2f01ac35fad` and topic share source tree
`65b1d9951fc0f51eb8e59ad9fb18033f7c660bbf`. Web audit artifact `11612558745`
is not deployment eligible and was not downloaded or exercised as a browser
journey. Optional exact API/admin release packages were skipped. Existing Gate B
conditional dispatch and D/E report-workload limits are unchanged.

This completes source verification of the internal transaction, not public
delivery, UI or live acceptance. The next connected stage is recorded in
`EMAIL-SIGN-IN-HTTP-2026-10-09.md`; it needs its own exact-source verification.
