# Security Posture (Phase 12)

This document began as the Phase 12 SEC-001..009 snapshot and now records later
verified remediations. Re-run behavioral tests and deployment checks before a
production cutover; line counts or the presence of a source string are not
proof that a control works.

## Summary table

| ID | Control | Status | Evidence |
| --- | --- | --- | --- |
| SEC-001 | Admin 2FA (TOTP) with force-enrolment and recovery codes | CONNECTED IN CODE; RECOVERY GOVERNANCE REVIEW OPEN | `admin`, `super_admin`, and `dpo` accounts must enroll TOTP. Activation atomically creates eight single-use recovery codes and the enrollment page shows them once with a secure-storage save step. Login accepts exactly one TOTP or recovery code and consumes a recovery code transactionally. Temporary setup tokens cannot authorize ordinary HTTP or Socket.IO access. The pre-existing factor-removal and recovery-code-regeneration mutation routes now fail closed with a `409` launch hold and do not read or mutate account recovery state. Privileged recovery and interrupted enrollment remain launch-held under private security review. Behavioral coverage: SEC-038 through SEC-044 and Admin Bugs UX-1023/1024. |
| SEC-002 | Turnstile after N failed OTPs | LOCAL REQUEST-CONTRACT CORRECTION VERIFIED; LIVE ACCEPTANCE OPEN | OTP login/registration use `useCaptchaOtp` and native/web `TurnstileModal`. SEC-080 found the real request validator discarded the supplied CAPTCHA token, causing repeated 428 responses. The local correction preserves the bounded opaque token for the existing server-side Siteverify check; real mounted HTTP and focused PostgreSQL coverage now pass. This correction is not deployed or exact-candidate CI verified. Env: `TURNSTILE_SECRET_KEY` and `EXPO_PUBLIC_TURNSTILE_SITE_KEY`; historical `CAPTCHA_*` aliases remain accepted. The 2026-08-24 missing-key inspection is historical, not a fresh check. Configured live widget/provider acceptance remains open. See [the contract audit](audits/OTP-CAPTCHA-CONTRACT-2026-10-09.md). |
| SEC-003 | PayMongo webhook signature | VERIFIED | `packages/api/src/routes/webhook.routes.ts:14-50` — HMAC-SHA256 over `${timestamp}.${rawBody}`, 5-minute replay window, `crypto.timingSafeEqual` comparison. Rejects when `PAYMONGO_WEBHOOK_SECRET` is missing. |
| SEC-004 | Government-ID encryption at rest (S3 SSE) | DONE IN CODE; STORAGE DEPLOYMENT STILL REQUIRES VERIFICATION | Every S3 `PutObjectCommand` uses SSE-KMS when `S3_KMS_KEY_ID` exists and SSE-S3/AES256 otherwise; private KYC objects are owner/admin proxied. `s3-sse-bug-1325.test.ts` executes both encryption branches. The current Hetzner local-volume deployment relies on host-volume security rather than claiming S3 encryption. |
| SEC-005 | PII masking in logs | DONE (Phase 13 Dispatch D) | `packages/api/src/utils/logger.ts` exports `piiMaskFormat` (winston format factory) inserted into both root and console transport pipelines. Redacts PH phone (+63 / 09xx), email, TIN, SSS, PhilHealth, PayMongo IDs (`cus_/src_/pay_/link_`), JWT, and bcrypt hashes. Idempotent (skips strings that already contain `[REDACTED:`). Tests: `__tests__/logger-pii-masking.test.ts`. |
| SEC-006 | Canonical, revocable JWT sessions | VERIFIED IN CODE | Access tokens are limited to 15 minutes. Customer/provider refresh tokens use the configured 30-day mobile duration. Admin, super-admin, and DPO refresh tokens and cookies use the single 8-hour `platformConfig.adminSessionTimeoutHours` contract. Every protected HTTP request and Socket.IO handshake reloads the user's current role, active state, and session generation. Forced admin password rotation is a server precondition on HTTP, special 2FA routes, and sockets, not only a page redirect. Password replacement increments the generation, removes refresh sessions, revokes CSRF tokens, disconnects live sockets, and issues one replacement session to the verified browser. DPO transitions also increment the generation and invalidate earlier credentials; an inactive account is rejected while inactive. General admin lifecycle/reactivation revocation remains E39. Focused coverage adds SEC-036/041/042 and the `launch-limit-12-admin-password-rotation.test.ts` transaction/route tests to Bugs UX-558/559/562. Environment overrides remain only for access and mobile refresh duration: `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`. |
| SEC-007 | Canonical account and IP login abuse controls | VERIFIED | `packages/api/src/services/security.service.ts` records `(phone, ip_address)` per OTP attempt in `login_attempts`, ramps lockouts via `OTP_LOCKOUT_THRESHOLDS`, and exposes `cleanupOldLoginAttempts` for housekeeping. The auto-block helper at line ~430 ("`Auto-blocked: ${row.fail_count} failed login attempts`") flips offending IPs into the `blocked_ips` table. Admin email login now canonicalizes the account identity once and uses that same lower-case, trimmed value for the lockout count, account lookup, attempt rows, and security-event metadata, so changing email case or surrounding whitespace cannot split the account-scoped failure history. Behavioral coverage: SEC-045. |
| SEC-008 | Role authorization across privileged endpoints | SCOPED BEHAVIORAL COVERAGE; FULL INVENTORY OPEN | The old all-endpoints claim relied on source-string counts and is withdrawn. Authentication and endpoint permission are separate; DPO privacy routes must not be described as requiring operations-admin authority. UX-560 executes selected DSR/consent route permissions with synthetic authentication; UX-572 checks two residual DPO operations exclusions; UX-573 checks KYC denial at the service boundary. The former file-name/source-occurrence smoke assertion is replaced by `admin-access-smoke.test.ts`: real JWT, canonical-auth and permission middleware on three GET routes, six roles and cookie/Bearer credentials, with mocked account/list data. This is useful scoped coverage, not proof for every handler, method, alias, object owner, write-CSRF boundary or live deployment; the full inventory is an explicit TODO. |
| SEC-009 | CSP headers on admin web | DONE (Phase 13 Dispatch D) | `apps/admin/vercel.json` declares `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Admin `index.html` contains no inline scripts (Vite emits external bundles only). |

## Verification commands

To re-run the verification:

```bash
# SEC-001 — execute enrollment, one-time recovery, and temporary-token boundaries
npm --workspace @onservice/api test -- --runInBand \
  bug-sec-038-admin-backup-code-login.test.ts \
  bug-sec-039-admin-2fa-setup-token-boundary.test.ts \
  bug-sec-040-socket-2fa-setup-token-boundary.test.ts \
  bug-sec-042-admin-2fa-special-route-rotation-boundary.test.ts

