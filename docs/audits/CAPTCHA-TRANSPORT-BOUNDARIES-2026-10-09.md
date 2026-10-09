# Shared CAPTCHA transport boundaries, October 9

## Scope

This bounded correction changes only the shared server-side CAPTCHA verifier
and its private body reader. It precedes exposing email sign-in in the client.
It is not deployed, not real Cloudflare widget acceptance, and does not enable
email or social sign-in. Phone, authenticated email linking and public email
request callers retain their existing authority, limits, failure responses and
proof contracts. Administrator password/TOTP is separate.

The preceding `9c0d3759` completed CI `37926401909` and Gates `37926401967`.
Its exact receipt is appended to the email HTTP audit with this related runtime
change. That preceding result does not verify this correction.

## Reproduction on the unchanged verifier

- SEC-083: actual native HTTP followed 301/302/303 to GET and 307/308 to POST.
  All five returned true; the latter two forwarded the synthetic secret/proof
  form body to a second owned origin. The regression requires all false and
  zero receiver requests. No real provider or credential was used.
- SEC-085: actual 400/403/429/500/503 responses containing `success:true` all
  returned true. The verifier must reject the status before consuming its body.
- OPS-539: actual missing headers and unfinished bodies both outlived independent
  12-second observers with the peer still open. A 4,097-byte successful-looking
  response was accepted. Oversized/rejected unfinished bodies also outlived
  their short observers instead of closing promptly.
- SEC-084: the initial native malformed-JSON case in Jest reported `Unknown`
  due to the exception's realm, not a reproduced private-text leak. Its initial
  failure was only the expected diagnostic category. A separate same-realm
  injected transport exception subsequently reproduced the real logger branch
  exposing synthetic secret/proof bytes. Keep that distinction: no historical
  production exposure or native-parser disclosure is claimed.

Original four-suite report: six failed, one passed, seven tests, 28.946s.
Separate original privacy report: two failures, 0.476s, including the actual
private-text assertion. Both original reports remain retained privately.

## Narrow correction and consequences

- Fixed HTTPS Siteverify destination and form fields remain; `redirect:error`
  prevents another destination receiving those bytes. No automatic retry.
- Non-2xx status always returns false and cancels its body, even if it contains
  a success field. Successful bounded JSON must be an object with literal true.
- One ten-second deadline spans headers and body. An abort cancels the reader;
  completion clears the timer and aborts any remaining request work.
- The reader counts actual streamed bytes, not the claimed Content-Length or
  character count. Complete 4,096-byte responses are allowed; oversized streams
  stop before JSON parsing. A multibyte UTF-8 test checks the byte distinction.
- Exceptions use a fixed private diagnostic category, never provider text.
- Existing missing-secret relaxed-test behavior is unchanged. Email callers
  still separately reject missing configuration, even in development. No OTP
  lockout threshold, role, phone policy, account lookup, session, schema,
  dependency, workflow, gate or test assertion was weakened.

The transport bound follows the existing bounded SMS/email pattern. Cloudflare's
[server-side validation contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
requires server validation and single-use expiring proofs. The ten-second and
4,096-byte limits are local safety bounds, not a claimed provider SLA. Real
configured site-key/secret/hostname/action and browser/native challenge behavior
still need acceptance. A timeout returns false, not proof that Cloudflare did
not consume the token; client recovery needs a fresh challenge, not blind replay.

## Verification

Eight new service tests use owned loopback HTTP, native serialization, redirect,
stream, parsing and cancellation behavior. Only the fixed destination and
diagnostics are replaced; SEC-084's injected exception is explicitly separate.
Two additional mounted caller tests exercise real native Siteverify error
responses: phone rejects without sending an OTP/SMS and public email rejects
without a request receipt, database transaction or delivery preparation.
No mock-only response-body promise is used to claim peer closure.

Initial connected run: eight suites / 22 passed / 33 SQL skips, 22.17s.
Reviewed caller-extended run: eight suites / 24 passed / 33 SQL skips, 23.224s.
The new eight transport checks and both caller checks execute locally; SQL
checks require exact-source CI. Local PostgreSQL bind-denial policy remains
respected, no foreign database or process was touched. Native worktree pending
changes remain separate.

Full local run: **963 suites / 3434 tests passed**, 66 suites / 211 tests
explicitly skipped, two TODOs and two unchanged Docker-unavailable Nginx
failures, 260.911s. All eight new transport checks and both new caller checks
passed. This is not a green full run or actual local SQL acceptance.

The first typecheck passed; lint rejected the new `AbortSignal` type name under
the existing no-undef configuration. The annotation now uses the existing
`AbortController['signal']` pattern without changing configuration. Before/after
TypeScript emission hashes are identical
(`a01fb978c1ac6dd7b07c5c9166265ffc2ca4b7314216f921f71d15f64c479383`).
The full local run above preceded this type-only edit. Final focused repeat
passes eight suites / 24 tests with 33 SQL skips, 22.934s; final types/lint pass.
Gate A's ten fragments, Gate C's seven articles and seven smoke scripts pass
unchanged. Original failed lint and failing/skipped test receipts are retained.

Before another function changes, require exact-candidate API execution including
all eight transport tests, ten SEC-080 phone checks, 23 email-sign-in HTTP checks,
existing linking/identity/issuer/refund regressions and both Nginx checks, plus
complete admin/mobile tests, types/builds/compiled web and API image build/boot.
Preceding green CI does not certify this correction. Optional release packaging
and existing report-mode gates are not authenticated release acceptance.

No new live method, sender/key configuration, APK, provider approval, privileged
shortcut or release is claimed. Full selected-image migration-chain restoration,
backup/rollback and matched API/admin/customer-provider browser/native acceptance
remain required before synchronizing production. All 124 historical findings
retain their separate reconciliation status; these corrections do not close
the whole sign-in, money, admin feasibility or launch program.
