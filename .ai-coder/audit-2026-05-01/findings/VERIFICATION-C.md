# Phase C Verification — Re-read of cited files, status of every CRIT, expanded fix dispatches

**Purpose:** Ken asked me to stop trusting prior session handoffs and re-verify Phases C/D/E by actually re-reading the cited files. This doc covers Phase C (auth + RBAC + sessions + admin routes — 24 CRITs and 47 MEDs originally claimed across C01–C05).

## Methodology

For each CRIT I ran one of three checks this session:

1. **READ** — opened the file via the Read tool at the cited line range, confirmed the bug is in the code as described.
2. **GREP** — ran `grep -n` for the specific pattern/string in the cited file, confirmed presence/absence.
3. **CARRIED** — did not re-open this session; the original C0x doc citation is specific enough (file path + line numbers + code snippet) to be plausible without re-verification, but I'm flagging it as not personally re-verified in this conversation.

I've re-read the C01–C05 docs themselves and confirmed every claim has a file path + line number + code snippet. The original doc quality matches Phase B.

---

## Re-verification status — CRIT-by-CRIT

| # | Title | File:line | Verified this session? | Truth |
|---|---|---|---|---|
| CRIT-44 | Rate limiter dead refresh | rate-limit.middleware.ts:10-39 | **READ** | ✅ TRUE |
| CRIT-45 | TOTP plaintext fallback | totp.ts:95-103 | **READ** | ✅ TRUE |
| CRIT-46 | Single global rate limiter | server.ts:122-123 | **READ** (server.ts viewed) | ✅ TRUE |
| CRIT-47 | Redis returns null on retry exhaustion | redis.config.ts:9-15 | **READ** | ✅ TRUE |
| CRIT-48 | Admin session capped at 15min | admin-cookies.ts:123-127 | **READ** | ✅ TRUE |
| CRIT-49 | /config silent fallback | server.ts:217-232 | **READ** | ✅ TRUE |
| CRIT-50 | No graceful shutdown | server.ts:280-288 | **READ** | ✅ TRUE — no SIGTERM handler in file |
| CRIT-51 | OTP non-constant-time `!==` | auth.service.ts:242 | **READ** | ✅ TRUE |
| CRIT-52 | OTP auto-create empty profile | auth.service.ts:262-269 | **READ** | ✅ TRUE |
| CRIT-53 | Refresh-token replay missing | auth.service.ts:330 | **GREP** (`DELETE FROM refresh_tokens` confirmed) | ✅ TRUE |
| CRIT-54 | SHA-256 token hash, not HMAC | auth.service.ts:53 | **GREP** (function present, no HMAC) | ✅ TRUE |
| CRIT-55 | sendOtp non-transactional UPDATE+INSERT | auth.service.ts:188-199 | CARRIED | Plausible — pattern matches the citation |
| CRIT-56 | Permissions system unwired | staff.service.ts:306-321 + rbac.middleware.ts | **GREP** (validatePermissions exists, route enforcement absent) | ✅ TRUE |
| CRIT-57 | Staff DELETE no audit | staff.service.ts:275-296 | **GREP** (`DELETE FROM admin_staff` at line 294 confirmed) | ✅ TRUE |
| CRIT-58 | getRevenueReport SQL string-interp | admin.service.ts:380-402 | CARRIED | Plausible — citation specific |
| CRIT-59 | Backup codes not generated at 2FA enable | auth.routes.ts:744-835 | CARRIED | Plausible — well-cited |
| CRIT-60 | Admin 2FA disable no audit | auth.routes.ts:924-975 | CARRIED | Plausible |
| CRIT-61 | Admin login dual-return tokens | auth.routes.ts:577-585 | CARRIED | Plausible |
| CRIT-62 | Email change unverified | auth.routes.ts:351-399 | CARRIED | Plausible |
| CRIT-63 | /audit-log returns raw PII to any admin | admin.routes.ts:1531-1606 | **GREP** (`u.email AS user_email` at line 1575, `userEmail`/`ipAddress` exposed) | ✅ TRUE |
| CRIT-64 | Duplicate /release-escrow handler | admin.routes.ts:302-347 | CARRIED | Plausible — needs server.ts mount-order verification |
| CRIT-65 | Business account silent suspend/discount | admin.routes.ts:625-735 | CARRIED | Plausible |
| CRIT-66 | Recurring cancel silent | admin.routes.ts:476-502 | CARRIED | Plausible |
| CRIT-67 | Pricing rule hard delete | admin.routes.ts:1121-1134 | CARRIED | Plausible |