# SEC-002 — actual request/verification contract; the SQL case requires the
# guarded isolated localhost *_test database, otherwise it is explicitly skipped.
npm --workspace @onservice/api test -- --runInBand \
  bug-sec-080-otp-captcha-contract.test.ts \
  bug-sec-010-turnstile-cutover-verifier.test.ts

# SEC-003 — webhook HMAC
grep -n "createHmac\|timingSafeEqual" packages/api/src/routes/webhook.routes.ts

# SEC-004 — execute the two S3 encryption branches
npm --workspace @onservice/api test -- --runInBand s3-sse-bug-1325.test.ts

# SEC-005 — execute log redaction behavior
npm --workspace @onservice/api test -- --runInBand logger-pii-masking.test.ts

# SEC-006 — execute canonical session-state and privileged timeout behavior
npm --workspace @onservice/api test -- --runInBand \
  bug-sec-036-forced-admin-password-rotation.test.ts \
  bug-sec-041-socket-password-rotation-boundary.test.ts \
  launch-limit-12-admin-password-rotation.test.ts \
  bug-ux-558-canonical-session-state.test.ts \
  bug-ux-559-dpo-transition-revocation.test.ts \
  bug-ux-562-admin-session-timeout.test.ts \
  auth-token-expiry-smoke.test.ts

