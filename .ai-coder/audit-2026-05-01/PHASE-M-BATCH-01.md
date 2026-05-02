# Phase M Batch 1 — API middleware (10 files, ~500 lines)

## Files fully read
- packages/api/src/middleware/auth.middleware.ts (70)
- packages/api/src/middleware/rbac.middleware.ts (25)
- packages/api/src/middleware/admin-csrf.middleware.ts (87)
- packages/api/src/middleware/rate-limit.middleware.ts (39)
- packages/api/src/middleware/ip-block.middleware.ts (42)
- packages/api/src/middleware/cache.middleware.ts (44)
- packages/api/src/middleware/audit.middleware.ts (64)
- packages/api/src/middleware/error.middleware.ts (47)
- packages/api/src/middleware/require-dpo.middleware.ts (49)
- packages/api/src/middleware/validation.middleware.ts (33)

## Findings

### CRIT-M01 — Rate-limit middleware "live config" pattern is broken; admin changes silently ignored
**Where found:** packages/api/src/middleware/rate-limit.middleware.ts:10-39
```ts
let currentWindow: number = platformConfig.rateLimitWindowMs;
let currentMax: number = platformConfig.rateLimitMaxRequests;

async function refreshRateLimits(): Promise<void> {
  // ... reads from settingsService.getSettingInteger('rate_limit_window_ms') ...
}

void refreshRateLimits();
setInterval(() => { void refreshRateLimits(); }, 60_000).unref();

export const rateLimitMiddleware = rateLimit({
  windowMs: currentWindow,    // ← captured at module load
  max: currentMax,            // ← captured at module load
  ...
});
```
**Understood:** `rateLimit()` from `express-rate-limit` is called ONCE at module load. The values of `currentWindow` and `currentMax` at that moment become baked into the limiter. The setInterval updates the variables every 60s, but `rateLimit()` already captured the initial primitives — there is no re-read. Worse, `await refreshRateLimits()` at module load is called with `void` (line 24) so the INITIAL refresh races with the limiter construction; if DB read takes >0ms, limiter constructs with platformConfig defaults that may differ from DB values.

**Why it matters:** Admin uses /admin/settings to update rate_limit_window_ms / rate_limit_max_requests. The DB write succeeds (settings are persisted), but the running API never picks them up. Admin reasonably believes they tuned the rate limit; actual limiter behavior is unchanged until process restart. This silently breaks an admin-facing feature.

**Fix:** Use `express-rate-limit`'s `windowMs` / `max` as functions: `rateLimit({ windowMs: () => currentWindow, max: () => currentMax })`. Alternatively, replace with a custom limiter (RateLimiter from `rate-limiter-flexible`) that reads currentWindow/currentMax per-request. Properly await the initial refresh in an init function called from server.ts before the limiter is mounted.

### CRIT-M02 — cacheMiddleware doesn't key by user; risk of cross-user data leak if applied to auth endpoints
**Where found:** packages/api/src/middleware/cache.middleware.ts:17
```ts
const key = buildCacheKey('http', req.originalUrl);
```
**Understood:** Cache key = `originalUrl` (path + query). NO user identity in the key. If this middleware is applied to a route that returns user-specific data (e.g., `GET /api/v1/notifications`, `GET /api/v1/wallets`, `GET /api/v1/bookings`), the FIRST user to hit the route populates the cache. Every subsequent user hitting the same URL receives the first user's data — an info-disclosure vulnerability (PII leak under NPC RA 10173 §28).

**Phase N must verify:** grep `cacheMiddleware` usages in routes/. If any auth-required route applies it, that's a live data-leak bug. If only public routes (/api/v1/config, /api/v1/promotions/active, /api/v1/service-areas) use it, the bug is latent but the middleware is still a footgun.

**Fix:** Either (a) add `req.user?.userId` to the cache key when present; or (b) refuse to cache responses when an Authorization header / admin_session cookie is present (fail closed); or (c) document loudly in JSDoc that this middleware is for unauthenticated public endpoints only and add a startup-time assertion that prevents accidentally applying it post-authMiddleware.

### CRIT-M03 — 'dpo' role in require-dpo.middleware DPO_ROLES set is unreachable; effectively == requireSuperAdminRole
**Where found:**
- packages/api/src/middleware/require-dpo.middleware.ts:15 — `DPO_ROLES = new Set(['super_admin', 'dpo'])`
- packages/api/src/middleware/auth.middleware.ts:8 — `role: 'customer' | 'provider' | 'admin' | 'super_admin'` (NO 'dpo')

**Understood:** The auth payload TS type only has 4 roles. JWTs are signed with one of those four. A user with role='dpo' could never be issued a JWT because the auth layer doesn't accept that role. Result: `requireDpoRole` is functionally identical to `requireSuperAdminRole` — only super_admin gets through. Per F04 CRIT-141 the spec wanted 'dpo' to be a separate role. Either:
- (a) The DPO concept was supposed to land but the JWT layer was never extended → endpoints intended for DPO-only access are gated to super_admin instead, which is a different security model.
- (b) The 'dpo' is a placeholder for a v1.1 feature → harmless dead code today.

Either way, there's a semantic mismatch between role enum and middleware allowlist.

**Fix:** Either widen `AuthPayload.role` to include `'dpo'` and update auth/login/JWT-issue logic + admin_staff schema to support DPO assignment, OR remove `'dpo'` from `DPO_ROLES` and rename to `requireSuperAdmin` so the intent is clear.