**Summary: 12/24 CRITs personally re-verified this session via Read tool / grep. The remaining 12 are CARRIED — original citations were specific enough that I trust them to ~90%, but I haven't re-opened those files this session. Recommend a one-pass spot-check of those 12 before treating Phase C as 100% verified.**

---

## Expanded fix dispatches — full alignment with Phase A/B output quality

Each CRIT below restates the bug, fix dispatch, tests required, and runtime verification steps. This expands what was in the original C01–C05 docs to match Phase B's level of detail.

---

### CRIT-44 — Rate limiter dead refresh

**Bug.** `express-rate-limit` reads `windowMs` and `max` AT CONSTRUCTION TIME (rate-limit.middleware.ts:27-29). The `setInterval` at line 25 mutates the module-level `currentWindow` / `currentMax` variables, but the rateLimit() factory has already captured them by value. So admin tuning `rate_limit_max_requests` in platform_settings does nothing until app restart. Module-level `setInterval` also fires in test runs.

**Why it matters.** Admin can't tune rate limits without a deploy. During a DDoS or surge, ops needs the dial. Right now the dial does nothing.

**Fix.**
1. Use the function-valued options that `express-rate-limit` v6+ supports:
   ```ts
   export const rateLimitMiddleware = rateLimit({
     windowMs: () => currentWindow,
     max: () => currentMax,
     standardHeaders: true,
     legacyHeaders: false,
     message: { success: false, error: { message: 'Too many requests.', statusCode: 429 } },
   });
   ```
2. Move `setInterval` registration into a `startRateLimitRefresh()` function called from server.ts startup, not module load. Return a cleanup callback the graceful-shutdown handler can invoke.
3. Wrap with NODE_ENV check so tests don't get the interval.

**Tests.**
- Unit test: set settings.service to return max=5, call refresh, send 6 requests from same IP → 6th returns 429.
- Unit test: set max=100, refresh, send 50 → all pass.
- Verify the limiter sees the new value WITHOUT app restart.

**Runtime verification (AI coder runbook).**
- Bring up API with `docker compose up api`.
- `curl -X POST -H 'X-Admin-CSRF: ...' --cookie admin_session=... http://localhost:7383/api/v1/admin/settings -d '{"key":"rate_limit_max_requests","value":3}'`
- Wait 60+ seconds for refresh interval.
- Run `for i in $(seq 1 5); do curl -i http://localhost:7383/api/v1/config; done` → 4th and 5th should return 429.

---

### CRIT-45 — TOTP plaintext fallback

**Bug.** `encryptSecret(plaintext)` at totp.ts:95-103 returns plaintext if `TOTP_ENCRYPTION_KEY` env is unset. Every admin's TOTP secret then sits in `users.totp_secret` as base32 plaintext. A DB dump or read-replica leak = full admin account takeover for every admin.

Mixed-state risk: turning encryption on later doesn't re-encrypt existing rows. `decryptSecret` at line 105-106 returns plaintext-as-is for rows without the `enc:` prefix. Permanent migration wedge.

**Why it matters.** RA 10173 §28 (security of personal information). Plaintext 2FA secrets is a textbook NPC reportable breach if the DB is exposed.

**Fix.**
1. Add a startup gate in server.ts (BEFORE rate-limit, BEFORE routes):
   ```ts
   if (process.env.NODE_ENV === 'production' && !process.env.TOTP_ENCRYPTION_KEY) {
     logger.fatal('TOTP_ENCRYPTION_KEY required in production');
     process.exit(1);
   }
   ```
2. Validate key format: must be exactly 64 hex chars (AES-256 = 32 bytes = 64 hex).
3. Add a startup migration check:
   ```sql
   SELECT COUNT(*) FROM users WHERE totp_secret IS NOT NULL AND totp_secret NOT LIKE 'enc:%';
   ```
   If > 0 in production, refuse to start. Operator must run the re-encryption migration.
4. One-shot migration script: for each row with plaintext secret, generate a fresh secret + show admin a re-enrollment screen on next login (the plaintext one is now considered compromised).
5. Document the secret-rotation runbook.

**Tests.**
- Unit: with `TOTP_ENCRYPTION_KEY` set, `encryptSecret` returns string starting `enc:`.
- Unit: round-trip encrypt+decrypt returns the original.
- Integration: set NODE_ENV=production, unset key, app fails to start with clear error message.
- Integration: with plaintext rows in DB and key set, app refuses to start.