# SEC-007 — execute canonical Admin lockout identity and inspect the IP block helper
npm --workspace @onservice/api test -- --runInBand \
  bug-sec-045-admin-login-canonical-lockout-identity.test.ts
grep -n "blocked_ips\|Auto-blocked" packages/api/src/services/security.service.ts

# SEC-008 — selected behavioral boundaries, not a full endpoint inventory
npm --workspace @onservice/api test -- --runInBand \
  bug-ux-560-dpo-api-route-matrix.test.ts \
  bug-ux-572-dpo-residual-operations-boundary.test.ts \
  bug-ux-573-dpo-kyc-document-boundary.test.ts \
  admin-access-smoke.test.ts

# SEC-009 — inspect the deployed response, not only repository config
curl -fsSI https://admin.onservice.ph | grep -i "content-security-policy"
```

## Known deployment gaps

The original SEC-004 code gap is closed. Launch still requires deployment-level
evidence for the active storage backend, Turnstile production keys, CSP response
headers, Sentry, backups/PITR, and the current items in
`docs/runbooks/launch-cutover.md`. A green unit test is not that evidence.

SEC-008's 2026-09-06 reporting correction did not remove a guard. Its subsequent
[smoke-test repair](audits/BEHAVIORAL-SMOKE-REPAIR-2026-09-06.md) replaces the
four nonbehavioral assertions without changing application runtime. Inventory the actual server mounts and methods,
including mixed customer/provider/admin families and aliases, then prove
allowed and denied roles, credentials and record ownership with real requests
before restoring an all-endpoints claim. Health now exercises the mounted
server handlers with mocked dependencies; expiry checks inspect real issued
JWTs and storage arguments. Commission arithmetic invokes the actual calculator
with synthetic settings. Persisted capture/refund/escrow/payout conservation
is an explicit TODO, not a claim inferred from those calculator assertions.

### Live authentication remediation (2026-08-24)

A boolean-only inspection found the public container using developer OTP,
relaxed rate limits, and password-only admin access. It also found one active
privileged account whose password matched a credential formerly published in
the repository. After a full backup, that account was deactivated, 13 refresh
sessions were revoked, and a security audit event was written. All three bypass
flags are now disabled, the fixed OTP value was removed, the API is healthy,
test fixtures remain off, and the sole remaining active privileged account has
TOTP enabled. `NODE_ENV=production` remains blocked only by the absent real
Turnstile secret; see `LAUNCH-LIMITATIONS.md` §41.

## Phase 13 Dispatch D security hardening (additions)

### Password hash format (scrypt cost migration)

`hashPassword` now produces strings of the shape:

```
scrypt:131072:8:1:<16-byte-salt-hex>:<64-byte-key-hex>
```

`verifyPasswordWithRehash` accepts both the new format and the legacy
two-part `salt:hash` (default scrypt params) so existing passwords keep
working. When a legacy or weaker hash verifies successfully, the response
sets `needsRehash: true` and the `/admin/login` handler opportunistically
re-stores the password under current parameters (best-effort; logged on
failure but never blocks login). Constants `SCRYPT_N=131072`, `r=8`, `p=1`,
`keyLen=64`, `maxmem=256 MiB` are exported from `auth.service.ts`.

### CORS allowlist

`packages/api/src/server.ts` reads `ALLOWED_ORIGINS` (comma-separated;
falls back to `APP_URL` then localhost defaults). Requests with an
`Origin` not in the list are rejected by the `cors()` middleware. Requests
without an `Origin` header (server-to-server, mobile native, curl) are
permitted. Tests: `__tests__/cors-allowlist.test.ts`.

### PII masking patterns

The `piiMaskFormat` winston format redacts the following patterns,
applied in this order before `winston.format.json()` and before the
console transport's `simple()` format:

| Pattern | Replacement |
| --- | --- |
| PH phone `+63 9XX XXX XXXX` / `09XXXXXXXXX` | `[REDACTED:phone]` |
| TIN `NNN-NNN-NNN-NNN` | `[REDACTED:tin]` |
| PhilHealth `NN-NNNNNNNNN-N` | `[REDACTED:philhealth]` |
| SSS `NN-NNNNNNN-N` | `[REDACTED:sss]` |
| PayMongo IDs `cus_/src_/pay_/link_<6+ alnum>` | `[REDACTED:paymongo]` |
| JWT (`eyJ...` 3-segment base64url) | `[REDACTED:jwt]` |
| bcrypt hash `$2[aby]$NN$<53 chars>` | `[REDACTED:hash]` |
| Email `local@domain.tld` | `[REDACTED:email]` |

Scrypt hashes (our `salt:hash` and `scrypt:N:r:p:salt:hash`) are NOT
regex-redacted because the pattern would over-match arbitrary hex strings
and bigint columns. Code paths must avoid logging the `password_hash`
column directly.

The SEC-073 candidate also removes supplied key material from invalid TOTP
encryption-configuration errors at their source, without relying on generic
PII patterns to recognize a key fragment. Format/length diagnostics and strict
validation remain. Real helper and encryption regressions pass; this does not
prove production exposure, rotate a key, change recovery authority or complete
deployment. See [the diagnostic audit](audits/ADMIN-TOTP-DIAGNOSTICS-2026-09-06.md).

### CSP rationale (per directive)

| Directive | Sources allowed | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Deny everything by default. |
| `script-src` | `'self'`, `browser.sentry-cdn.com` | Admin app bundle and Sentry browser loader. The admin has no CAPTCHA widget. No `'unsafe-inline'` because Vite emits external scripts. |
| `style-src` | `'self'`, `'unsafe-inline'` | Runtime/component styling requires inline style declarations. |
| `img-src` | `'self'`, `data:`, configured S3 origins | User avatars and uploaded media plus inline icons. |
| `connect-src` | `'self'`, `api.onservice.ph`, Sentry ingest | Admin API and error reporting. |
| `frame-src` | `'none'` | The admin has no third-party frame requirement. Turnstile is confined to the customer/provider app CSP served by nginx. |
| `frame-ancestors` | `'none'` | Prevents the admin from being framed by another origin (clickjacking). |
| `form-action` | `'self'` | Forms can only submit to the admin origin. |
| `base-uri` | `'self'` | Prevents `<base>` injection that could redirect relative URLs. |

Companion headers in `vercel.json`: `X-Frame-Options: DENY` (legacy
fallback), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
microphone=(), geolocation=()`.

