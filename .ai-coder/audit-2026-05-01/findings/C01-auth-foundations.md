# Phase C Findings Part 1 — Foundations: Middleware, Utils, Configs, Server Bootstrap

Files read in full this batch:
- `middleware/admin-csrf.middleware.ts` (87)
- `middleware/rate-limit.middleware.ts` (39)
- `middleware/audit.middleware.ts` (64)
- `middleware/ip-block.middleware.ts` (42)
- `middleware/validation.middleware.ts` (33)
- `middleware/require-dpo.middleware.ts` (49)
- `middleware/error.middleware.ts` (47)
- `middleware/cache.middleware.ts` (44)
- `utils/admin-cookies.ts` (127)
- `utils/totp.ts` (116)
- `utils/hcaptcha.ts` (54)
- `utils/logger.ts` (84)
- `utils/pii-mask.ts` (167)
- `validators/auth.validators.ts` (33)
- `validators/admin.validators.ts` (14)
- `config/redis.config.ts` (31)
- `config/platform.config.ts` (178)
- `server.ts` (291)

**Phase C running total: ~1,500 lines fully read.**
**Audit grand total: ~15,099 lines fully read.**

(Note: `auth.middleware.ts` and `rbac.middleware.ts` were already read in Phase B — see B04.)

---

## CRITICAL bugs (continuing numbering from CRIT-43 in Phase B)

