# Phone-code transport boundaries, October 9

## Scope and real failing evidence

This bounded continuation follows the exact-source-verified OPS-537 receipt
correction at `7de317ee5cff7c2b0c867d4a2e94815f38038cc2`. It changes only the
SMS transport implementation, not OTP policy, account authority, session
issuance, schema, provider admission or the public sign-in screen. No real SMS,
account, provider key or production resource was used.

Three defects were reproduced through the actual native-fetch sender against
owned ephemeral loopback HTTP servers:

- **SEC-081:** 301/302/303/307/308 redirects all returned false success after
  reaching a second synthetic origin. The 307/308 requests forwarded the POST
  body containing the synthetic provider key, phone number and verification
  code. The other three redirects reached that origin as GET requests. This is
  a demonstrated transport behavior, not evidence of a production disclosure.
- **SEC-082:** malformed provider JSON made the real parser exception echo part
  of a synthetic key into the logger's error argument. Generic PII patterns
  cannot be relied upon to recognize arbitrary key text. The regression inspects
  the logger boundary, not a production log inventory.
- **OPS-538:** a provider that never sent headers or never ended its response
  body left the sender unresolved beyond each 12-second test observer, with the
  peer connection still open. Oversized valid-looking receipts were accepted.
  The original implementation had no application deadline or receipt-size cap.

The original five-check run failed four checks and passed the normal receipt
check in 25.447 seconds. Preserve `sms-transport-original.json` and `.log` in
the ignored intake evidence. The oversized-body test title was subsequently
corrected to say Content-Length is absent, not misleading, because only absent
Content-Length is exercised. Its original assertions were not weakened.

## Correction and caller consequences

The fixed Semaphore HTTPS destination now rejects redirects. A ten-second
application deadline covers response headers and body consumption. Reading is
limited to 4,096 actual streamed bytes, without trusting Content-Length, and
explicit reader cancellation settles a stalled response. Timer/listener cleanup
and request cancellation run on completion. Rejected responses are cancelled
without reading their error body. There is no automatic resend or new retry.

The catch path records only a fixed transport/receipt error category and the
existing phone suffix. It does not pass provider content, arbitrary exception
messages or stacks to the logger. Existing OPS-537 receipt validation remains:
one matching recipient, positive safe-integer message ID, and queued/pending/sent
status. Acknowledgement is not handset delivery or proof of account ownership.

`sendOtpSms` and its existing `auth.service` caller were reviewed in full.
The boolean return contract is preserved: production rejects an unacknowledged
submission with the existing 502 while retaining the challenge and cooldown.
An uncertain outcome could still mean the provider accepted the message; false
does not certify that no SMS was sent. Development missing-key simulation and
non-production caller handling are unchanged and are not certified live paths.
No sign-in method is enabled by this transport correction.

The older five-check fetch unit suite now supplies a real `Response` for its
accepted receipt, so its body can actually be streamed. Its network-error
expectation intentionally changes from arbitrary exception text to the fixed
private diagnostic category. Request/result assertions remain; the new SEC-082
test adds the actual malicious-body non-disclosure assertions. No test was
skipped, no timeout raised and no gate/assertion was weakened to hide a failure.

## Executed verification

The HTTP fixture changes only the fixed provider destination to an owned
loopback origin. Native serialization, redirects, parser, streams and aborts
execute. Each case owns a fresh origin and awaits cleanup, avoiding pooled
connection reuse across forced fixture shutdown. Tests do not establish remote
TLS identity, external provider behavior or actual phone delivery.

- First corrected selection: six suites / 24 passed checks, two explicit SQL
  skips, 32.438 seconds. This used the initial five new checks.
- Final expanded connected selection: seven suites / 34 passed checks, one
  suite / eight SQL checks skipped, 32.810 seconds. All seven new checks execute.
  The selection includes existing SMS, email, CAPTCHA and issuer tests; skipped
  actual database cases are not passing SQL evidence.
- The final seven new checks cover all five redirect statuses, private parser
  diagnostics, actual missing-header and stalled-body cancellation, oversized
  chunked responses, normal success, the exact 4,096-byte boundary versus an
  unfinished 4,097-byte stream, and cancellation of an unfinished 429 response.
  Peer connection closure and exactly one request are observed, not inferred
  only from a returned boolean or an AbortSignal flag. Timers are real.
- Full local API: **954 suites / 3,413 tests passed; two failed suites/tests,
  66 skipped suites / 128 skipped tests, two TODOs**, 210.590 seconds. All seven
  new checks execute and pass. The two failures are the unchanged Nginx checks
  because Docker Desktop's Linux engine is unavailable. This is **not a green
  full local run**. The retained safe PostgreSQL instance remains stopped after
  the preceding Windows bind-permission failure; no alternate-port, elevated,
  firewall or foreign-process workaround was used.
- Final API types and changed-file lint pass. Local Gate A ten fragments,
  Gate C seven articles and all seven gate-smoke scripts pass unchanged.
  There are no dependency, workflow, mode, gate or assertion-relaxation changes.

Exact new-candidate CI remains required before another runtime function changes.
It must execute all seven new checks, all five OPS-537 checks including their two
actual PostgreSQL/HTTP callers, eleven email checks, 28 refund/participant checks,
nine SEC-080 checks, five issuer SQL checks and both Nginx checks, alongside full
API/admin/mobile regressions, compiled clients and actual API Docker build/boot.
The predecessor's completed CI does not verify this new correction.

### Subsequent exact-source completion

Candidate `f2d090e12b8eb348aaa90c59a254c587465d35de` completed CI
`37908585031` and Gates `37908585041` successfully. Actual API logs pass
1022 suites / 3543 tests, two TODOs, no failures/skips, in 91.347 seconds.
All seven new transport checks, five OPS-537 checks including two real database
callers, eleven email checks, 28 refund checks, nine SEC-080 checks, five issuer
SQL checks and both Nginx regressions execute/pass. Admin passes 706 tests with
one skipped file/three TODOs and types/build; mobile passes 879 tests/84 TODOs
and types/compiled web. Actual API image build and served `/health` pass.
Merge `ca6fb5f77e0280c74998929332ec1eca3d5be590` and topic share tree
`54f254640a746f4438410e13a17ddffd1546c401`. Optional exact API/admin packaging
was skipped; retained web artifact 11605363824 is not deployment eligible and
was not downloaded/exercised. The failed/skipped local receipt above is retained,
not rewritten as green. This completes source verification only.

## Remaining work and release boundary

The shared SMS boolean contract still conflates rejection and uncertain external
acceptance. Provider outage/reconciliation, real delivery configuration, fresh
purpose-bound account linking, owned-email identities, single-use challenges,
privacy/export/deletion, Google/Apple/Facebook adapters and complete browser/native
acceptance remain open. Legacy contact email must not silently become sign-in
ownership, and administrator password/TOTP remains separate.

This is candidate source only, not a deployed fix, successful external delivery,
email/social login or APK. The existing private live access guide is unaffected.
Matched-image/client rehearsal, backup/rollback, configured authentication and
live acceptance still gate release. See the preceding
[SMS acknowledgement audit](SMS-ACKNOWLEDGEMENT-2026-10-09.md) and
[email delivery audit](EMAIL-CODE-DELIVERY-2026-10-09.md).
