# Security Posture (Phase 12)

This document records the verification status of the SEC-001..009 controls
called out in `COMPREHENSIVE-271-ISSUE-AUDIT.md` Section 14. It is a snapshot
taken at the close of Phase 12; re-run the verification commands before any
production cutover.

## Summary table

| ID | Control | Status | Evidence |
| --- | --- | --- | --- |
| SEC-001 | Admin 2FA (TOTP) with force-enrolment | DONE | `packages/api/src/routes/auth.routes.ts` — `/admin/login` issues `pre_auth_2fa_setup` token when an admin/super_admin lacks TOTP; `/admin/2fa/setup` and `/admin/2fa/enable` accept that token; `/admin/2fa/enable` mints full session tokens on success. Existing 2FA verify path unchanged. |
| SEC-002 | CAPTCHA after N failed OTPs | VERIFIED | `packages/api/src/routes/auth.routes.ts:87-110` checks `lockoutStatus.captchaRequired` and calls `securityService.verifyCaptchaToken`. Threshold defined in `platform.config.ts` as `captchaThreshold: 3`. Env: `CAPTCHA_SECRET_KEY`, `CAPTCHA_SITE_KEY`. |
| SEC-003 | PayMongo webhook signature | VERIFIED | `packages/api/src/routes/webhook.routes.ts:14-50` — HMAC-SHA256 over `${timestamp}.${rawBody}`, 5-minute replay window, `crypto.timingSafeEqual` comparison. Rejects when `PAYMONGO_WEBHOOK_SECRET` is missing. |
| SEC-004 | Government-ID encryption at rest (S3 SSE) | DEFERRED | `packages/api/src/services/upload.service.ts` issues `PutObjectCommand` without a `ServerSideEncryption` parameter (0 matches for `ServerSideEncryption|SSE|AES256|KMS`). Bucket-level default encryption can be enabled in AWS S3 / DO Spaces console as a stop-gap. See "Known gaps" below. |
| SEC-005 | PII masking in logs | DEFERRED | `packages/api/src/utils/logger.ts` is a vanilla winston logger with no `mask`/`redact`/`sanitize` formatter. PII (emails, phones, etc.) flows directly into log output. See "Known gaps" below. |
| SEC-006 | JWT 15-min access + 30-day refresh | VERIFIED | `packages/api/src/config/platform.config.ts:88-95` — `jwtExpiresIn: '15m'`, `jwtRefreshExpiresIn: '30d'`, plus per-role overrides in `jwtExpiresInByRole`. `auth.service.ts:74-84` honours these in `createTokenPair`. Env overrides: `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_ADMIN_REFRESH_EXPIRES_IN`. |
| SEC-007 | IP-level OTP brute-force detection | VERIFIED | `packages/api/src/services/security.service.ts` records `(phone, ip_address)` per attempt in `login_attempts`, ramps lockouts via `OTP_LOCKOUT_THRESHOLDS`, and exposes `cleanupOldLoginAttempts` for housekeeping. The auto-block helper at line ~430 ("`Auto-blocked: ${row.fail_count} failed login attempts`") flips offending IPs into the `blocked_ips` table. |
| SEC-008 | Admin role check on every admin endpoint | VERIFIED | All 9 `src/routes/*admin*.ts` files import `authMiddleware`; every handler additionally enforces `role === 'admin'` or `role === 'super_admin'`. Per-file counts: `admin.routes.ts` 62/65, `bir-admin.routes.ts` 17/20, `booking-admin.routes.ts` 10/13, `compliance-admin.routes.ts` 9/10, `customer-admin.routes.ts` 9/12, `dispute-admin.routes.ts` 7/10, `financial-admin.routes.ts` 12/15, `marketing-admin.routes.ts` 11/14, `provider-admin.routes.ts` 15/18 (`authMiddleware` references / role checks). The admin route guard smoke test (`__tests__/smoke.test.ts`) walks the directory and asserts every file has at least one occurrence. |
| SEC-009 | CSP headers on admin web | DEFERRED | `apps/admin/index.html` has no `<meta http-equiv="Content-Security-Policy">` tag. `apps/admin/vite.config.ts` has no `server.headers` entry. CSP must be served by the Vercel edge (via `vercel.json` `headers`) or by adding a meta tag — neither is in place yet. See "Known gaps" below. |

## Verification commands

To re-run the verification:

```bash
# SEC-001 — force-enrolment branch present
grep -n "pre_auth_2fa_setup" packages/api/src/routes/auth.routes.ts

# SEC-002 — CAPTCHA enforcement
grep -n "captchaRequired\|verifyCaptchaToken" packages/api/src/routes/auth.routes.ts

# SEC-003 — webhook HMAC
grep -n "createHmac\|timingSafeEqual" packages/api/src/routes/webhook.routes.ts

# SEC-004 — S3 SSE (expect 0 matches today)
grep -nE "ServerSideEncryption|SSE|AES256|KMS" packages/api/src/services/upload.service.ts || echo DEFERRED

# SEC-005 — log PII masking (expect 0 matches today)
grep -nE "mask|redact|sanitize" packages/api/src/utils/logger.ts || echo DEFERRED

# SEC-006 — JWT expiry
grep -n "jwtExpiresIn\|jwtRefreshExpiresIn" packages/api/src/config/platform.config.ts

# SEC-007 — IP block helper
grep -n "blocked_ips\|Auto-blocked" packages/api/src/services/security.service.ts

# SEC-008 — admin route guards
ls packages/api/src/routes/*admin*.ts | xargs -I {} sh -c "echo {} && grep -c authMiddleware {}"

# SEC-009 — CSP on admin (expect 0 matches today)
grep -n "Content-Security-Policy" apps/admin/index.html apps/admin/vite.config.ts || echo DEFERRED
```

## Known gaps (carried forward)

Three controls remain DEFERRED at the close of Phase 12. They are documented
in `gates/gate-3-future-bugs.md` for the next planning cycle. Each is small
in concept but requires either infra changes (S3 bucket policy) or careful
per-call audit (PII masking) that exceeds the Phase 12 scope budget.

- SEC-004 (S3 SSE) — bucket-level default encryption is a one-line AWS console
  change, but the audited control wants `ServerSideEncryption: 'AES256'` on
  every `PutObjectCommand` so the contract is explicit in code.
- SEC-005 (PII masking) — requires a winston format that walks log payloads
  and replaces `email`, `phone`, `password*`, `token*`, and similar keys
  with `[REDACTED]`. Estimated 50-80 LOC plus per-call-site verification.
- SEC-009 (Admin CSP) — needs either `vercel.json` headers or an HTML meta
  tag plus careful nonce/hash management for inline scripts. Vite's dev
  server also needs the policy relaxed for HMR.

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