### CRIT-44 — Rate limiter is constructed once at module load; settings-refresh doesn't actually refresh
**File:** [packages/api/src/middleware/rate-limit.middleware.ts:10-39](packages/api/src/middleware/rate-limit.middleware.ts#L10)
```ts
let currentWindow: number = platformConfig.rateLimitWindowMs;
let currentMax: number = platformConfig.rateLimitMaxRequests;

async function refreshRateLimits(): Promise<void> { ... }
void refreshRateLimits();
setInterval(() => { void refreshRateLimits(); }, 60_000).unref();

export const rateLimitMiddleware = rateLimit({
  windowMs: currentWindow,   // ← captured ONCE at construction
  max: currentMax,           // ← captured ONCE at construction
  ...
});
```
`express-rate-limit` reads `windowMs` and `max` AT CONSTRUCTION TIME. The `setInterval` updates the local variables, but the limiter doesn't re-read them. **The dynamic refresh is dead code.** Admin tuning `rate_limit_max_requests` in platform_settings does nothing until app restart.

Also: module-level `setInterval` runs unconditionally — including in test runs. Memory leak / unexpected test behavior.

**Fix dispatch:**
```
1. Pass functions to express-rate-limit (it supports lazy values):
   rateLimit({
     windowMs: () => currentWindow,
     max: () => currentMax,
     ...
   })
   (Verify express-rate-limit version supports function-valued options — v6+ does.)
2. Move setInterval registration into a startup function called from server.ts (and clear it on shutdown).
3. Add tests:
   - Update settings.service to return new max, call refreshRateLimits, send N requests, assert limit applies at NEW value.
4. As a separate dispatch: split the single global limiter into per-route-class limiters (auth: 5/15min, write: 100/15min, read: 1000/15min) — see CRIT-46 below.
```

### CRIT-45 — TOTP secrets stored UNENCRYPTED if TOTP_ENCRYPTION_KEY not set
**File:** [packages/api/src/utils/totp.ts:95-103](packages/api/src/utils/totp.ts#L95)
```ts
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext; // Fallback: store unencrypted if key not configured
  ...
}
```
If `TOTP_ENCRYPTION_KEY` env is missing, every admin's TOTP secret goes into the DB AS PLAINTEXT. A DB dump or read-replica leak exposes every admin's 2FA secret — full account takeover.

Also creates a permanent migration wedge: if encryption is later turned ON, old plaintext secrets continue to work (decryptSecret returns as-is at line 106), but new secrets are encrypted. Mixed state forever, no rotation path.

**Fix dispatch:**
```
1. In production (NODE_ENV='production'), throw at module load if TOTP_ENCRYPTION_KEY not set:
   if (process.env.NODE_ENV === 'production' && !process.env.TOTP_ENCRYPTION_KEY) {
     throw new Error('TOTP_ENCRYPTION_KEY required in production');
   }
2. Add startup migration check: SELECT COUNT(*) FROM admin_totp_secrets WHERE encrypted_secret NOT LIKE 'enc:%'. If > 0 in production, refuse to start.
3. Build a one-shot migration script that re-encrypts plaintext secrets, requiring the admin to re-confirm via TOTP before the secret is rotated.
4. Validate TOTP_ENCRYPTION_KEY is exactly 64 hex chars (AES-256 key length).
5. Test: set NODE_ENV=production, unset TOTP_ENCRYPTION_KEY, assert app fails to start.
```

### CRIT-46 — Single global rate limiter; auth endpoints not rate-limited stricter
**File:** [packages/api/src/server.ts:122-123](packages/api/src/server.ts#L122)
```ts
app.use(rateLimitMiddleware);
```
One limiter for everything: 100 requests / 15 min. Login endpoints typically need 5-10 attempts / 15 min to slow brute force. With 100/15min, attacker has ~6.6 password tries/minute — plenty for a credential-stuffing attack.

**Fix dispatch:**
```
1. Build per-route-class limiters in middleware/rate-limit.middleware.ts:
   - authLimiter:  5/15min for failed attempts (use rate-limit's keyGenerator + skipSuccessfulRequests)
   - writeLimiter: 100/15min for write operations
   - readLimiter:  1000/15min for reads
   - publicLimiter: 100/15min unauthenticated (config endpoint)
2. Apply per-route in server.ts:
   - app.use('/api/v1/auth/login', authLimiter)
   - app.use('/api/v1/auth/admin/login', authLimiter)
   - app.use('/api/v1/auth/otp/verify', authLimiter)
   - etc.
3. Apply general rate limit to remaining routes.
4. Tests: 6 failed logins from same IP within 15min → 6th rejected with 429.
```

### CRIT-47 — Redis retry strategy gives up after 10 attempts, app loses Redis permanently until restart
**File:** [packages/api/src/config/redis.config.ts:9-15](packages/api/src/config/redis.config.ts#L9)
```ts
retryStrategy: (times: number): number | null => {
  if (times > 10) {
    logger.error('Redis connection failed after 10 retries');
    return null;  // ← returning null = STOP RECONNECTING
  }
  return Math.min(times * 200, 5000);
},
```
Returning `null` from ioredis `retryStrategy` tells ioredis to STOP reconnecting permanently. After 10 failed retries (~25 seconds), the app's Redis client is dead. Sessions, cache, rate limiting, settings, BullMQ — all silently broken until manual restart.

In a transient outage (Redis failover, network blip), this turns a 30-second issue into hours of degraded service.

**Fix dispatch:**
```
1. Change retry strategy to retry indefinitely with backoff:
   retryStrategy: (times: number): number => Math.min(times * 200, 5000)
2. Add structured logging at every 100th retry so ops sees the issue without log spam.
3. Add a /health/ready check that already includes redis.ping() — confirm the load balancer pulls this instance out of rotation when Redis is unreachable. (Already present at server.ts:147-152, good.)
4. For BullMQ-specific connection (line 28-31), same fix.
5. Test: stop Redis, observe app retries indefinitely, restart Redis, observe reconnection.
```

### CRIT-48 — Admin session timeout setting is silently capped at 15 minutes
**File:** [packages/api/src/utils/admin-cookies.ts:123-127](packages/api/src/utils/admin-cookies.ts#L123)
```ts
export const ADMIN_SESSION_ACCESS_LIFETIME_MS =
  Math.min(
    platformConfig.adminSessionTimeoutHours * 3600 * 1000,
    15 * 60 * 1000,
  );
```
`platformConfig.adminSessionTimeoutHours = 8` (line 125 of platform.config.ts). But the export caps it at 15 minutes. So the "8-hour admin session" advertised in config is ALWAYS 15 minutes. **Misleading config.**

If admins want longer sessions (rare, but possible per ops policy), they edit the wrong place.

**Fix dispatch:**
```
1. Decide intent:
   (a) 15-min hard cap is correct (security-first). Then DELETE platformConfig.adminSessionTimeoutHours and the Math.min — replace with `const ACCESS_LIFETIME_MS = 15 * 60 * 1000;` literal with comment explaining why short access tokens are safe (refresh token is 7 days at line 46).
   (b) 8-hour timeout is correct for admin convenience. Remove the Math.min, use the platformConfig value.
2. Recommendation: (a) — short access + 7-day refresh is the modern pattern. Document.
3. Same time, fix CRIT-22 (no JWT revocation) so refresh token rotation actually invalidates old access tokens.
```

### CRIT-49 — /config endpoint silently returns minimal hardcoded fallback on settings failure
**File:** [packages/api/src/server.ts:217-232](packages/api/src/server.ts#L217)
```ts
app.get('/api/v1/config', async (_req, res) => {
  try {
    const config = await settingsService.getClientConfig();
    res.json({ success: true, data: config });
  } catch {
    res.json({  // ← still returns success:true!
      success: true,
      data: {
        appVersion: '0.1.0', currency: 'PHP', currencySymbol: '₱',
        timezone: 'Asia/Manila',
      },
    });
  }
});
```
Silent fallback to hardcoded minimal config. Mobile clients pulling /config get success:true with NO commission rates, NO fee config, NO feature flags. Mobile UI then can't compute prices, can't show feature-flagged screens.

Combined with CRIT-25 (settings DB read silently falls through to in-memory defaults), money-relevant config is silently degraded with no surfacing to ops.

**Fix dispatch:**
```
1. Catch and log specifically: logger.error('config_endpoint_failed', { error: err... }), then return 503:
   res.status(503).json({
     success: false,
     error: { code: 'config_unavailable', message: 'Configuration temporarily unavailable.' },
   });
2. Mobile client must handle 503 (block UI behind a "loading config..." spinner with retry).
3. Add reconciliation alert if /config returns 503 multiple times in 5 minutes.
4. Test: mock settingsService throw, hit /config, expect 503.
```

### CRIT-50 — server.ts has no graceful shutdown; SIGTERM kills in-flight requests
**File:** [packages/api/src/server.ts:280-288](packages/api/src/server.ts#L280)
No `process.on('SIGTERM'/'SIGINT', ...)` handler. Production deploys (kubectl rollout, Docker compose down, ECS task replacement) send SIGTERM. Express defaults: kill instantly. In-flight requests dropped, BullMQ jobs interrupted, DB connections not cleanly closed.

**Fix dispatch:**
```
1. Add at the bottom of server.ts:
   async function gracefulShutdown(signal: string) {
     logger.info(`Received ${signal}; starting graceful shutdown`);
     // 1. Stop accepting new connections
     httpServer.close(async () => {
       try {
         // 2. Drain BullMQ queue (await pending jobs)
         await schedulerWorker.close();
         // 3. Close DB pool
         await db.end();
         // 4. Close Redis
         await redis.quit();
         logger.info('Graceful shutdown complete');
         process.exit(0);
       } catch (err) {
         logger.error('Graceful shutdown error', { err });
         process.exit(1);
       }
     });
     // Hard timeout after 30s
     setTimeout(() => {
       logger.error('Graceful shutdown timed out; forcing exit');
       process.exit(1);
     }, 30_000).unref();
   }
   process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
   process.on('SIGINT', () => gracefulShutdown('SIGINT'));
2. Test: send SIGTERM during a 5-second request; assert request completes and exit code is 0.
```

---

## MEDIUM bugs

### MED-60 — admin_csrf_tokens uses non-constant-time string comparison
**File:** [packages/api/src/middleware/admin-csrf.middleware.ts:48](packages/api/src/middleware/admin-csrf.middleware.ts#L48)
```ts
if (!headerToken || !cookieToken || headerToken !== cookieToken) { ... }
```
`!==` is not constant-time. Timing attack vector. Minor (token is per-session, attacker can't rapidly iterate), but use `crypto.timingSafeEqual` for defense in depth.

### MED-61 — admin_csrf_tokens not bound to the requesting user
**File:** [packages/api/src/middleware/admin-csrf.middleware.ts:60-68](packages/api/src/middleware/admin-csrf.middleware.ts#L60)
```ts
SELECT id, admin_user_id FROM admin_csrf_tokens WHERE token = $1 AND ...
```
Token validity isn't checked against `req.user.userId`. Any valid CSRF token works for any admin. If admin A's CSRF token leaks via XSS, attacker (with admin A's session cookie also stolen) could combine with admin B's CSRF token. Defense in depth: require `admin_user_id = req.user.userId`.

### MED-62 — Audit middleware overwrites res.json only; misses res.send / res.end
**File:** [packages/api/src/middleware/audit.middleware.ts:21](packages/api/src/middleware/audit.middleware.ts#L21)
If a route uses `res.send(text)` or `res.end()` (no body), no audit row written. Wrap all three.

### MED-63 — Audit log path captures actual UUIDs, not parameterized template
**File:** [packages/api/src/middleware/audit.middleware.ts:23](packages/api/src/middleware/audit.middleware.ts#L23)
```ts
const action = `${req.method} ${req.path}`;  // POST /bookings/abc-def-...
```
Should use `req.route.path` (template like `/bookings/:id`) for grouping in queries. Current actions all unique; useless for "how many DELETE /bookings/:id calls today".

### MED-64 — Audit deriveEntityId only catches first UUID
**File:** [packages/api/src/middleware/audit.middleware.ts:60-63](packages/api/src/middleware/audit.middleware.ts#L60)
For nested paths like `/bookings/:bookingId/quotes/:quoteId`, only `bookingId` is captured. Misleading — entity_type='bookings' looks correct, but entity_id picks one of two IDs arbitrarily.

### MED-65 — IP block middleware fails OPEN on errors
**File:** [packages/api/src/middleware/ip-block.middleware.ts:36-41](packages/api/src/middleware/ip-block.middleware.ts#L36)
On Redis/securityService error, calls `next()` allowing the request. For a security middleware this is the wrong default — should fail closed in production OR at minimum surface to ops alerts immediately.

### MED-66 — Cache middleware key derivation pollutes cache + leaks across users
**File:** [packages/api/src/middleware/cache.middleware.ts:17,28-40](packages/api/src/middleware/cache.middleware.ts#L17)
- `req.originalUrl` includes query string. `?a=1&b=2` and `?b=2&a=1` are separate keys. Cache pollution.
- For auth-aware endpoints, all users' responses cached under the URL alone. **Privacy leak** if a route mounts this middleware AND varies response by user. The middleware doesn't enforce or warn about this.

**Fix:** include user role + key sorting. Or restrict middleware usage to documented public-only routes.

### MED-67 — hCaptcha verify has no timeout
**File:** [packages/api/src/utils/hcaptcha.ts:41-44](packages/api/src/utils/hcaptcha.ts#L41)
`fetch('https://hcaptcha.com/siteverify', ...)` with no AbortController. Slow hCaptcha responses (5+ sec) block the auth request. Add ~3-5 second timeout.

### MED-68 — Logger PII redaction doesn't catch scrypt password hashes
**File:** [packages/api/src/utils/logger.ts:6-8](packages/api/src/utils/logger.ts#L6)
Comment acknowledges scrypt hashes (format `salt:hash` or `scrypt:N:r:p:salt:hash`) are NOT regex-redacted. Relies on caller discipline. **GAP** — defense in depth would add a generic high-entropy hex/base64 detector.

### MED-69 — admin-cookies.ts setAdminSessionCookies is non-atomic
**File:** [packages/api/src/utils/admin-cookies.ts:53-90](packages/api/src/utils/admin-cookies.ts#L53)
DB INSERT (line 53-63) then 3 cookie sets (line 66-90). If DB INSERT throws, cookies aren't set — fine. But if cookies set first and then INSERT throws (some refactor in future), inconsistent state. Wrap in try/catch with explicit ordering documentation.

### MED-70 — clearAdminSessionCookies doesn't revoke admin_csrf_tokens (orphans accumulate)
**File:** [packages/api/src/utils/admin-cookies.ts:100-105](packages/api/src/utils/admin-cookies.ts#L100)
Only clears browser cookies. CSRF token rows in DB stay until expires_at. Logout doesn't revoke them — separate function `revokeAdminCsrfTokens` (line 111-119) must be called by caller. Easy to forget. Fold into clearAdminSessionCookies.

### MED-71 — Redis config has no password, no TLS support
**File:** [packages/api/src/config/redis.config.ts:4-16](packages/api/src/config/redis.config.ts#L4)
Production Redis (Upstash, Elasticache, Memorystore) typically requires AUTH password and TLS. Currently neither is configurable via env. Add `password: process.env.REDIS_PASSWORD` and `tls: process.env.REDIS_TLS === 'true' ? {} : undefined`.

### MED-72 — JWT refresh expiry inconsistent: customer/provider 30d vs admin 7d
**Files:** [packages/api/src/config/platform.config.ts:85](packages/api/src/config/platform.config.ts#L85) (`jwtRefreshExpiresIn: '30d'`) vs [packages/api/src/utils/admin-cookies.ts:46](packages/api/src/utils/admin-cookies.ts#L46) (`refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000`)
Inconsistency. Document or unify.

### MED-73 — server.ts has no 404 handler for unknown routes
**File:** [packages/api/src/server.ts:269-270](packages/api/src/server.ts#L269)
Express returns default HTML 404. Mobile clients expecting JSON envelope choke. Add:
```ts
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'not_found', message: `Route ${req.method} ${req.path} not found.` },
  });
});
```
Before errorMiddleware.

### MED-74 — server.ts CORS allows no-origin requests
**File:** [packages/api/src/server.ts:88-92](packages/api/src/server.ts#L88)
Allowing requests without an Origin header lets curl, server-side scripts, and old browsers bypass CORS. With cookie auth + CSRF middleware (Bug 1251 fix) the immediate risk is mitigated, but defense in depth: log and require an explicit allowlist for non-browser clients (e.g., User-Agent regex for the mobile app).

### MED-75 — server.ts captures rawBody for ALL POST endpoints, not just webhook
**File:** [packages/api/src/server.ts:103-108](packages/api/src/server.ts#L103)
Every JSON POST gets the rawBody attached. Memory cost on large requests. Scope to the webhook router by mounting two parsers:
- For /api/v1/webhooks: `express.json({verify: ...})` first
- For everything else: `express.json()` without verify

### MED-76 — platformConfig duplicates DB-tunable money values
**File:** [packages/api/src/config/platform.config.ts:11-22, 122](packages/api/src/config/platform.config.ts#L11)
Commission rates, service fee, guarantee fund rate, VAT rate are all in BOTH platform.config.ts AND settings.service.ts:SETTING_DEFAULTS AND the DB. Three sources. **Confirms CRIT-13 + CRIT-42.** Fix by removing from platform.config (the canonical source becomes settings.service via DB).

### MED-77 — jwtExpiresInByRole is pointless (all values same)
**File:** [packages/api/src/config/platform.config.ts:79-84](packages/api/src/config/platform.config.ts#L79)
All four roles set to `'15m'`. Either differ per role (admin 15m, customer 24h) or remove the per-role table.

---

## LOW / INFO

- **PII masking is a strength.** logger.ts, pii-mask.ts, and the role-aware mask helpers are well thought through. RA 10173 §21 D08 fix (Bug 402, 66, 75, 76, 81, 287, 311, 331, 342, 343, 350) is correctly implemented.
- **TOTP implementation is solid (modulo CRIT-45).** RFC 6238/4226 compliant, uses crypto.timingSafeEqual for verification, base32 round-trip works.
- **Admin CSRF pattern is correct** (modulo MED-60, MED-61). Double-submit cookie + server-side validation table.
- **D08 require-dpo middleware** is the model for permission checks (MED-58 from B07 — admin RBAC needs a similar pattern).
- **server.ts route ordering** (specific admin sub-routes before /api/v1/admin generic) is correct, comments document it.
- **Error middleware** correctly hides stack in production.
- **Validation middleware** (Zod-based) is clean and consistent.

---

## What's left in Phase C

- `services/auth.service.ts` (387)
- `services/admin-2fa.service.ts` (232)
- `services/admin.service.ts` (520)
- `services/staff.service.ts` (321)
- `services/security.service.ts` (524)
- `routes/auth.routes.ts` (977)
- `routes/admin.routes.ts` (1,614 — split read)

Subtotal still to read: ~4,575 lines. Continuing.