### Future hardening

- Add Subresource Integrity (SRI) hashes for any future CDN-served
  scripts.
- Enable Cross-Origin-Embedder-Policy (`require-corp`) and
  Cross-Origin-Opener-Policy (`same-origin`) after testing all active third-party
  integrations. The admin currently permits no third-party frame.
- Stand up a CSP violation reporting endpoint (`Reporting-Endpoints` +
  `report-to` directive) to surface in-the-wild violations in Sentry.

## Admin 2FA, recovery-code, and forced-password flow

The separate marketplace phone-code sign-in must not issue privileged
credentials. SEC-075 enforces a customer/provider/provider-staff allowlist in
candidate code, including for configured development codes. On October 9 a
narrow compatibility guard was separately tested and activated on the older
live API image; the accumulated topic candidate was not deployed. This
prospective containment does not revoke or certify previously issued sessions. See
`docs/audits/PRIVILEGED-PHONE-SIGN-IN-2026-10-08.md` for the real database/HTTP
reproduction, verification scope and remaining release/session requirements.

OPS-531/532 bind second-factor verification to current account authority and
factor state under an account lock. Recovery consumption, its audit and login
metadata share one transaction, so a failure within that transaction leaves the
code available for retry. Subsequent session issuance and response delivery are
still separate: a later revocation denies credentials without rolling back
already committed verification effects. This candidate correction is not live
and does not complete governed recovery or durable acknowledgement. See
[the verification audit](audits/ADMIN-VERIFICATION-TRANSACTION-2026-10-09.md).

