# Email verification delivery foundation, October 9

## Status and scope

Email, Google, Apple and Facebook sign-in are **not implemented or enabled by
this slice**. Ken requested those methods explicitly; the existing phone-only
login is not the final product. This is one internal, tested delivery primitive
needed by the forthcoming verified-email workflow, not a completed user journey.

Source inspection found Resend environment examples but no existing API email
sender. The new service uses that already named provider through native fetch,
with no new dependency, queue, database table, persistent server resource,
public send endpoint or change to phone/admin authentication. It does not touch
Admin Notification Templates or turn their email markers into live messages.
No production environment, sender account, domain, credential or message changed.

The predecessor `1e9f4ad0ce73a7d98b321af582425340cc82daf8` completed CI
`37898457350` and Gates `37898457325`: API 1017 suites/3520 tests, two TODOs,
all 28 guarded refund/participant checks, nine SEC-080 cases, five issuer SQL
cases and both Nginx checks passed. Admin passed 706 tests with one skipped
file/three TODOs; mobile passed 879 tests/84 TODOs and compiled web export.
API Docker build/boot passed. Merge `c0085c293de5d20180d2bc12be0d0c2917482f25`
and topic share tree `061118e0a086b15d2119be5f2aa41430ad1e17b9`. Optional
API/admin release packaging was skipped. This completes the preceding source
checkpoint, not acceptance of this newer delivery function or a deployment.

## Delivery contract

`email-code-delivery.service.ts` accepts an immutable challenge ID, one email,
six-digit code, sign-in/link purpose and future expiry no more than ten minutes
away. It does not generate, store or verify the code. The future canonical
workflow must own hashing, purpose, limits, single consumption and account proof.

- `EMAIL_AUTH_DELIVERY_ENABLED=1`, a usable `RESEND_API_KEY` and valid plain
  `EMAIL_FROM` are all required. Default is off. Missing/placeholder configuration
  returns unavailable in production, development and test alike. No fake success.
- One recipient, fixed purpose-specific plain text, no CC/BCC and no code in
  the subject. Email local-part case, plus addressing and dots are preserved.
- The provider URL is fixed to HTTPS. Redirects fail instead of forwarding
  credentials or the code to another destination.
- Retries of one immutable challenge reuse the same key and body. Fixed expiry
  formatting avoids changing the payload just because a second has elapsed.
  A new code/challenge must have a new ID; a changed payload with the same ID is
  rejected by the provider, not silently submitted under another key.
- A valid successful receipt means **provider acceptance**, not inbox delivery,
  verified ownership or a usable session. Explicit provider rejections remain
  rejections; connection loss, server errors and malformed receipts are unknown.
  Unknown attempts are not automatically resent with a new code or key.
- Headers and response-body handling share a ten-second maximum, shortened by
  challenge expiry. Receipt bodies are capped at 4096 bytes. The deadline also
  cancels an active body reader. No response/request body, address, code, key or
  raw exception is logged.