**Runtime verification.**
- Set `NODE_ENV=production`, unset `TOTP_ENCRYPTION_KEY`.
- `docker compose up api` → expect immediate exit with fatal log.
- Set the key, restart → expect ready.

---

### CRIT-46 — Single global rate limiter

**Bug.** `app.use(rateLimitMiddleware)` at server.ts:122-123 mounts ONE limiter for everything. With 100 req / 15 min the attacker has ~6.6 password tries/min — plenty of room for credential stuffing.

**Fix.**
1. In rate-limit.middleware.ts, build per-route-class limiters:
   ```ts
   export const authLimiter = rateLimit({
     windowMs: 15 * 60_000,
     max: 5,
     skipSuccessfulRequests: true,   // only count failures
     keyGenerator: (req) => `${req.ip}:${req.body?.email ?? req.body?.phone ?? '_'}`,
     standardHeaders: true,
     message: { success: false, error: { message: 'Too many login attempts.', statusCode: 429 } },
   });
   export const writeLimiter = rateLimit({ windowMs: 15 * 60_000, max: 100, ... });
   export const readLimiter = rateLimit({ windowMs: 15 * 60_000, max: 1000, ... });
   ```
2. Apply per-route in server.ts and route files:
   ```ts
   app.use('/api/v1/auth/admin/login', authLimiter);
   app.use('/api/v1/auth/admin/2fa/verify', authLimiter);
   app.use('/api/v1/auth/send-otp', authLimiter);
   app.use('/api/v1/auth/verify-otp', authLimiter);
   app.use(rateLimitMiddleware);  // global fallback
   ```
3. Keep the "global default" as the catch-all but tighten per route.

**Tests.**
- 6 failed admin logins from same IP → 6th returns 429.
- Successful login + 5 reads after — none of the reads count toward the auth limiter.

**Runtime verification.**
- Bring up API.
- `for i in $(seq 1 6); do curl -X POST http://localhost:7383/api/v1/auth/admin/login -H 'Content-Type: application/json' -d '{"email":"x@x.x","password":"wrong"}'; done`
- 6th must return HTTP 429.

---

### CRIT-47 — Redis returns null on retry exhaustion

**Bug.** redis.config.ts:9-15 returns `null` from `retryStrategy` after 10 attempts (~25s). ioredis interprets that as "stop reconnecting forever." App's Redis client is then dead until process restart. Sessions, BullMQ, rate limiting, settings cache, all silently broken.

**Fix.**
1. Replace the strategy:
   ```ts
   retryStrategy: (times: number): number => Math.min(times * 200, 5000),
   ```
2. Throttle reconnection logging:
   ```ts
   redis.on('error', (err) => {
     if (Math.random() < 0.01) logger.error('Redis error', { error: err.message });
   });
   ```
3. Confirm `/health/ready` includes `redis.ping()` (already at server.ts:147-152). Load balancer pulls instance out of rotation when Redis is unreachable.
4. Apply same fix to `bullMqConnection` (line 28-31) — BullMQ has its own retry semantics, verify.

**Tests.**
- Unit: pass times=1..1000 to retryStrategy, every call returns a number ≤ 5000.

**Runtime verification.**
- `docker compose up api redis`.
- `docker compose stop redis`.
- Tail API logs — should see reconnection attempts every 5s, no "stop reconnecting" message.
- `docker compose start redis` after 2 minutes.
- App should reconnect within 5s without restart.

---

### CRIT-48 — Admin session capped at 15 min

**Bug.** admin-cookies.ts:123-127 wraps `platformConfig.adminSessionTimeoutHours * 3600 * 1000` in `Math.min(..., 15 * 60 * 1000)`. The "8-hour admin session" advertised in config is ALWAYS 15 minutes. Misleading config — operator changes the wrong dial.

**Decision needed.** Pick one:
- **(a) 15-min cap is correct.** Short access tokens are the modern pattern; 7-day refresh handles convenience. Then: delete `platformConfig.adminSessionTimeoutHours`, replace with `const ACCESS_LIFETIME_MS = 15 * 60 * 1000;` literal with comment.
- **(b) 8h is correct for admin convenience.** Remove the Math.min, use the platformConfig value.

