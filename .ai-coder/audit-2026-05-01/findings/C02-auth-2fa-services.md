# Phase C Findings Part 2 — Core Auth Services (auth.service + admin-2fa.service)

Files added in this batch:
- `services/auth.service.ts` (387)
- `services/admin-2fa.service.ts` (232)

**Phase C running total: ~2,119 lines fully read.**
**Audit grand total: ~15,718 lines fully read.**

---

## CRITICAL bugs (continuing from CRIT-50)

### CRIT-51 — OTP code comparison is non-constant-time (timing attack)
**File:** [packages/api/src/services/auth.service.ts:242](packages/api/src/services/auth.service.ts#L242)
```ts
if (otpRecord.code !== code) {
  await db.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otpRecord.id]);
  ...
}
```
String inequality (`!==`) leaks per-character timing information. With 6-digit codes (1M space) and 3 attempts max, an attacker who can repeatedly request OTPs (bypassing the 60s cooldown via different phone numbers OR a compromised SMS gateway) could probabilistically narrow the code via response timing differences.

Less likely in practice (rate-limited, OTP rotates, SMS gateway provides covert codes), but defense-in-depth required.

**Fix dispatch:**
```
1. Convert to constant-time:
   const codeMatch = otpRecord.code.length === code.length &&
     crypto.timingSafeEqual(Buffer.from(otpRecord.code), Buffer.from(code));
   if (!codeMatch) { ... }
2. Test: send 1000 verifyOtp calls with one wrong digit each, measure timing variance — should be ~0.
```

### CRIT-52 — OTP-verify auto-creates user accounts with empty profile
**File:** [packages/api/src/services/auth.service.ts:262-269](packages/api/src/services/auth.service.ts#L262)
```ts
if (userResult.rows.length === 0) {
  isNewUser = true;
  userResult = await db.query<UserRow>(
    `INSERT INTO users (phone, first_name, last_name, is_verified)
     VALUES ($1, '', '', TRUE)
     RETURNING *`,
    [phone],
  );
}
```
A successful OTP for ANY +63 phone number creates a user with empty first_name, last_name, is_verified=TRUE, and immediately issues a customer JWT. This is "fast signup" — but:

1. Empty names propagate everywhere (chat, reviews, notifications) — UX issue.
2. No email collected, no name collected, no Terms acceptance recorded.
3. Combined with CRIT-22 (no JWT revocation): a phone number swap (SIM swap attack) lets attacker create + access an account on the victim's number indefinitely.
4. NPC RA 10173 §11 requires CONSENT to be unambiguous. Auto-creating accounts on OTP verify isn't unambiguous consent.

**Fix dispatch:**
```
1. Two-step signup:
   - Step 1 (sendOtp): unchanged — user enters phone, receives SMS.
   - Step 2 (verifyOtp): if user exists → log in. If user does NOT exist → return {requiresRegistration: true, registrationToken} where registrationToken is a short-lived JWT (5 min, type='registration_pending').
   - Step 3 (new endpoint POST /auth/register): consume registrationToken + collect first_name, last_name, email, terms_accepted_at, then create user + issue full token pair.
2. Reject login for any user with first_name='' OR last_name='' OR terms_accepted_at IS NULL — force them through registration finish.
3. Migration: backfill existing empty-name users with first_name='Pending', last_name='Profile', force them through profile-completion screen at next login.
4. Test: verifyOtp on new phone returns 'requiresRegistration', no user row created until /auth/register POST.
```

### CRIT-53 — Refresh-token replay detection missing
**File:** [packages/api/src/services/auth.service.ts:319-330](packages/api/src/services/auth.service.ts#L319)
```ts
const tokenResult = await db.query<RefreshTokenRow>(
  `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()`,
  [tokenHash],
);
if (tokenResult.rows.length === 0) {
  throw createAppError('Refresh token not found or expired.', 401);
}
await db.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
```
Token rotation is correct (delete old, issue new). But there's no detection of REPLAY:

Scenario: attacker steals refresh token. Both attacker and legitimate user race to refresh. First to refresh gets the new pair; the other's call returns 401. **The legitimate user just sees a "session expired" — no signal that a breach occurred.**

OWASP recommends: when a previously-used (deleted) refresh token is presented, REVOKE ALL refresh tokens for that user (force re-login everywhere) AND alert the user/ops.

**Fix dispatch:**
```
1. Don't DELETE the consumed refresh token. Instead, mark it `consumed_at = NOW()`.
2. On refresh attempt where token_hash exists AND consumed_at IS NOT NULL:
   - Detect replay.
   - DELETE all refresh_tokens for that user_id.
   - INSERT notifications row alerting user: "Suspicious activity detected — please re-login."
   - INSERT admin_actions audit row.
   - Return 401.
3. Add nightly cron to permanently DELETE refresh_tokens where consumed_at < NOW() - INTERVAL '7 days' (cleanup).
4. Tests:
   - Use refresh token once → success.
   - Use same refresh token twice → second call returns 401, all user's refresh_tokens deleted.
```

### CRIT-54 — Refresh token hash uses fast SHA-256 (rainbow-table risk if DB leaked)
**File:** [packages/api/src/services/auth.service.ts:53-55](packages/api/src/services/auth.service.ts#L53)
```ts
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```
SHA-256 is fast (~ns). If `refresh_tokens` table is leaked, attacker can compute SHA-256 of any candidate JWT and find matches in the dump. JWT structure is well-known — header is predictable, body has bounded entropy. Combined with leaked JWT_SECRET (separate compromise), attacker reconstructs valid refresh tokens.

Not as severe as plaintext storage, but defense-in-depth: use HMAC-SHA-256 with a secret stored OUTSIDE the DB.

**Fix dispatch:**
```
1. Add env var REFRESH_TOKEN_HMAC_SECRET (32+ random bytes, hex).
2. Replace hashToken with:
   function hashToken(token: string): string {
     const secret = process.env.REFRESH_TOKEN_HMAC_SECRET;
     if (!secret) throw new Error('REFRESH_TOKEN_HMAC_SECRET required');
     return crypto.createHmac('sha256', secret).update(token).digest('hex');
   }
3. Migration: invalidate all existing refresh_tokens (DELETE *) — users get one forced re-login. Document in runbook.
4. Test: hash same token twice, get same output. Hash with different secret, get different output.
```

### CRIT-55 — sendOtp marks-then-inserts is non-transactional (race)
**File:** [packages/api/src/services/auth.service.ts:188-199](packages/api/src/services/auth.service.ts#L188)
```ts
await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE phone = $1 AND is_used = FALSE`, [phone]);
const otp = generateOtp();
const expiresAt = ...;
await db.query(`INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`, [phone, otp, expiresAt]);
const sent = await sendOtpSms(phone, otp);
if (!sent && process.env.NODE_ENV === 'production') {
  throw createAppError('Failed to send verification code. Please try again.', 502);
}
```
- UPDATE + INSERT are SEPARATE queries (not in transaction). Two concurrent sendOtp calls can both pass cooldown check, both mark-all-used, both INSERT — leaving 2 active OTPs.
- SMS send is AFTER the INSERT. If SMS fails in production, the INSERT succeeded — user has an OTP they never received, AND the cooldown blocks re-request for 60 seconds.

**Fix dispatch:**
```
1. Wrap UPDATE + INSERT in db.transaction. Locks via UPDATE ... WHERE phone = $1 AND is_used = FALSE prevent the race (the lock is held until commit).
2. Reorder: send SMS FIRST (before INSERT). Only INSERT (and commit) on SMS success.
   - Risk: race where SMS sends but INSERT fails. User receives a code that's not in DB. Worse than current.
   - Compromise: send SMS in the transaction, INSERT, COMMIT. If SMS fails, ROLLBACK INSERT. The transaction remains short.
3. Test: kill DB connection between INSERT and SMS, verify INSERT rolled back; verify retry works.
```

---

## MEDIUM bugs

### MED-78 — sendOtp logs phone last-4 (already redacted by logger PII mask, double-protection)
**File:** [packages/api/src/services/auth.service.ts:206](packages/api/src/services/auth.service.ts#L206)
Defensive but redundant — logger.ts already redacts phones. Still acceptable.

### MED-79 — verifyOtp creates token pair outside transaction
**File:** [packages/api/src/services/auth.service.ts:284-295](packages/api/src/services/auth.service.ts#L284)
User INSERT/UPDATE + refresh_tokens INSERT are separate queries. If refresh INSERT fails, user is created/updated but no refresh token. Forces immediate re-OTP — annoying but not money-loss.

### MED-80 — refreshAccessToken DELETE then INSERT non-transactional
**File:** [packages/api/src/services/auth.service.ts:330,349](packages/api/src/services/auth.service.ts#L330)
Same pattern. If INSERT fails after DELETE, user must re-login.

### MED-81 — admin-2fa generateBackupCodes hashes 8 codes synchronously
**File:** [packages/api/src/services/admin-2fa.service.ts:92-97](packages/api/src/services/admin-2fa.service.ts#L92)
8 × ~50ms scryptSync = ~400ms blocking event loop. For low-traffic admin endpoint OK, but better as `Promise.all([...])` with worker_threads or scryptAsync.

### MED-82 — admin-2fa consumeBackupCode timing leak based on code count
**File:** [packages/api/src/services/admin-2fa.service.ts:172-177](packages/api/src/services/admin-2fa.service.ts#L172)
Loops through ALL active codes. Admin with 8 codes responds slower than admin with 2 codes. Theoretical only — both attacker and defender know how many codes exist, no real info leaked.

### MED-83 — auth.service.ts SCRYPT_N=131072 is good but no benchmark/tuning per-deployment
**File:** [packages/api/src/services/auth.service.ts:57](packages/api/src/services/auth.service.ts#L57)
On a slow VM (1 vCPU, 1GB RAM), 131072 iterations may take >500ms — bad UX. On a fast server, could go higher. The verifyPasswordWithRehash already supports param drift via the version-prefixed format. Document the choice and add a runbook note for ops to benchmark.

---

## LOW / INFO

- **scrypt parameters at OWASP recommendations.** N=131072 (= 2^17), r=8, p=1 — strong against GPU attacks.
- **Backup codes are excellent:** 8 codes, single-use, scrypt-hashed, soft-delete on regen, audit row paired in same tx, FOR UPDATE lock on consume.
- **Refresh-token rotation is correct** (modulo CRIT-53 replay detection).
- **Refresh token type='refresh' marker** prevents misuse as access token (auth.middleware.ts line 60-63 enforces — verified in B04).
- **Versioned password hash format** (`scrypt:N:r:p:salt:hash`) supports future param tuning without forcing users to reset.
- **OTP cooldown + hourly limit** prevents SMS bomb attacks.

---

## What's still ahead in Phase C

- `services/admin.service.ts` (520)
- `services/staff.service.ts` (321)
- `services/security.service.ts` (524)
- `routes/auth.routes.ts` (977)
- `routes/admin.routes.ts` (1,614 — split read)

Subtotal still to read: ~3,956 lines.
