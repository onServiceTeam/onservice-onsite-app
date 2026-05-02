# Phase C Findings Part 4 — auth.routes.ts (977 lines)

**Phase C running total: ~4,461 lines fully read.**
**Audit grand total: ~18,060 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-58)

### CRIT-59 — Backup codes are NOT generated at 2FA enable time
**File:** [packages/api/src/routes/auth.routes.ts:744-835](packages/api/src/routes/auth.routes.ts#L744)
The `/admin/2fa/enable` endpoint sets `totp_enabled=TRUE` but **never calls `admin-2fa.service.ts:generateBackupCodes`**. After enabling 2FA, the admin has zero backup codes.

If the admin loses their phone (or the authenticator app is wiped), they cannot log in. The only recovery path is `consumeBackupCode` (admin-2fa.service.ts:151), which requires backup codes that were never generated.

**Effective consequence:** Account lockout = ticket to a super_admin, who can reset the user (assuming a super_admin exists and isn't also locked out). Per the staff.service.ts comment "Lost authenticator + lost backup codes = super_admin reset" — but the codes the user thinks they have don't exist.

**Fix dispatch:**
```
1. In auth.routes.ts:744-835 (enable handler), after totp_enabled=TRUE:
   const backupBundle = await adminTwoFaService.generateBackupCodes(userId);
2. Return backupBundle.codes in the success response so the admin UI can display them ONCE.
3. The admin UI must show the codes with a "I have saved these codes" confirmation gate before navigating away.
4. For the forced-enrollment path (req.isSetupToken === true) at line 794-825, also include backupCodes in the response.
5. Test: POST /admin/2fa/enable success → response includes 8 backup codes, admin_backup_codes table has 8 rows.
```

### CRIT-60 — Admin 2FA disable has no audit row + no admin notification
**File:** [packages/api/src/routes/auth.routes.ts:924-975](packages/api/src/routes/auth.routes.ts#L924)
```ts
await db.query(
  `UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, updated_at = NOW() WHERE id = $1`,
  [userId],
);
logger.info('Admin 2FA disabled', { userId });
res.json({ success: true, data: { message: 'Two-factor authentication has been disabled.' } });
```
- **No `admin_actions` audit row.** Cannot answer "who disabled 2FA on Maria's account."
- **No notification to the admin.** A session takeover that disables 2FA happens silently.
- **No second factor required.** Just the current TOTP code (which the attacker has if they're already in the session).

**Fix dispatch:**
```
1. Wrap in db.transaction:
   - UPDATE users SET totp_secret=NULL, totp_enabled=FALSE
   - INSERT admin_actions (admin_id=userId, action_type='admin_2fa_disabled', target_type='user', target_id=userId, details={ipAddress, userAgent}, reason='Self-disabled 2FA')
   - Soft-delete all backup codes (admin_backup_codes UPDATE deleted_at=NOW(), deleted_by=userId).
2. Send notification to admin (and copy to super_admin team) — security email/SMS.
3. Step-up auth: require BOTH current TOTP AND password re-entry to disable 2FA. Currently only TOTP required. If session is hijacked but password unknown, attacker can't disable.
4. Add 24h delay before disable takes effect (with admin notification + cancel link). Attacker stuck.
5. Test: disable 2FA → admin_actions row exists, notification sent, backup codes soft-deleted.
```

### CRIT-61 — Admin login returns access+refresh tokens in JSON body even when cookies are set
**File:** [packages/api/src/routes/auth.routes.ts:577-585, 678-686, 814-823](packages/api/src/routes/auth.routes.ts#L577)
Comment at line 565-568 says "for backward compat with existing admin client; the client refactor on the same PR stops reading them." But:
- If the admin web client still reads from JSON body and stores in localStorage, the HttpOnly cookie protection is defeated — XSS can read the JSON-stored token.
- This is a transition risk: until the admin client is verified to use cookies only, the dual-return surface keeps the XSS window open.

**Fix dispatch:**
```
1. Verify admin web client (apps/admin/src/) reads admin_session via cookies, NOT from a stored Bearer token. (Check in Phase F.)
2. If verified: remove accessToken + refreshToken from JSON body. Return only `user` and `sessionExpiresAt`. Update mobile clients (which also use this endpoint? — no, /admin/login is admin-only, mobile uses /verify-otp).
3. If admin client still uses Bearer: prioritize the migration. Block the dual-return removal until done.
4. Add a CI test: scan apps/admin/src/ for `localStorage.setItem('accessToken'...` and fail if found.
```

### CRIT-62 — Email change in PATCH /me has no verification
**File:** [packages/api/src/routes/auth.routes.ts:351-399](packages/api/src/routes/auth.routes.ts#L351)
```ts
if (email !== undefined) {
  sets.push(`email = $${idx++}`);
  vals.push(email);
}
```
User can change their email to any address. No confirmation link, no proof of ownership.

Combined with the admin login flow (which uses email as the login identifier, line 411-414), this allows:
1. User compromises a customer account (via stolen refresh token, etc.).
2. User PATCHs /me with attacker's email.
3. Account-recovery flows that rely on email (password reset, security alerts) now go to the attacker.

For customer accounts (not admin login by email), this is medium severity. For ADMIN accounts (CRIT — but admin doesn't typically use /me for email), severe.

**Fix dispatch:**
```
1. Move email change to a separate flow:
   - POST /me/email/initiate { newEmail } → sends confirmation link to the new email with short-lived token.
   - GET /me/email/confirm?token=... → verifies and applies.
2. Reject email update via PATCH /me.
3. For admin accounts, additionally require current password to initiate email change.
4. Add audit row for both initiate and confirm.
5. Notify the OLD email address about the change.
6. Test: PATCH /me { email: 'new@example.com' } → 400; flow via initiate+confirm works.
```

---

## MEDIUM bugs

### MED-95 — authRateLimit is 10/15min — stricter than global but still permissive
**File:** [packages/api/src/routes/auth.routes.ts:128-140](packages/api/src/routes/auth.routes.ts#L128)
10 requests / 15 min for auth endpoints. Industry standard for failed-login protection is 5 / 15 min. Also doesn't differentiate success vs failure — a successful login counts toward the limit.

**Fix:** Add `skipSuccessfulRequests: true`. Drop max to 5.

### MED-96 — adminAuthOrSetupToken middleware uses dynamic import of jsonwebtoken
**File:** [packages/api/src/routes/auth.routes.ts:83](packages/api/src/routes/auth.routes.ts#L83)
```ts
const jwt = await import('jsonwebtoken');
```
Same pattern repeated at lines 483, 514, 603, 855. Static top-level import would be clearer and avoid bundler complexity.

### MED-97 — verify-otp returns user fields with empty strings for new users
**File:** [packages/api/src/routes/auth.routes.ts:271-280](packages/api/src/routes/auth.routes.ts#L271)
For new users (auto-created via CRIT-52 above), firstName/lastName are `''` and email is `null`. UI then shows "Hello !" greetings. Once CRIT-52 is fixed (forced registration step), this becomes moot. Until then, mobile UI should defensively show "Welcome!" if firstName empty.

### MED-98 — Profile updates have no audit trail
**File:** [packages/api/src/routes/auth.routes.ts:351-399](packages/api/src/routes/auth.routes.ts#L351)
No record of who changed what when. For customer accounts, lower severity; for admin accounts using PATCH /me to change name, lost compliance trail. Add audit row at least for admin role users.

### MED-99 — refresh-token endpoint has no captcha / rate-limit beyond global
**File:** [packages/api/src/routes/auth.routes.ts:301-312](packages/api/src/routes/auth.routes.ts#L301)
A stolen refresh token can be used at full rate. Combined with no replay detection (CRIT-53), an attacker can rotate tokens silently as long as they're faster than the legitimate user's next refresh. Add the auth rate-limit middleware here too.

### MED-100 — refresh-token success/failure not audited
**File:** [packages/api/src/routes/auth.routes.ts:301-312](packages/api/src/routes/auth.routes.ts#L301)
No `recordLoginAttempt` or `logSecurityEvent` for refresh attempts. Refresh-token theft is invisible until the legitimate user notices their session is lost. Add `logSecurityEvent({eventType: 'token_refreshed'})` so anomaly detection has signal.

### MED-101 — Admin login lacks Zod validation
**File:** [packages/api/src/routes/auth.routes.ts:401-410](packages/api/src/routes/auth.routes.ts#L401)
Manual `if (typeof email !== 'string')` checks. Add `adminLoginSchema` to `validators/auth.validators.ts`:
```ts
export const adminLoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
}).strict();
```

### MED-102 — sessionExpiresAt advertises 8h but access token is 15m
**File:** [packages/api/src/routes/auth.routes.ts:583, 684, 821, 889](packages/api/src/routes/auth.routes.ts#L583)
Returns `sessionExpiresAt` based on `adminSessionTimeoutHours * 3600 * 1000` (= 8h). But access token actually expires in 15m (CRIT-48). UI shows "8h remaining" but token expires far sooner. Refresh fills the gap, but the UI display is wrong. Either:
- Return access token expiry (15m) — accurate but confusing for users.
- Return refresh token expiry (7d for admin per admin-cookies.ts) — more accurate description of "how long can I stay logged in without re-entering password".

### MED-103 — Setup secret returned in plaintext in /admin/2fa/setup response
**File:** [packages/api/src/routes/auth.routes.ts:730-737](packages/api/src/routes/auth.routes.ts#L730)
```ts
res.json({ success: true, data: { secret, uri, ... } });
```
The plaintext base32 secret AND the otpauth URI (which contains the secret) are returned in JSON. This is necessary for the QR code, but:
- Browser stores in memory and possibly history.
- Intermediate proxies/CDNs could cache.
- Logger redacts JWT but not base32 secrets.

**Mitigations:**
1. Set `Cache-Control: no-store, no-cache, must-revalidate` on this response.
2. Set `X-Content-Type-Options: nosniff` (helmet does this).
3. Add the base32 secret pattern (`/[A-Z2-7]{32}/`) to logger.ts PII redaction list.

### MED-104 — TOTP code length not validated at the route layer
**File:** [packages/api/src/routes/auth.routes.ts:752, 932](packages/api/src/routes/auth.routes.ts#L752)
```ts
if (typeof totpCode !== 'string' || !totpCode) throw createAppError(...)
```
No `.length === 6` check. `verifyTotp` at totp.ts:69 catches `/^\d{6}$/` later. Move check to schema for early rejection.

### MED-105 — Refresh endpoint revokes ALL CSRF tokens per refresh (multi-tab break)
**File:** [packages/api/src/routes/auth.routes.ts:875](packages/api/src/routes/auth.routes.ts#L875)
```ts
await revokeAdminCsrfTokens(user.id);
```
After refresh, the OTHER browser tabs (still holding the old admin_csrf cookie + DB row) instantly stop being able to write — admin-csrf.middleware.ts will return 403. Multi-tab admin workflow breaks.

**Fix:** instead of revoking ALL, revoke the SPECIFIC token in the request's cookie (if present). Issue a new one. Other tabs continue using their old (still-valid) tokens until their own refresh boundary.

OR: serve a "session refreshed in another tab" UI hint and force re-login in older tabs.

---

## LOW / INFO

- **2FA enrollment is forced** for all admin/super_admin accounts (line 510-540). Existing accounts without TOTP cannot fully log in until they enroll. **Strong security posture.**
- **Cookie-based admin auth** (Bug 1251 fix) correctly applied: setAdminSessionCookies after successful login + 2FA verify.
- **Per-route auth rate limit** (10/15min) is stricter than global (100/15min). Good.
- **Lockout + captcha gate** at /send-otp and /verify-otp is well-designed.
- **Pre-auth tokens** (`pre_auth_2fa`, `pre_auth_2fa_setup`) properly typed and verified.
- **Opportunistic password rehash** (line 462-471) migrates legacy scrypt params on successful login.

---

## What's left in Phase C

- `routes/admin.routes.ts` (1,614 — split into 2 reads)