### MED-M01 — getClientIp blindly trusts X-Forwarded-For; need trust-proxy verification
**Where found:** packages/api/src/middleware/ip-block.middleware.ts:5-11
```ts
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? '127.0.0.1';
}
```
**Understood:** If the API is exposed directly (no proxy), an attacker can send `X-Forwarded-For: 1.1.1.1` to spoof the IP. Then ipBlockMiddleware checks if 1.1.1.1 is blocked instead of their real IP. Also rate-limit and audit log records the spoofed IP. Need to confirm `app.set('trust proxy', N)` is set correctly in server.ts (Phase M Batch 4).

**Fix:** Phase M Batch 4 verifies server.ts. If trust proxy isn't configured, getClientIp must use Express's req.ip (which respects trust proxy setting) instead of manually parsing X-Forwarded-For.

### MED-M02 — ipBlockMiddleware fails open on Redis/security service outage
**Where found:** packages/api/src/middleware/ip-block.middleware.ts:36-41
```ts
} catch (err) {
  logger.error('IP block check failed — allowing request', { ... });
  next();
}
```
**Understood:** If `securityService.isIpBlocked()` throws (Redis outage, DB error), the block check is bypassed and the request proceeds. Comment says "allowing request" so this is intentional — fail open. Trade-off: availability over security. For an attacker actively probing during a Redis outage, this is a brief window of unblocked access.

**Fix:** Document the policy explicitly. Optionally: if the block check fails AND the request is to a sensitive admin endpoint, fail closed (return 503 instead of allowing).

### MED-M03 — audit.middleware writes are fire-and-forget; failed audit logs are silent
**Where found:** packages/api/src/middleware/audit.middleware.ts:40-46
```ts
void db.query(
  `INSERT INTO audit_log (...)`,
  [...],
).catch((err) => {
  logger.error('Failed to write audit log to DB', { error: err });
});
```
**Understood:** Audit DB write is not awaited. Request succeeds even if audit insert fails. NPC RA 10173 §22 (records of processing activities) requires an audit trail. If the audit table is unavailable (disk full, replication lag, transient pg error), writes silently drop. The user-facing request succeeds, the operator has no signal that compliance trail is broken.

**Fix:** For sensitive write operations, audit insert should be inside the same transaction as the data write (so DB rollback covers both, and audit failure prevents the data write). For lower-stakes writes, at minimum: emit a Sentry alert when audit writes fail, not just a logger.error. Add a reconciliation job that catches gaps in audit_log timestamps.

### MED-M04 — auth.middleware doesn't distinguish expired vs malformed JWT
**Where found:** packages/api/src/middleware/auth.middleware.ts:67-69
```ts
} catch {
  next(createAppError('Invalid or expired authentication token.', 401));
}
```
**Understood:** Every jwt.verify failure returns generic 401. The client cannot tell "expired token, please refresh" from "totally invalid token, force re-login". Mobile uses 401 to trigger refreshOnce(); admin uses 401 to redirect to /login. Fine in normal flow, but for debugging or future error-class differentiation, the message is too generic.

**Fix:** Catch with `(err: jwt.JsonWebTokenError)` and distinguish `TokenExpiredError` (refresh) from `JsonWebTokenError` (re-login) via error.code returned in the payload.

### MED-M05 — validation.middleware only checks req.body; query/params not validated
**Where found:** packages/api/src/middleware/validation.middleware.ts:8-32
**Understood:** Validates `req.body` only. Query strings (`?status=foo&page=N`) and URL params (`/bookings/:id`) are NOT validated by this middleware. Routes that need query/param validation must implement their own — inconsistency across routes.
**Fix:** Extend the middleware to accept `{ body?, query?, params? }` schemas object. Routes pass whichever they need. Standardize across all routes.

### POSITIVE — auth.middleware.ts (Bug 1251 cookie path)
- HttpOnly cookie preferred over Bearer header.
- Rejects pre_auth_2fa and refresh tokens from being used as access tokens (defense against type confusion).
- Fails closed if JWT_SECRET not set (500 instead of allowing all requests through).

### POSITIVE — rbac.middleware.ts
- Correct semantics: 401 if not authenticated, 403 if authenticated but insufficient role.
- Variadic allowedRoles. Type-safe with UserRole literal union.
- (Note: F03 audit findings about rbacMiddleware('admin','super_admin') being too permissive at router level are about CALLER usage, not this middleware's correctness.)

### POSITIVE — admin-csrf.middleware.ts (Bug 1251 verified)
- Three-factor: header X-CSRF-Token + cookie admin_csrf + DB row in admin_csrf_tokens (not revoked, not expired).
- Skips safe methods. Logs unknown-token attempts with IP/path/method.
- Fail-closed: missing-cookie OR mismatch OR DB-not-found all return 403.

### POSITIVE — error.middleware.ts
- AppError class with statusCode + isOperational. Operational errors expose message; non-operational get generic.
- Stack trace only in non-production.
- requestId logged from x-request-id header.

### POSITIVE — require-dpo.middleware.ts
- requireSuperAdminRole correctly restricts to super_admin only.

### POSITIVE — validation.middleware.ts
- Per-field error format: `{field, message}`. Useful for client error display.

## Cumulative Phase M progress: 10 / ~55 files (~500 lines)
