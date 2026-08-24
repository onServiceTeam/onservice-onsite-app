# Security Posture (Phase 12)

This document began as the Phase 12 SEC-001..009 snapshot and now records later
verified remediations. Re-run behavioral tests and deployment checks before a
production cutover; line counts or the presence of a source string are not
proof that a control works.

## Summary table

| ID | Control | Status | Evidence |
| --- | --- | --- | --- |
| SEC-001 | Admin 2FA (TOTP) with force-enrolment | DONE | `packages/api/src/routes/auth.routes.ts` — `/admin/login` issues `pre_auth_2fa_setup` token when an admin/super_admin lacks TOTP; `/admin/2fa/setup` and `/admin/2fa/enable` accept that token; `/admin/2fa/enable` mints full session tokens on success. Existing 2FA verify path unchanged. |
| SEC-002 | Turnstile after N failed OTPs | VERIFIED IN CODE; PRODUCTION BLOCKED ON REAL KEYS | OTP login/registration use `useCaptchaOtp` and the native/web `TurnstileModal`; the API calls Cloudflare Siteverify through `securityService.verifyCaptchaToken` and fails closed in production without a secret. Env: `TURNSTILE_SECRET_KEY` and `EXPO_PUBLIC_TURNSTILE_SITE_KEY`; historical `CAPTCHA_*` aliases remain temporarily accepted. Behavioral coverage includes the OTP challenge suites and `bug-sec-010-turnstile-cutover-verifier.test.ts`. A 2026-08-24 live inspection found no server secret or Cloudflare token, so production-mode promotion remains blocked. |
| SEC-003 | PayMongo webhook signature | VERIFIED | `packages/api/src/routes/webhook.routes.ts:14-50` — HMAC-SHA256 over `${timestamp}.${rawBody}`, 5-minute replay window, `crypto.timingSafeEqual` comparison. Rejects when `PAYMONGO_WEBHOOK_SECRET` is missing. |
| SEC-004 | Government-ID encryption at rest (S3 SSE) | DONE IN CODE; STORAGE DEPLOYMENT STILL REQUIRES VERIFICATION | Every S3 `PutObjectCommand` uses SSE-KMS when `S3_KMS_KEY_ID` exists and SSE-S3/AES256 otherwise; private KYC objects are owner/admin proxied. `s3-sse-bug-1325.test.ts` executes both encryption branches. The current Hetzner local-volume deployment relies on host-volume security rather than claiming S3 encryption. |
| SEC-005 | PII masking in logs | DONE (Phase 13 Dispatch D) | `packages/api/src/utils/logger.ts` exports `piiMaskFormat` (winston format factory) inserted into both root and console transport pipelines. Redacts PH phone (+63 / 09xx), email, TIN, SSS, PhilHealth, PayMongo IDs (`cus_/src_/pay_/link_`), JWT, and bcrypt hashes. Idempotent (skips strings that already contain `[REDACTED:`). Tests: `__tests__/logger-pii-masking.test.ts`. |
| SEC-006 | JWT 15-min access + 30-day refresh | VERIFIED | `packages/api/src/config/platform.config.ts:88-95` — `jwtExpiresIn: '15m'`, `jwtRefreshExpiresIn: '30d'`, plus per-role overrides in `jwtExpiresInByRole`. `auth.service.ts:74-84` honours these in `createTokenPair`. Env overrides: `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_ADMIN_REFRESH_EXPIRES_IN`. |
| SEC-007 | IP-level OTP brute-force detection | VERIFIED | `packages/api/src/services/security.service.ts` records `(phone, ip_address)` per attempt in `login_attempts`, ramps lockouts via `OTP_LOCKOUT_THRESHOLDS`, and exposes `cleanupOldLoginAttempts` for housekeeping. The auto-block helper at line ~430 ("`Auto-blocked: ${row.fail_count} failed login attempts`") flips offending IPs into the `blocked_ips` table. |
| SEC-008 | Admin role check on every admin endpoint | VERIFIED | All 9 `src/routes/*admin*.ts` files import `authMiddleware`; every handler additionally enforces `role === 'admin'` or `role === 'super_admin'`. Per-file counts: `admin.routes.ts` 62/65, `bir-admin.routes.ts` 17/20, `booking-admin.routes.ts` 10/13, `compliance-admin.routes.ts` 9/10, `customer-admin.routes.ts` 9/12, `dispute-admin.routes.ts` 7/10, `financial-admin.routes.ts` 12/15, `marketing-admin.routes.ts` 11/14, `provider-admin.routes.ts` 15/18 (`authMiddleware` references / role checks). The admin route guard smoke test (`__tests__/smoke.test.ts`) walks the directory and asserts every file has at least one occurrence. |
| SEC-009 | CSP headers on admin web | DONE (Phase 13 Dispatch D) | `apps/admin/vercel.json` declares `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Admin `index.html` contains no inline scripts (Vite emits external bundles only). |

## Verification commands

To re-run the verification:

```bash
# SEC-001 — force-enrolment branch present
grep -n "pre_auth_2fa_setup" packages/api/src/routes/auth.routes.ts

