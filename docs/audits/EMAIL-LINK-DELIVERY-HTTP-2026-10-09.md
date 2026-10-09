# Authenticated email-link delivery and HTTP, October 9

## Scope and status

This continues exact-source-verified cleanup `7bb06275`. It is an opt-in API
workflow for an already signed-in customer, provider or provider-staff member
to prove their existing phone and a new email. It is **not public email login,
session issuance, a completed client screen or a live feature**. The new switch
`EMAIL_LINKING_ENABLED` defaults off. No real message, account, sender setting,
production database, server or native worktree changed.

The preceding foundation already requires both fresh codes and locks current
account authority before identity/proof/audit changes. This stage connects it
to configured external delivery and owner-bound HTTP. Legacy contact email is
not copied, rewritten or trusted for account linking. Phone registration/login,
provider admission and administrator password/TOTP contracts are unchanged.
There was no prior public implementation of this linking workflow; an absent
route/module would not be an honest reproduced legacy security bug. No such
red-baseline claim is made.

## Contract

- `/api/v1/account/sign-in-email` requires canonical authenticated marketplace
  role and session generation, with cookie CSRF following the actual credential.
  Admin, super-admin and DPO are excluded. Responses and errors are private/no-store.
- GET returns the owner's linked email and latest eligible request, masking the
  phone to four digits. It does not send, expose codes/hashes, or issue credentials.
  A changed role, generation or phone hides the old request from a new session.
- POST `/requests` requires a strict email/CAPTCHA body, existing HTTP rate
  middleware, a configured CAPTCHA secret and successful verification. It never
  uses the verifier's missing-secret development bypass. The existing hard
  account/recipient/IP limits and cooldown remain authoritative inside the DB.
- Both SMS and email configuration must be present before challenge creation.
  Blank/placeholder SMS credentials never inherit simulated development success.
  Configured values are not proof of sender/domain/inbox operation.
- Creation commits hashed, purpose-bound proofs. A separate account-first
  transaction rechecks authority, phone, challenge state and actual database
  expiry, then claims both deliveries before any external call. Claim failure
  sends no code. No database lock remains held across provider network requests.
- Each factor is submitted once in this invocation. SMS explicitly describes
  adding a sign-in email, with fixed Philippine-time expiry and a non-sharing
  warning. Email uses the existing purpose-specific, fixed-body idempotency sender.
  No plaintext code is placed in a queue, persistent row, audit or client response.
- HTTP 202 accepts the workflow request, **not successful delivery**. Its separate
  phone/email outcomes retain provider acceptance, rejection or uncertainty.
  The SMS boolean cannot distinguish refusal from lost acceptance, so false is
  conservatively unknown. Accepted is not inbox/handset delivery or ownership.
- Migration 177 adds per-factor receipts and checked timestamps to existing
  challenges. Earlier history is unchanged. A claim left attempting is reported
  as unknown after a lost response/process/receipt write. No automatic resend or
  claim takeover is introduced. GET recovers status without sending. An explicit
  later new request obeys cooldown and invalidates the previous proof.
- Receipt writes cannot reopen completed/invalidated challenges. The POST result
  remains bound to its original operation even if a newer request exists. Current
  account authority is rechecked before returning it. Already accepted external
  messages cannot be recalled by later revocation, but cannot establish ownership.
- POST `/:id/confirm` requires both six-digit proofs for that owner and operation.
  Failed attempts commit; expiry, generation, role and phone are rechecked under
  locks. Completed replay retains the same identity/audit, not a new session.
  Sender downtime alone does not reject codes already received. Disabling the
  whole feature does block confirmation. No replacement-email workflow is implied.
- Owner exports explicitly include receipt status/timestamps, not proof IDs,
  codes or hashes. Existing soft anonymization deletes these complete request
  rows. Existing bounded expiry and ninety-day request cleanup apply unchanged.

No new dependency, permanent listener, worker or queue is added. This is not
general HTTP idempotency/response-cache acceptance. A repeated start is a new
operation, not a retry of delivery. A lost code requires explicit fresh initiation
after the cooldown; it cannot be reconstructed from the stored hashes.