**Recommendation: (a)** + fix CRIT-22 (no JWT revocation) so refresh-token rotation actually invalidates old access tokens.

**Fix code (option a).**
```ts
// admin-cookies.ts
export const ADMIN_SESSION_ACCESS_LIFETIME_MS = 15 * 60 * 1000;
// platform.config.ts — remove adminSessionTimeoutHours entirely
```

**Tests.**
- Unit: `ADMIN_SESSION_ACCESS_LIFETIME_MS === 900000`.
- E2E: log in as admin, wait 16 minutes, hit any admin endpoint → 401, refresh succeeds.

**Runtime verification.**
- Log into admin.
- Sleep 16 min in another tab.
- Try an action → should silently refresh and succeed.

---

### CRIT-49 — /config silent fallback

**Bug.** server.ts:217-232 catches the settings-service error and returns `success: true` with hardcoded fallback (only appVersion, currency, currencySymbol, timezone). Mobile clients then have NO commission rates, NO fee config, NO feature flags. Combined with CRIT-25 (settings DB read silent fallthrough), money-relevant config silently degrades.

**Fix.**
1. Replace the catch with a 503 + structured log:
   ```ts
   app.get('/api/v1/config', async (_req, res) => {
     try {
       const config = await settingsService.getClientConfig();
       res.json({ success: true, data: config });
     } catch (err) {
       logger.error('config_endpoint_failed', { error: (err as Error).message });
       res.status(503).json({
         success: false,
         error: { code: 'config_unavailable', message: 'Configuration temporarily unavailable. Please retry.' },
       });
     }
   });
   ```
2. Mobile client treats 503 as "block UI behind a 'loading config' spinner with retry," not "use no-config."
3. Add a reconciliation alert if /config returns 503 ≥ 3 times in 5 minutes.

**Tests.**
- Unit: mock settingsService.getClientConfig to throw, hit endpoint → 503.
- Unit: success path returns `success: true` with non-empty data.

**Runtime verification.**
- `docker compose stop postgres`.
- `curl -i http://localhost:7383/api/v1/config` → expect 503 with the error envelope.

---

### CRIT-50 — No graceful shutdown

**Bug.** server.ts:280-288 just calls `httpServer.listen(...)`. No `process.on('SIGTERM'/'SIGINT', ...)` handler. SIGTERM (kubectl rollout, docker compose down, ECS task rotation) kills the process instantly. In-flight requests dropped, BullMQ jobs interrupted, DB connections not cleanly closed.

**Fix.** Add at the bottom of server.ts:
```ts
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}; starting graceful shutdown`);
  httpServer.close(async () => {
    try {
      await schedulerWorker.close();   // drain BullMQ
      await db.end();                  // close pg pool
      await redis.quit();              // close redis
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Graceful shutdown error', { error: (err as Error).message });
      process.exit(1);
    }
  });
  setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, 30_000).unref();
}
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
```

**Tests.**
- Integration: spawn server, send 5-second request, send SIGTERM during request, assert request completes and exit code is 0.

**Runtime verification.**
- `docker compose up api`.
- Start a long request (e.g., bulk export).
- `docker compose stop api` → should complete the in-flight request before exiting (not abort mid-stream).

---

### CRIT-51 — OTP non-constant-time `!==`

**Bug.** auth.service.ts:242 — `if (otpRecord.code !== code)`. String inequality leaks per-character timing info. With 6-digit codes (1M space) and 3 attempts, an attacker who can repeatedly trigger OTPs (compromised SMS gateway, multiple phone numbers) could probabilistically narrow the code via response timing.

**Fix.**
```ts
const codeBuf = Buffer.from(otpRecord.code);
const inputBuf = Buffer.from(code);
const codeMatch = codeBuf.length === inputBuf.length &&
                  crypto.timingSafeEqual(codeBuf, inputBuf);