Provider contracts checked against primary documentation:
[sending](https://resend.com/docs/api-reference/emails/send-email),
[idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) and
[verified domains](https://resend.com/docs/dashboard/domains/introduction).
Resend documents a 24-hour idempotency window. That is not permission to resend
an expired sign-in code. A configured sender string does not prove domain
verification or inbox delivery.

## Verification and retained failures

`email-code-delivery-http.test.ts` redirects only the external provider
destination to an ephemeral owned loopback HTTP server. Real fetch,
serialization, headers, response parsing and cancellation run. Provider
acceptance/idempotency/error responses are synthetic; no real email was sent.

The initial pre-implementation run failed to load the absent module, with zero
tests executed. It is not a reproduced pre-existing production defect.
The first implemented ten-case run passed nine and failed the stalled-body
deadline at the unchanged 20-second test limit. A focused unchanged rerun failed
again; an instrumented probe confirmed the signal fired while the body reader
still waited. A separate plain-Node short abort probe passed, so this does not
establish that every Node environment has the same propagation behavior.
Explicit reader cancellation corrected the observed HTTP regression without
raising the timeout or weakening the assertion. The first corrected selection
passed two suites/15 tests in 10.734 seconds, including five unchanged SMS tests.

Final reviewed tests additionally require the server response to close after
cancellation and check a stalled pre-header request against challenge expiry.
All eleven new HTTP cases plus the five unchanged SMS tests pass in 12.200
seconds, without skips/TODOs. API types and focused lint pass. The initial lint
found an undefined global type and missing callback return annotation; these
were fixed in source types, not suppressed in lint configuration.

Private evidence prefix: `email-delivery-`. Keep initial failures and passing
repeats separately. The full local API run with the actual isolated PostgreSQL
fixture passed 1016 suites/3528 tests, with two TODOs and no skips, in 361.133
seconds. Two unchanged Nginx tests failed because the Docker Linux engine is
unavailable, so this is **not a green full local run**. This full run loaded the
earlier ten-case email file; its successful count does not include the later
eleventh case or connection-close assertions, which passed in the reviewed
selection above. All 28 refund/participant, nine SEC-080 and five issuer SQL
checks executed/passed. The final combined selection passed five suites/58
tests in 24.136 seconds with no skips/TODOs: all eleven email HTTP cases,
five SMS, nine SEC-080, 28 guarded refund/participant and five issuer SQL checks.
Final local Gate A ten fragments, Gate C seven articles and seven smoke scripts
passed again. Exact-candidate CI remains required after publication.
Existing Gate B conditional dispatch and D/E report-workload limits remain.
No gate or workflow changed.

The owned isolated PostgreSQL instance was stopped after fresh exact database,
user, loopback port and data-directory checks, with zero generated schemas,
other clients or owned test runners remaining. Process/listener absence was
verified; data was retained. No foreign PostgreSQL process was stopped. The
email HTTP listeners were ephemeral and test-owned, not permanent services.

## Exact CI fixture failure and isolation correction

Published foundation `4cfa071db97dd6bc8398c3fbfc3390889e9b56f6`, tree
`e5bc72fe0f6e605bc4fc8dcbb5d4647ab3876dfa`, failed CI `37901590649`.
Gates `37901590570` passed, but this is not function acceptance. The API
passed 1017 suites/3530 tests, with two TODOs and one failed email test, in
78.628 seconds. EMAIL-05 expected accepted and received unknown. The other ten
email checks, all 28 refund checks, nine SEC-080, five issuer SQL and both Nginx
checks passed. Admin and mobile jobs succeeded; dependent Docker build skipped.
Retain `email-delivery-ci-api-original.log`; do not substitute the predecessor's
green build or rerun the failing fixture until it happens to pass.

The test reused one HTTP listener/origin for the whole suite but force-closed
its connections after every case. A plain Node/native HTTP probe reproduced
30 connection resets in 30 next-case sends to that reused origin; fresh owned
origins passed all 30. The fixture was racing fetch's pooled keep-alive sockets.
The service correctly treated the reset as unknown, rather than claiming that
mail was accepted. No production send retry or relaxed success condition was
introduced to hide it.

Each test now creates its own loopback listener/origin and awaits its shutdown
before the next test. All original eleven assertions and timeout bounds remain.
The corrected email and unchanged SMS selection passes two suites/16 tests,
without skips/TODOs, in 11.804 seconds. API types and focused lint pass. Local
Gate A ten fragments, Gate C seven articles and seven smoke scripts pass again.
The runtime delivery service, dependencies, database, workflow and gates are
unchanged. No PostgreSQL restart or production resource was needed for this
fixture correction. A fresh exact-candidate full CI/Docker run is still required.

### Completed fixture-correction CI

Candidate `c906880b6c89a92ffb2fabd57452f55c029986aa` completed CI `37902830423`
and Gates `37902830240` successfully. Actual logs passed all 1018 API suites /
3531 tests, two TODOs and no skips/failures, including all eleven email checks,
28 guarded refund/participant cases, nine SEC-080 cases, five issuer SQL cases
and both Nginx checks. Admin passed 598 files/706 tests, one skipped file/three
TODOs, types and build. Mobile passed 595 suites/879 tests, 84 TODOs, types and
compiled web export. Actual API Docker build and liveness boot passed.

CI merge `850d3a9cb7bf74c1c157938e2f1e62cf78e7b060` and the topic share tree
`d438b19032d8e82395790952757135a228d5b0d7`. Optional exact API/admin release
packaging was skipped. The retained browser audit is not a deployment or an
authenticated journey. Conditional Gate B and D/E report-workload limits remain.
The prior failed CI and failed local Nginx receipts are retained, not rewritten.
This completion receipt accompanies the related OPS-537 SMS correction, not
a documentation-only CI loop. No live email sender or sign-in method was enabled.

## Remaining ordered implementation

1. Establish verified sign-in identities and fresh-factor account linking.
   `users.email` is legacy contact data, not verified login ownership. Existing
   staff invitations already compare it, so new identity verification must not
   silently rewrite contact fields or grant membership through an email match.
   Never auto-merge accounts, change provider approval or bypass admin TOTP.
2. Persist hashed, purpose-bound, expiring challenges and durable delivery
   outcomes with abuse limits, neutral discovery, single-use verification and
   concurrency/rollback/revocation tests. Wire this internal sender only there.
   A refreshed access-token issue time is not fresh factor proof.
3. Verify the actual business sender/key/domain and controlled recipient
   delivery privately. Local ordinary environment-file inspection did not find
   usable Resend login configuration; server/private accounts remain uninspected.
   Do not infer that the business has no account or bypass denied DNS access.
4. Complete email onboarding/sign-in/linking UI and API together, retaining
   phone-required marketplace contracts until all phone-less callers are reviewed.
   Then implement Google/Apple stable-subject verification and evaluate Facebook.
5. Complete browser/native and matched-artifact acceptance before showing live
   buttons. Production remains on the separately recorded old image with narrow
   SEC-075 containment. A source test, provider acceptance receipt, UI toast or
   HTTP health response is not real multi-role login acceptance.

The 124 historical findings are unchanged: 117 unreconciled, seven partial,
zero closed. The new requirement does not erase the refund, provider lifecycle,
privacy, native-update, external-payment, legal or release limitations.