## Verification and limits

The new `email-link-http-postgres.test.ts` has fifteen checks: two pre-database
unit checks and thirteen actual PostgreSQL/mounted-HTTP cases. It rejects unsafe
CI connection configuration before connecting, verifies the actual loopback TCP
peer/port and exact requested `*_test` database before schema creation, and applies
actual migrations 175/176/177 in an owned schema. Unrelated lifecycle tables are
synthetic fixtures, not a complete restored production-chain rehearsal.

JWT parsing, canonical account reads, request validation, CAPTCHA call, linking
transactions, SMS/email serialization and native fetch execute. Only the external
fixed provider URLs are redirected to a fresh owned loopback HTTP origin; HTTP
rate-limit middleware and logging are mocked. Hard database abuse limits execute.
These boundaries do not prove real provider delivery, Redis rate limiting, an
authenticated browser/native journey or live credentials.

The cases cover all three marketplace roles; unauthenticated/private responses;
feature, strict input, CAPTCHA, CSRF, purpose, role and revocation guards;
rejected/unknown provider outcomes; real receipt-write and claim-write failures;
concurrent starts and foreign-owner denial; late receipts after invalidation and
replacement; revocation during real pending HTTP; incorrect/expired proof handling;
confirmation during sender outage; actual receipt constraints and private owner
export. Proof confirmation asserts unchanged roles/contact fields/session count,
one identity/audit and cleared hashes. Existing foundation/cleanup checks remain.

Initial local selection: three suites / fifteen passing checks, twenty-eight
SQL skips, 34.934 seconds. Reviewed selection: three suites / fifteen passing
checks, thirty-two SQL skips, 12.738 seconds. Those skips are **not database
acceptance**. Local PostgreSQL remains unavailable after the retained bind
permission failure; no alternate-port/elevation workaround was used. Types and
changed-file lint pass.

The full local API run finished with exit 1 in 273.175 seconds: 957 suites /
3,419 tests passed, 66 suites / 160 tests skipped, two TODOs, and two failed
suites/tests. Only the unchanged UX201/UX860 Nginx checks failed because Docker
Desktop's Linux engine was unavailable. All thirteen new database cases remain
skipped locally. This is **not a green full regression run** and does not accept
the new SQL workflow. Gate A's ten fragments, Gate C's seven articles and all
seven gate-smoke scripts passed without mode, assertion or allowlist changes.
Exact-candidate CI and actual database execution are still required below;
the preceding candidate's success is not inherited.

Five unsafe CI configurations (remote host, non-test database, wrong protocol,
query override and fragment override) were rejected at module load with zero
tests executed. The shared account fixture rejects the first two; the new
HTTP suite rejects the remaining three. No connection or schema creation is
part of those expected failures.

## Before advancing or enabling

Require actual execution of all fifteen new HTTP checks and all twenty-one
foundation/cleanup checks, affected account/export/auth regressions, both Nginx
checks, full API/admin/mobile tests and compiled artifacts plus API Docker
build/boot on this exact source. Do not weaken assertions or count skipped SQL
as success. No next sign-in runtime stage changes before that verification.

Then complete verified-email login/session issuance and neutral discovery,
role-aware linking/sign-in client screens and actual provider configuration.
The inherited CAPTCHA verifier's transport deadline/response bounds still need
review; this integration does not certify that whole outbound client. SMS has
the existing ten-second network bound, not a shortened-by-proof-expiry timer;
an expired delivered code still fails the database's proof check. Actual OS
process death, provider delivery and full resource/capacity acceptance are not
established by the receipt-write trigger test.

Google/Apple stable-subject adapters, Facebook evaluation, safe phone-required
onboarding and complete web/native redirect, logout and account-switch acceptance
remain unfinished. Before live enablement, rehearse the full selected image and
migrations through 177 on an isolated restoration, prove preservation and rollback,
then verify matched API/admin/customer-provider builds and actual controlled
delivery/sign-in. No live new-method button or APK is delivered by this slice.