```
POST /api/v1/auth/admin/login (email, password)
   |
   |-- credentials invalid -> 401
   |-- credentials valid AND totp_enabled=true
   |       -> { requires2FA: true, preAuthToken<10min, type=pre_auth_2fa> }
   |
   |-- credentials valid AND totp_enabled=false
           -> { requires2FASetup: true, preAuthToken<30min,
                type=pre_auth_2fa_setup>, userId }

POST /api/v1/auth/admin/2fa/verify
   Body: exactly one of { totpCode } or { backupCode }
   -> HttpOnly access/refresh cookies + JS-readable CSRF cookie + user
   -> a valid backup code is consumed once and remaining count is returned

When client receives requires2FASetup:
   POST /api/v1/auth/admin/2fa/setup
       Authorization: Bearer <preAuthToken>
       -> { secret, uri }     (admin scans into authenticator)

   POST /api/v1/auth/admin/2fa/enable
       Authorization: Bearer <preAuthToken>
       Body: { totpCode }
       -> HttpOnly/CSRF cookies + user + eight one-time recovery codes
       -> enrollment page blocks Continue until secure storage is acknowledged
```

The `adminAuthOrSetupToken` middleware in `auth.routes.ts` accepts either
the normal admin access token (so an already-logged-in admin can reconfigure
2FA) or the `pre_auth_2fa_setup` token, and sets `req.isSetupToken` for the
enable handler so it knows to mint full cookies on success. A normal access
token must satisfy the forced-password precondition. The dedicated setup token
may finish first-login enrollment, but cannot authorize ordinary HTTP or socket
work. If the resulting full session is marked `mustRotatePassword`, only
identity inspection, own-password replacement, and logout remain available.
Password replacement revokes prior session material and gives the current
verified browser one replacement session.

Do not use factor removal or lost-factor recovery as an ordinary operator
workflow. Their governed authority, audit, rollout, and recovery contract remain
launch-held under private security review.

## Shared customer/provider profile identity changes

`PATCH /api/v1/auth/me` changes only the signed-in user's first and last names.
It now locks the canonical user row and commits the update together with a
`user_profile_updated` audit event containing the before/after names, actor,
IP address, and user agent. A missing audit insert fails the transaction, while
an unchanged request returns the current row without creating false activity.
The route does not rewrite names captured in older bookings, payments,
messages, reviews, or other historical records. Behavioral coverage:
`bug-ops-371-profile-update-audit.test.ts`; verified by GitHub CI
`33610063899` and Gates `33610063827`.

Admin Audit Log renders this event as **Profile name updated** and converts the
generic `users` record into a role-aware support destination. Customer subjects
open Customer 360; provider subjects use an exact owner-ID search that resolves
the related Provider Management record. Bugs UX-1026 and OPS-372 verify the
rendered links and the full-name/provider-ID/user-ID search contract. Commit
`4223052` passes GitHub CI `33611777960` and Gates `33611777913`.

The same write boundary trims first and last names and rejects values that are
empty after trimming. This prevents non-mobile clients from storing visually
blank or padded identity values without banning a legitimate one-character
name. SEC-045 verifies normalization and rejection. The customer UI also avoids
sending an unchanged normalized name through this mutation; UX-1027 verifies
the rendered no-op behavior. Final fix-forward `ee708ab` passes GitHub CI
`33614523217` and Gates `33614523236`.
