# Phone-code submission acknowledgement, October 9

## Scope and reproduced defect

OPS-537 corrects the existing SMS submission acknowledgement. It does not add
email/social sign-in, change the OTP policy or prove real handset delivery.
This prerequisite was found while reviewing fresh phone proof for safe linking
of a new sign-in method. The existing phone caller must not treat a rejected
SMS as an accepted verification-code submission.

The actual `sendOtpSms` / `sendSms` path returned true for 17 of 18 invalid
HTTP-200 receipts, including an empty array, a provider error object, Failed
and Refunded status, missing/invalid message IDs, an unrelated recipient and
multiple receipts. JSON null already returned false through its error handler.
The original native-HTTP run failed one test and passed two in 5.941 seconds.
The named regression asserts all 18 outcomes together so later cases are not
hidden behind the first failure. Preserve `sms-ack-original.json` / `.log`.

## Bounded correction and provider contract

The sender now requires exactly one receipt with a positive safe-integer
message ID, the requested recipient, and queued, pending or sent status.
Title/lowercase status spellings are accepted; unknown, rejected and malformed
receipts return false. Extra provider fields are not trusted or logged. The
success log explicitly says provider acceptance rather than successful delivery.

[Semaphore's API documentation](https://api.semaphore.co/docs) distinguishes
queued/in-transit/network-sent messages from failed/refunded messages. An
accepted provider receipt does not establish handset receipt or account
ownership. The application still has to verify the fresh code.

No automatic retry, new dependency, database/schema, queue, rate-limit change,
privileged login bypass, client change or gate change was added. The existing
Zod dependency validates the response. The original five native-fetch SMS unit
tests and their assertions are unchanged.

## Verification and limits

The new test redirects only the fixed external provider URL to an ephemeral
owned loopback HTTP server. Real fetch, request bytes, receipt parsing and
connection loss execute. Provider responses and recipients are synthetic.
There is no live SMS, real account mutation or deployment in this evidence.

- The first corrected selection passes three suites / 19 tests in 14.287
  seconds: three new SMS HTTP checks, five unchanged SMS tests and all eleven
  email delivery HTTP checks. API types and changed-file lint pass.
- The expanded selection passes four suites / 27 tests in 17.226 seconds,
  with eight explicit database skips. Those skips are not passing SQL evidence.
  They include the two new actual route/SQL caller cases, SEC-080's SQL case
  and the five issuer SQL cases.
- The new caller cases require actual PostgreSQL execution in CI: rejected
  SMS returns 502 in production mode, retains the hashed challenge/cooldown,
  records no successful-send attempt and issues no session; an accepted receipt
  preserves customer/provider/staff code consumption and rejects replay.
  Abuse middleware/policy/audit calls are named fixture boundaries, not proof
  of external CAPTCHA, whole-schema or live acceptance.
- Local PostgreSQL startup failed with Windows permission denied when binding
  its retained loopback test socket. No conflicting listener or matching port
  exclusion was found. The underlying permission cause is unproven; no alternate
  port, elevated retry, firewall change or foreign process action was used.
  The test instance stayed stopped and retained data was preserved.

The full local API run passes 951 suites / 3406 tests, with two TODOs, 66 skipped
suites / 128 skipped SQL tests and the two unchanged Docker-unavailable Nginx
failures, in 235.238 seconds. This is **not a green full local run**. Database
skips are explicit because the safe local database was unavailable, not a
change to test gating. The final added SQL audit-call-count assertion still
requires execution in CI. Final types/lint, Gate A ten fragments, Gate C seven
articles and all seven smoke scripts pass without changed modes/assertions.

Exact new-candidate CI must execute all five new checks, the eleven email cases,
28 guarded refund/participant cases, nine SEC-080 cases, five issuer SQL cases
and both Nginx checks, plus complete API/admin/mobile regressions, compiled
artifacts and Docker boot, before acceptance or another runtime change.
The preceding exact email candidate
`c906880b6c89a92ffb2fabd57452f55c029986aa` passed CI `37902830423` and Gates
`37902830240`; those older results do not verify OPS-537.

## Remaining phone and sign-in work

The boolean SMS contract still cannot distinguish definite rejection from an
ambiguous external outcome. Existing development missing-key simulation and
non-production caller handling are unchanged, not certified for real sign-in.
Header/body deadlines, response size, redirect handling and raw network-error
logging still need their own review and actual failure evidence before this
sender becomes a new linking-flow dependency. No broader SMS safety claim is
made by fixing acknowledgement validation.

The linking workflow still needs purpose-bound hashed challenges, fresh proof
of both methods, single-use/concurrent ownership, account-state rechecks,
privacy/export/deletion integration and configured delivery. Legacy contact
email is not verified sign-in ownership. Google/Apple/Facebook and usable signed
Android delivery remain open. Existing provider/staff admission, administrator
password/TOTP, payment isolation and matched-release requirements remain intact.
