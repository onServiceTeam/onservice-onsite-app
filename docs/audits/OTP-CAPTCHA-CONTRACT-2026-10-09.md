# OTP CAPTCHA request contract: SEC-080

## Status and scope

Correction locally verified on the topic source based on `f87b20b3`, prepared
for publication in PR 81. Exact-candidate CI, packaging and deployment remain
separate requirements. This is not
email/social-login implementation or complete live CAPTCHA acceptance.

During the customer/provider sign-in expansion review, the shared phone flow
had a reproducible request-contract failure. The app sent `captchaToken`, but
`sendOtpSchema` did not declare it. The real Zod middleware removed that field
before the real route checked it. A challenged user therefore received another
HTTP 428 even after supplying a challenge result. The older SEC-002 description
of complete code wiring did not establish this actual request round-trip.

The correction declares an optional nonempty opaque token with Cloudflare's
documented 2048-character maximum. It does not accept the token as proof: the
existing server-side Siteverify result still decides whether OTP sending is
allowed. Account lockout remains authoritative. No challenge bypass, relaxed
limit, role-policy, migration, dependency, workflow or gate change was made.

## Reproduction and verification

`packages/api/__tests__/bug-sec-080-otp-captcha-contract.test.ts` mounts the
actual Express auth router, validation middleware and error handler, and runs
the actual Siteverify adapter. External challenge responses and SMS delivery are
controlled fixtures, never real outbound challenges or messages. Abuse policy
and audit side channels are controlled to select the relevant route branches.

The nine checks cover:

1. Initial 428 challenge followed by the exact supplied token reaching Siteverify
   and successful OTP-request response, preserving the device fingerprint.
2. Failed/expired/replayed provider result rejected with 403 and no SMS request.
3. Account lockout still returning 429 without verifying or sending.
4. Missing server secret failing closed.
5. Provider unavailability failing closed.
6. Empty, malformed and oversized tokens rejected before policy/provider work.
7. The maximum-length token preserved byte-for-byte.
8. Normal unchallenged phone requests remaining compatible without a token.
9. Guarded real PostgreSQL OTP transaction, scrypt hash, single consumption and
   canonical customer session issuance through mounted HTTP handlers. Before
   challenge acceptance no OTP exists and SMS is not requested; after acceptance
   exactly one hashed record exists. Replaying the consumed code cannot add a
   second refresh session. This is a focused synthetic schema, not a full
   production migration/image or real-SMS rehearsal.

Original validator with the final nine checks: **seven failures, two passes**,
1.116 seconds. The actual SQL/HTTP case failed at expected 200 versus received
428, as did the named contract regression. Original failure reports are retained.

Corrected standalone nine checks passed in 1.973 seconds. Final connected run:
**11 suites, 58 tests passed**, no skips/TODOs, 12.474 seconds, including the
existing real PostgreSQL privileged-phone denial regression. Earlier connected
work without PostgreSQL had one skipped SQL test; that receipt remains separate
and is not relabeled as a full pass.

Three unchanged mobile caller-render suites passed four tests with three
existing TODOs in 32.651 seconds. Those use mocked API/native boundaries; they
are not proof of a real widget, browser challenge, native device or delivery.
API typecheck and focused lint passed. Local Gate A (ten fragments), Gate C
(seven articles) and seven gate-smoke scripts passed without changes to modes
or assertions. The final full local API run passed **1,015 suites / 3,516
tests**, with two existing TODOs and only two failed suites/tests in 335.167
seconds. Both failures were unchanged Nginx checks (UX-201/UX-860) because the
local Docker Linux engine was unavailable. All nine new checks, all 26 guarded
refund/participant checks and the unchanged five-case issuer SQL suite executed
and passed. This is **not a green full local run**. Exact-candidate CI must run
and pass those infrastructure checks too; prior baseline CI does not verify
this correction. Release acceptance remains separate.

The owned PostgreSQL instance was stopped after fresh identity, zero generated
schemas and zero other-client checks. Its listener/process were absent after
shutdown; test data was retained. Production was not changed by this correction.

## Remaining sign-in work

Ken's new explicit requirement adds email-code and Google/Apple sign-in, with
Facebook evaluated next, for customers/providers. These methods are not already
implemented by adding this CAPTCHA field. Verified identity association,
existing-account ownership proof, duplicate/concurrent linking, provider app
configuration/callbacks, delivery, platform signing, role boundaries and actual
web/native acceptance are separate required work. A contact-email match alone
must never authorize linking an existing account. Admin remains on its separate
password plus second-factor flow.

Configured live Turnstile keys, hostname binding, widget completion, expired
challenge recovery, browser/native acceptance and the matching deployed server
are also still required; mocked provider responses do not certify them.

Provider contract reference: [Cloudflare Siteverify documentation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Published candidate CI failure

Published `7fa7c520d699a142f4f1f1f853fab7d8b32f5c03` passed its nine new checks,
the issuer SQL suite and both Nginx checks in CI 37895823523. However, an
unchanged concurrent operator-refund check failed with HTTP 500 instead of the
expected 409. The complete API run is therefore failed, not accepted. Admin and
mobile jobs succeeded, the dependent API Docker job was skipped, and Gates
37895823510 succeeded. Investigation reproduced a real support-case/booking
lock cycle, documented in [OPS-536](REFUND-CASE-LOCK-2026-10-09.md). The exact
corrected candidate must pass full CI before moving to another changed function.
Neither source correction is a deployed email/social sign-in feature.
