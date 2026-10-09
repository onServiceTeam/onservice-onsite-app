# Sign-in method discovery, October 10

## Scope

`GET /api/v1/auth/methods` is a new account-independent configuration endpoint
for the upcoming customer/provider/staff sign-in UI. It is not account discovery,
a login, an identity linker or proof that a delivery provider is healthy.
No client screen uses it yet and no feature was enabled on a live server.

The contract-before-code tests on verified predecessor `d64b4f39` returned 404
for the absent endpoint: five tests failed in 5.023s. Those original reports
are retained. This is new functionality, not a historical bug closure.

## Contract

Only the new GET handler changes at runtime. It lives in the already-mounted
authentication router, so no server mount, middleware or deployment change is
needed. The response retains the existing `success`/`data` envelope:

- `phoneOtp.supported` identifies the existing phone method, not SMS delivery
  health or permission to bypass its rate limits, CAPTCHA or account checks.
- `emailCode.enabled` defaults to false. The handler reuses the actual email
  request producer's opt-in and sender-configuration guard. A nonempty public
  Turnstile site key and the selected server-side CAPTCHA secret are also
  required. The legacy secret alias retains the existing selection precedence.
- When enabled, only `emailCode.captchaSiteKey` is included. No sender address,
  private key, failure reason, user, role, session or identity data is returned.
  Unknown, absent and disabled configuration produce the same false shape.

The handler reads no request identity or query data and performs no SQL, hashing,
message delivery, session issuance or provider health request. There is no new
cache, worker, database, dependency or permanent service. The existing global
limiter still applies; this GET does not consume the credential-attempt budget.
It sets `Cache-Control: private, no-store` and ends a JSON response without an
Express-generated ETag, so conditional requests still receive the current body
instead of 304. HEAD retains normal no-body behavior. Reverse-proxy caching and
physical browser enforcement still require deployed acceptance.

The existing `EMAIL_SIGN_IN_ENABLED=0` default is now documented in the example
environment file. No actual environment file or flag changed. No Google/Apple/
Facebook option is advertised before its adapter and configuration exist.

## Verification

Five tests mount the real authentication and email routers over HTTP, use the
real configuration guard/sender predicate, and assert exact response bodies,
headers, missing/invalid configuration, both secret aliases, immediate config
changes, conditional GET, HEAD, caller-independence and unchanged neighboring
authorization/CAPTCHA/disabled-feature boundaries. Database and Redis edges and
diagnostics are fixtures. Assertions require no DB or outbound provider calls;
they do not claim SQL, real account or inbox acceptance.

Initial focused three suites/ten tests pass in 1.964s; nineteen existing SQL
checks skip because local isolated PostgreSQL remains unavailable. Those skips
are not acceptance. Final reviewed five suites/thirteen tests pass in 1.893s,
with 64 existing SQL checks skipped. All five new discovery checks execute.

Full local API is **not green**: 964 suites/3439 tests pass, 66 suites/211 tests
skip, two TODOs remain, and the same two Docker-unavailable Nginx checks fail,
in 229.641s. The actual failure messages name the unavailable Docker Desktop
Linux engine. Runtime and tests did not change during that run. The complete
failed report and focused reports remain retained, without relabelling skips
as SQL acceptance. Final API types/scoped lint and unchanged Gate A (ten
fragments), Gate C (seven articles) and seven gate smoke scripts pass.
No gate, assertion, timeout or enforcement mode was weakened. No new local
admin/mobile full run or compiled-client/device acceptance is claimed.
Exact-candidate CI, actual SQL/Nginx execution, full API/admin/mobile regressions,
types/builds and image boot remain required after reviewed publication before
another runtime function changes.

## Still required

Configuration presence cannot prove a valid key pair, permitted hostname,
verified sender domain, inbox delivery or account eligibility. A caller must
handle a method being disabled or failing after discovery. The upcoming UI must
validate this response, use the discovered public key, retain phone fallback,
and implement the existing one-time-proof/lost-response contracts. No contact-
email auto-linking or administrator password/TOTP shortcut is introduced.

Complete the UI and actual configured delivery/platform acceptance, then the
selected-image restored migration chain through 179, matched authenticated
clients, upload references and rollback before synchronized release. The broader
124 findings remain 117 unreconciled, seven partial and zero closed. This is not
live email/social sign-in, an APK, deployment or launch readiness.