# SEC-002 — CAPTCHA enforcement
grep -n "captchaRequired\|verifyCaptchaToken" packages/api/src/routes/auth.routes.ts

# SEC-003 — webhook HMAC
grep -n "createHmac\|timingSafeEqual" packages/api/src/routes/webhook.routes.ts

# SEC-004 — execute the two S3 encryption branches
npm --workspace @onservice/api test -- --runInBand s3-sse-bug-1325.test.ts

# SEC-005 — execute log redaction behavior
npm --workspace @onservice/api test -- --runInBand logger-pii-masking.test.ts

# SEC-006 — JWT expiry
grep -n "jwtExpiresIn\|jwtRefreshExpiresIn" packages/api/src/config/platform.config.ts

# SEC-007 — IP block helper
grep -n "blocked_ips\|Auto-blocked" packages/api/src/services/security.service.ts

# SEC-008 — admin route guards
ls packages/api/src/routes/*admin*.ts | xargs -I {} sh -c "echo {} && grep -c authMiddleware {}"

# SEC-009 — inspect the deployed response, not only repository config
curl -fsSI https://admin.onservice.ph | grep -i "content-security-policy"
```

## Known deployment gaps

The original SEC-004 code gap is closed. Launch still requires deployment-level
evidence for the active storage backend, Turnstile production keys, CSP response
headers, Sentry, backups/PITR, and the current items in
`docs/runbooks/launch-cutover.md`. A green unit test is not that evidence.

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

## 2FA force-enrolment flow (Phase 12)

```
POST /api/v1/auth/admin/login (email, password)
   |
   |-- credentials invalid -> 401
   |-- credentials valid AND totp_enabled=true
   |       -> { requires2FA: true, preAuthToken<5min, type=pre_auth_2fa> }
   |
   |-- credentials valid AND totp_enabled=false AND role in (admin, super_admin)
   |       -> { requires2FASetup: true, preAuthToken<5min, type=pre_auth_2fa_setup>, userId }
   |
   |-- credentials valid AND no 2FA needed (non-admin)
           -> { accessToken, refreshToken, user }

When client receives requires2FASetup:
   POST /api/v1/auth/admin/2fa/setup
       Authorization: Bearer <preAuthToken>
       -> { secret, uri }     (admin scans into authenticator)

   POST /api/v1/auth/admin/2fa/enable
       Authorization: Bearer <preAuthToken>
       Body: { totpCode }
       -> { accessToken, refreshToken, user }   (mints full session in one step)
```

The `adminAuthOrSetupToken` middleware in `auth.routes.ts` accepts either
the normal admin access token (so an already-logged-in admin can reconfigure
2FA) or the `pre_auth_2fa_setup` token, and sets `req.isSetupToken` for the
enable handler so it knows to mint full tokens on success.
