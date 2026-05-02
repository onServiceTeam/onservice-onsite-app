# Phase M Batch 3 — API utils (7 files, ~653 lines)

## Files fully read
- packages/api/src/utils/admin-cookies.ts (127)
- packages/api/src/utils/currency.ts (10)
- packages/api/src/utils/hcaptcha.ts (54)
- packages/api/src/utils/logger.ts (84)
- packages/api/src/utils/pii-mask.ts (167)
- packages/api/src/utils/s3-bir.ts (95)
- packages/api/src/utils/totp.ts (116)

## Findings

### CRIT-M04 — TOTP encryption exists but is OPTIONAL; missing env var = plaintext storage in production
**Where found:** packages/api/src/utils/totp.ts:89-103
```ts
function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.TOTP_ENCRYPTION_KEY;
  if (!keyHex) return null;
  return Buffer.from(keyHex, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;  // ← Fallback: store unencrypted
  ...
}
```

**Understood:** The encryption IS implemented (AES-256-GCM with random IV, auth tag verification, base64 stored as `enc:<...>` prefix). But it falls back silently to plaintext if `TOTP_ENCRYPTION_KEY` env var isn't set. **This INVALIDATES Phase J's CRIT-160 as a migration finding** (encryption code exists) but PROMOTES it to a deployment configuration issue:

- If TOTP_ENCRYPTION_KEY is set in production → admin TOTP secrets are encrypted at rest. ✓
- If TOTP_ENCRYPTION_KEY is missing in production → every admin's TOTP secret is stored plaintext. NPC RA 10173 §28 violation. 2FA defeats by anyone with DB read access.

**Why critical:** The fallback is silent. There's no startup-time assertion that requires this env var in production. `apps/admin/app.config.ts` mobile equivalent has `reqEnv()` that throws when production env vars are missing — the API server has no equivalent for TOTP_ENCRYPTION_KEY. New admins onboarded after a deploy where the var was forgotten get plaintext-stored secrets that then need rotation.

**Fix:** Add `if (process.env.NODE_ENV === 'production' && !process.env.TOTP_ENCRYPTION_KEY) throw new Error('TOTP_ENCRYPTION_KEY required in production')` at server.ts startup. Add a migration that detects already-stored plaintext secrets and prompts admin re-enrollment. Document in launch-cutover.md as a hard prerequisite.

### MED-M11 — Logger doesn't redact scrypt password hashes; relies on caller discipline
**Where found:** packages/api/src/utils/logger.ts:6-8 (comment) + PII_PATTERNS:9-18
**Understood:** Comment line 6: "scrypt hashes (our format `salt:hash` or `scrypt:N:r:p:salt:hash`) are NOT regex-redacted because the pattern would over-match general hex strings; callers must avoid logging password_hash columns explicitly." If a service code path ever does `logger.info('user lookup', { user })` where user contains password_hash, the hash leaks to logs. The bcrypt regex `\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}` does catch bcrypt hashes (line 17), but the actual password_hash format is scrypt.
**Fix:** Add a key-based redaction pass: if any object key matches /password|hash|secret|token/i, replace value with `[REDACTED]`. This complements regex matching and fails-safe regardless of value format.

### MED-M12 — admin_session lifetime cap of 15 min ignores admin_session_timeout_hrs setting
**Where found:** packages/api/src/utils/admin-cookies.ts:121-127
```ts
export const ADMIN_SESSION_ACCESS_LIFETIME_MS =
  Math.min(
    platformConfig.adminSessionTimeoutHours * 3600 * 1000,
    15 * 60 * 1000,
  );
```
**Understood:** Comment says "configured admin-session lifetime" but the Math.min clamps to 15 minutes regardless. `admin_session_timeout_hrs` setting (migration 038, default 8 hours) has no effect — admin can configure 24h sessions in /admin/settings, server still uses 15min. Same broken-live-config pattern as CRIT-M01.
**Fix:** Either (a) drop the Math.min cap and trust the setting, OR (b) document explicitly that this is an intentional 15-min hard ceiling (security-driven) and remove the misleading "configured" language. Likely (a) since the setting exists for a reason.

### MED-M13 — pii-mask.ActorRole includes 'dpo' but JWT auth type doesn't issue 'dpo' role
**Where found:**
- packages/api/src/utils/pii-mask.ts:16-25 — `ActorRole` includes 'dpo'
- packages/api/src/middleware/auth.middleware.ts:8 — JWT payload role is 4-value union, no 'dpo'

**Understood:** Same root as CRIT-M03. The role-based masking has an explicit 'dpo' branch (raw IP, masked everything else) that is unreachable because the JWT type can't issue 'dpo'. Fix is the same scope as CRIT-M03.

### POSITIVE — admin-cookies.ts (Bug 1251 verified)
- Three-cookie scheme. admin_session HttpOnly path=/api. admin_refresh HttpOnly path=/refresh-endpoint. admin_csrf JS-readable path=/.
- SameSite=Strict on all three (strongest CSRF protection).
- crypto.randomBytes(32) for CSRF token (cryptographically random).
- DB-backed token validation in admin_csrf_tokens with revoked_at + expires_at.
- secure flag toggled by NODE_ENV (allows HTTP in dev, requires HTTPS in prod).

### POSITIVE — hcaptcha.ts
- Production fails closed if secret missing. Dev bypasses (sensible UX).
- Network errors fail closed (errorCode: 'network-error').
- Empty token fails closed.

### POSITIVE — logger.ts (PII regex masking)
- 8 patterns covering phone (PH formats), TIN, PhilHealth, SSS, PayMongo IDs, JWT, bcrypt hash, email.
- Pattern order matters (phone before email, otherwise email regex consumes phone-like strings).
- WeakSet prevents infinite recursion on circular references.
- Skips already-redacted strings (idempotent).

### POSITIVE — pii-mask.ts (D08 fix verified, Bugs 66/75/76/81/287/311/331/342/343/350)
- Role-aware: super_admin sees raw, dpo sees raw IP only (compliance investigations), all other roles fully masked.
- IPv4 keeps first 3 octets, IPv6 keeps first 4 groups.
- maskUserAgent buckets to ~7 known browsers.
- maskPhilippinePhone keeps last 4 digits ("+63 9XX XXX 1234").
- maskEmail: "j•••@example.com".
- Recursive maskPiiInObject masks nested key-based PII fields.

### POSITIVE — s3-bir.ts
- AES256 server-side encryption on PutObjectCommand.
- Returns null if not configured (graceful test/dev degradation).
- Re-throws upload errors so caller can decide fallback.
- Logs bucket+region+key+bytes on success/failure.

### POSITIVE — totp.ts
- RFC 6238 TOTP. crypto.timingSafeEqual on verification (prevents timing attacks).
- ±1 window (30s either way) for clock skew.
- Encryption code exists (AES-256-GCM with auth tag) — see CRIT-M04 for the deployment caveat.

## Cumulative Phase M progress: 38 / ~55 files (~1,948 lines)