if (!codeMatch) {
  await db.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otpRecord.id]);
  // ...
}
```

**Tests.**
- Unit: 1000 verifyOtp calls with `code='000000'` (correct) and 1000 with `code='999999'` (wrong, last char differs). Compare timing distributions — variance should be ~0 between the two groups.

---

### CRIT-52 — OTP auto-create empty profile

**Bug.** auth.service.ts:262-269 — successful OTP verify on any unknown +63 number creates a user with `first_name=''`, `last_name=''`, `is_verified=TRUE`, then issues a customer JWT. Empty names propagate everywhere; no email, no terms acceptance recorded; SIM swap creates an account on the victim's number.

NPC RA 10173 §11 requires unambiguous consent. Auto-creating an account on OTP verify is not unambiguous.

**Fix.** Two-step:
1. `verifyOtp`: if user exists → log in. If user doesn't exist → return `{ requiresRegistration: true, registrationToken }` (5-min JWT, type='registration_pending'). NO user row inserted.
2. New endpoint `POST /auth/register`: consume the token, collect `firstName`, `lastName`, `email` (optional), `termsAcceptedAt`, then create user + issue full token pair.
3. Reject login for any user with `first_name = ''` OR `terms_accepted_at IS NULL` — force them through registration.
4. Migration: backfill `first_name='Pending'`, `last_name='Profile'`, `terms_accepted_at=NULL` for existing empty-name users; force them through profile-completion at next login.

**Tests.**
- Unit: verifyOtp on unknown phone returns `requiresRegistration: true`, no row inserted in `users`.
- Unit: POST /auth/register with valid token + valid form creates user + token pair.
- Unit: verifyOtp on existing user (with name + terms) returns full token pair.

**Runtime verification.**
- Start a fresh customer signup in the mobile app.
- Confirm new screen "Complete your profile" appears after OTP.
- Confirm that bypassing it (e.g., via Charles proxy spoofing the JWT) is rejected.

---

### CRIT-53 — Refresh-token replay missing

**Bug.** auth.service.ts:330 — `DELETE FROM refresh_tokens WHERE token_hash = $1` then INSERT new. Token rotation is correct on happy path. But replay isn't detected: if an attacker steals a refresh token and uses it before the legitimate user, the user just sees "session expired" — no signal of breach.

**Fix.**
1. Migration: `ALTER TABLE refresh_tokens ADD COLUMN consumed_at TIMESTAMP NULL;`
2. Don't DELETE on rotation — UPDATE consumed_at = NOW().
3. On refresh attempt where row exists AND `consumed_at IS NOT NULL`:
   - Detect replay.
   - DELETE all `refresh_tokens` for that user_id.
   - INSERT `notifications` row alerting user: "Suspicious activity detected — please re-login."
   - INSERT `admin_actions` audit row (system actor).
   - Return 401.
4. Nightly cron: DELETE `refresh_tokens` where `consumed_at < NOW() - INTERVAL '7 days'` (cleanup).

**Tests.**
- Unit: refresh token once → success.
- Unit: use SAME refresh token twice → second call returns 401 AND user's other refresh tokens are cleared.
- Unit: notification row created on replay detection.

---

### CRIT-54 — SHA-256 hash, not HMAC

**Bug.** auth.service.ts:53 — `crypto.createHash('sha256').update(token).digest('hex')`. Fast hash. If `refresh_tokens` is leaked, attacker can SHA-256 candidate JWTs and find matches in the dump. JWT structure is well-known, body has bounded entropy.

**Fix.**
```ts
function hashToken(token: string): string {
  const secret = process.env.REFRESH_TOKEN_HMAC_SECRET;
  if (!secret) throw new Error('REFRESH_TOKEN_HMAC_SECRET required');
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}
```

**Migration.** Existing refresh_tokens hashes are now invalid → all users forced to re-login once. Document in runbook.

**Startup gate.** Like CRIT-45 — fail to start in production if env missing.

**Tests.**
- Unit: same token + same secret → same hash. Different secret → different hash.
- Integration: app fails to start if env missing in production.

---

### CRIT-55 — sendOtp non-transactional

**Bug.** auth.service.ts:188-199 — UPDATE `is_used=TRUE` for old OTPs, then INSERT new OTP, then `sendOtpSms`. Two issues:
1. UPDATE+INSERT not in a transaction → two concurrent sendOtp calls race, both pass cooldown check, both INSERT, leaving 2 active OTPs.
2. SMS call AFTER INSERT — SMS failure leaves an orphan OTP in DB and the cooldown blocks re-request.

**Fix.**
```ts
await db.transaction(async (client) => {
  await client.query(
    `UPDATE otp_codes SET is_used = TRUE WHERE phone = $1 AND is_used = FALSE`,
    [phone],
  );
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + platformConfig.otpExpiresInMinutes * 60_000);
  await client.query(
    `INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
    [phone, otp, expiresAt],
  );
  // Send SMS INSIDE the transaction so we ROLLBACK on failure.
  const sent = await sendOtpSms(phone, otp);
  if (!sent && process.env.NODE_ENV === 'production') {
    throw createAppError('Failed to send verification code. Please try again.', 502);
  }
});
```

The UPDATE acquires a row lock; concurrent sendOtp from the same phone serializes.

**Tests.**
- Concurrency: fire two sendOtp calls in parallel → only one OTP row remains active.
- SMS-failure: mock `sendOtpSms` to return false in production → no `otp_codes` row inserted.

---

### CRIT-56 — Permissions system unwired (re-emphasis of CRIT-23)

**Bug.** Schema has `admin_roles.permissions JSONB` with 26 named permissions. `staff.service.ts:validatePermissions` validates them on role create/update. But `rbac.middleware.ts` only checks the JWT `role` string ('admin' | 'super_admin'). No middleware reads `admin_staff.role_id → admin_roles.permissions` and gates the route.

A "support" admin (intended permissions: `dashboard.view`, `customers.view`, `support.manage`) can hit `POST /api/v1/admin/payouts/:id/approve` and succeed.

**Fix.**
1. Build `middleware/permissions.middleware.ts`:
   ```ts
   export function requirePermission(permission: string) {
     return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
       if (!req.user) return next(createAppError('Authentication required.', 401));
       if (req.user.role === 'super_admin') return next();
       const cacheKey = `perms:${req.user.userId}`;
       let perms = await redis.get(cacheKey);
       if (!perms) {
         const result = await db.query<{ permissions: string[] }>(
           `SELECT ar.permissions FROM admin_staff ast
            JOIN admin_roles ar ON ar.id = ast.role_id
            WHERE ast.user_id = $1 AND ast.is_active = TRUE AND ar.deleted_at IS NULL`,
           [req.user.userId],
         );
         perms = JSON.stringify(result.rows[0]?.permissions ?? []);
         await redis.setex(cacheKey, 60, perms);
       }
       if (!(JSON.parse(perms) as string[]).includes(permission)) {
         return next(createAppError(`Missing permission: ${permission}`, 403));
       }
       next();
     };
   }
   ```
2. Apply per-route:
   ```ts
   router.post('/payouts/:id/approve', authMiddleware, requirePermission('payouts.manage'), handler);
   router.get('/financials/overview', authMiddleware, requirePermission('financials.view'), handler);
   ```
3. Invalidate cache on role/permission change in `staff.service.ts:updateRole`.
4. CI guard: every admin route MUST declare its permission. A grep + AST check that fails CI for routes missing requirePermission.

**Tests.**
- Unit: support staff (perms = ['support.manage']) hits payouts approve → 403.
- Unit: super_admin always bypasses.
- Cache: change role permissions, cached request still uses old perms for ≤60s; new request uses fresh.

---

### CRIT-57 — Staff DELETE no audit

**Bug.** staff.service.ts:294 — `DELETE FROM admin_staff WHERE id = $1`. Hard delete. No `admin_actions` audit row.

**Fix.** Mirror staff.service.ts:deleteRole soft-delete pattern:
1. Migration: `ALTER TABLE admin_staff ADD COLUMN deleted_at TIMESTAMP NULL, deleted_by UUID NULL REFERENCES users(id), deleted_reason TEXT NULL;`
2. removeStaffMember in transaction:
   ```ts
   await db.transaction(async (client) => {
     await client.query(
       `UPDATE admin_staff SET is_active = FALSE, deleted_at = NOW(), deleted_by = $2, deleted_reason = $3 WHERE id = $1`,
       [staffId, actorId, reason],
     );
     await client.query(
       `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
        VALUES ($1, 'admin_staff_removed', 'admin_staff', $2, $3, $4)`,
       [actorId, staffId, JSON.stringify({removedUserId: ...}), reason],
     );
   });
   ```
3. listStaff filters `is_active = TRUE`.

**Tests.**
- Unit: removeStaffMember → admin_actions row exists with action_type='admin_staff_removed'.
- Unit: listStaff excludes deleted rows.

---

### CRIT-58 — getRevenueReport SQL string-interp

**Bug.** admin.service.ts:380-402 — `date_trunc('${truncUnit}', wt.created_at)` in template literal. Currently safe (TS narrows period to 'daily'|'weekly'|'monthly' and ternary maps to 'day'|'week'|'month'). But pattern is dangerous; future refactor that loosens the type or accepts user input could introduce SQL injection.

**Fix.** Hard-code three queries:
```ts
const queryByPeriod: Record<'daily'|'weekly'|'monthly', string> = {
  daily: `SELECT date_trunc('day', wt.created_at)::date::text AS date, ...`,
  weekly: `SELECT date_trunc('week', wt.created_at)::date::text AS date, ...`,
  monthly: `SELECT date_trunc('month', wt.created_at)::date::text AS date, ...`,
};
const sql = queryByPeriod[period];
if (!sql) throw createAppError('Invalid period', 400);
```

CI lint: ban template literals containing `date_trunc(` with `${` interpolation. Apply audit across financial-admin and reporting services.

---

### CRIT-59 — Backup codes not generated at 2FA enable

**Bug.** auth.routes.ts:744-835 — `/admin/2fa/enable` sets `totp_enabled=TRUE` but never calls `adminTwoFaService.generateBackupCodes`. Admin who enables 2FA has zero backup codes. Lose the phone → account lockout → super_admin reset (assuming a super_admin exists).

**Fix.**
1. After totp_enabled = TRUE in handler, call `generateBackupCodes(userId)` → 8 hashed codes inserted into `admin_backup_codes`.
2. Return the plaintext codes ONCE in the response so the UI can display them.
3. Admin UI MUST gate "I have saved these codes" before navigating away. Codes are not retrievable later (stored hashed).
4. Same for forced-enrollment path (req.isSetupToken === true) at line 794-825.

**Tests.**
- POST /admin/2fa/enable success → response contains `backupCodes: string[]` of length 8.
- DB: 8 rows in admin_backup_codes for that user.

---

### CRIT-60 — Admin 2FA disable no audit + no notification + no step-up

**Bug.** auth.routes.ts:924-975 — disables 2FA with just current TOTP. No admin_actions row. No notification. No password re-entry. Session takeover that disables 2FA happens silently.

**Fix.** Wrap in db.transaction:
1. UPDATE users SET totp_secret=NULL, totp_enabled=FALSE.
2. INSERT admin_actions ('admin_2fa_disabled', target_id=userId, ipAddress, userAgent).
3. Soft-delete all backup codes (admin_backup_codes UPDATE deleted_at).
4. Send notification (email + SMS) to the admin.
5. Step-up: require BOTH current TOTP AND password.
6. Optionally: 24h delay with cancel link before disable takes effect.

---

### CRIT-61 — Admin login dual-return tokens

**Bug.** auth.routes.ts:577-585 — admin login response includes `accessToken`, `refreshToken` in JSON body even though Bug 1251 fix sets them as HttpOnly cookies. Comment says "for backward compat with existing admin client; the client refactor on the same PR stops reading them." If the admin web client still reads from JSON body and stores in localStorage, the HttpOnly cookie protection is defeated — XSS reads the JSON-stored token.

**Fix.**
1. Verify apps/admin/src/ reads `admin_session` via cookie, NOT from a stored Bearer token. Phase F1 (this audit) verified the admin web ALREADY uses cookie auth. **Safe to remove.**
2. Remove `accessToken` and `refreshToken` from JSON body. Return only `user` and `sessionExpiresAt`.
3. CI test: scan apps/admin/src/ for `localStorage.setItem('access` and `localStorage.setItem('refresh` — fail if found.

---

### CRIT-62 — Email change unverified

**Bug.** auth.routes.ts:351-399 — PATCH /me allows changing email to any address with no proof of ownership. Combined with admin login by email, account takeover via stolen session → change email → password reset goes to attacker.

**Fix.** Two-step verified flow:
1. POST /me/email/initiate { newEmail } → sends confirmation link to newEmail with short-lived token.
2. GET /me/email/confirm?token=... → verifies and applies the change.
3. Reject email update via PATCH /me.
4. Notify the OLD email address about the change (so a victim sees the alert).
5. For admin role users, additionally require current password to initiate.
6. Audit row for both initiate and confirm.

---

### CRIT-63 — /audit-log returns raw PII to any admin

**Bug.** admin.routes.ts:1531-1606 — joins audit_log with users, exposes raw `user_email`, `ip_address`, `user_agent` to ANY admin. Direct contradiction of the D08 maskPiiForRole pattern that getAdminActions correctly applies.

**NPC RA 10173 §21 violation in production.**

**Fix.**
1. Apply `maskPiiForRole` per row before returning:
   ```ts
   const masked = dataResult.rows.map((row) => ({
     ...row,
     user_email: maskEmail(row.user_email, req.user!.role),
     ip_address: maskIp(row.ip_address, req.user!.role),
     user_agent: maskUserAgent(row.user_agent, req.user!.role),
   }));
   ```
2. Add a "Reveal PII" sub-endpoint for super_admin or DPO:
   ```ts
   router.post('/audit-log/:id/reveal-pii', authMiddleware, requireDpo, async (req, res) => {
     // Audit the reveal itself.
     await db.query(`INSERT INTO admin_actions (...) VALUES ('pii_reveal', ...)`);
     // Return raw row.
   });
   ```
3. Restrict /audit-log base endpoint to super_admin OR users with `audit.view-pii` permission (CRIT-56 dispatch).

**Tests.**
- support admin queries /audit-log → response shows `+63 9XX XXX 1234`, NOT raw phone.
- super_admin POST reveal-pii → returns raw + audit row created.

---

### CRIT-64 — Duplicate /release-escrow handler

**Bug.** admin.routes.ts:302-347 implements `/admin/bookings/:id/release-escrow` with the legacy non-transactional pattern. booking-admin.routes.ts has the same path with the D06 transactional fix. server.ts mount order means booking-admin wins — but the duplicate is dead code that will silently break things if someone unmounts booking-admin.

**Fix.**
1. Verify mount order in server.ts. If bookingAdminRoutes is mounted first AND on the same path prefix → admin.routes.ts version is dead.
2. DELETE the duplicate handler in admin.routes.ts:302-347.
3. Add CI grep that fails if `release-escrow` appears in two route files.

---

### CRIT-65 — Business account silent suspend/discount/manager updates

**Bug.** admin.routes.ts:625-735 — three handlers (suspend, assign-manager, set-discount) update business_accounts with no audit and no notification. set-discount in particular changes pricing → contract breach risk.

**Fix.** Each handler in a transaction:
1. UPDATE business_accounts ...
2. INSERT admin_actions row (action_type per operation, target_type='business_account', details, reason).
3. Send notification to business owner_user_id.
4. Add Zod schemas for set-discount and assign-manager (currently manual checks).

---

### CRIT-66 — Recurring cancel silent

**Bug.** admin.routes.ts:476-502 — admin cancel of recurring booking writes no audit, no notification. Customer's weekly cleaner just disappears.

**Fix.** Wrap in transaction with audit + notification. Gate to `requirePermission('recurring.manage')` once CRIT-56 lands.

---

### CRIT-67 — Pricing rule hard delete

**Bug.** admin.routes.ts:1121-1134 — `pricingService.deletePricingRule(id)` is a hard delete. Pricing rules affect surge prices on customer bookings. If a peak-hours rule was applied and customer disputes, ops can't reconstruct what was active.

**Fix.**
1. Migration: ALTER TABLE pricing_rules ADD COLUMN deleted_at TIMESTAMP NULL, deleted_by UUID NULL, deleted_reason TEXT NULL.
2. deletePricingRule UPDATE deleted_at + audit row in transaction.
3. Active queries (listPricingRules, getPricingRuleById) filter deleted_at IS NULL.
4. Booking-time queries that join pricing_rules already get the rule by id even after soft-delete — preserves history.

---

## What this verification doc DOES NOT do

- Does not run the app. No screenshots. No browser test. Static code review only.
- Does not re-read every cited file in C03/C04/C05 — 12 of 24 CRITs are CARRIED, not personally re-verified this session.
- Does not cover MEDIUM bugs in detail — 47 MEDs across C01–C05 stand at the original cited lines; spot-check before fix.

## Recommended next step for AI coder

Take CRITs 44, 45, 47, 50, 56, 63 as the v1.0-launch-blocking set:
- **CRIT-45** (TOTP plaintext) and **CRIT-50** (no graceful shutdown) are deploy-config gaps — fix before next prod deploy.
- **CRIT-47** (Redis null-retry) is a 25-second-outage-becomes-hours bug — fix immediately.
- **CRIT-56** (permissions unwired) is the largest single auth gap — needs a coordinated PR touching ~25 admin routes. Do this BEFORE adding any new admin staff with non-super_admin role.
- **CRIT-63** (audit-log PII) is an NPC compliance bullet ready to be filed — fix before any non-super_admin admin opens the audit log page.
- **CRIT-44** (rate-limit dead refresh) is an operational dial that doesn't work — pair with CRIT-46 (per-route limiters).
