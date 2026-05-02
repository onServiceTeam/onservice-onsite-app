# Phase M Batch 4 — server + config + jobs + types + models + seeds (17 files, ~1,600 lines)

## Files fully read
- packages/api/src/server.ts (291)
- packages/api/src/config/database.config.ts (29)
- packages/api/src/config/paymongo.config.ts (13)
- packages/api/src/config/platform.config.ts (178)
- packages/api/src/config/redis.config.ts (31)
- packages/api/src/config/sentry.config.ts (53)
- packages/api/src/models/db.ts (37)
- packages/api/src/jobs/queue.ts (14)
- packages/api/src/jobs/workers.ts (566)
- packages/api/src/seeds/run-seeds.ts (43)
- packages/api/src/types/api.types.ts (20)
- packages/api/src/types/booking.types.ts (92)
- packages/api/src/types/payment.types.ts (43)
- packages/api/src/types/user.types.ts (42)
- packages/api/src/types/aws-s3.d.ts (29)
- packages/api/src/types/multer.d.ts (51)
- packages/api/src/types/sentry.d.ts (9)

## Findings

### CRIT-M05 — server.ts doesn't configure trust proxy; req.ip is wrong behind a load balancer
**Where found:** packages/api/src/server.ts (entire file, no `app.set('trust proxy', ...)`)
**Understood:** Express's `req.ip` returns the remote socket address by default. When the API runs behind any proxy (Vercel, Render, AWS LB, nginx, Cloudflare), the socket address is the proxy's IP — not the real client. Three downstream consequences:
1. **Rate limit broken:** express-rate-limit keys by `req.ip` by default. With trust proxy unset, ALL traffic from the proxy gets one shared rate-limit bucket. The whole user base blocks each other — or one attacker can exhaust the limit for everyone with a single thread.
2. **IP block bypass:** ip-block.middleware uses `getClientIp(req)` which manually parses X-Forwarded-For — that part works only if the proxy sends X-F-F. But if the API is exposed directly (no proxy), an attacker sets X-Forwarded-For to spoof a "good" IP and bypass the block (MED-M01).
3. **Audit log records proxy IP:** every action logged shows the LB IP, not the actual client. Forensics broken.

**Combined with MED-M01 (getClientIp blindly trusts X-Forwarded-For), the platform IP-tracking story is fundamentally broken in production.**

**Fix:** Add `app.set('trust proxy', 1)` early in server.ts (after `const app = express()`, before any middleware). Value depends on infra: `1` = trust one proxy hop (typical AWS/Render/Vercel), or specific subnet (`'loopback, linklocal, uniquelocal'`). Then update getClientIp to use `req.ip` (which respects trust proxy) instead of manually parsing the header. With trust proxy set, Express only trusts X-Forwarded-For if the request came from a trusted source — closes the spoofing hole.

### MED-M14 — Database pool has no SSL config; production DB connections may be unencrypted
**Where found:** packages/api/src/config/database.config.ts:13-19
```ts
const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  min: Number(process.env.DB_POOL_MIN) || 2,
  max: Number(process.env.DB_POOL_MAX) || 10,
  ...
};
```
**Understood:** No `ssl` field. In production, Postgres connections SHOULD require TLS. If DATABASE_URL doesn't include `?sslmode=require`, the pool silently establishes plaintext connections — credentials and queries (including PII) over the wire unencrypted.
**Fix:** Add `ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false`. AND require `?sslmode=require` in production DATABASE_URL via startup-time check.

### MED-M15 — PayMongo webhook secret defaults to empty string; webhooks could be silently un-verified
**Where found:** packages/api/src/config/paymongo.config.ts:8
```ts
webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',
```
**Understood:** If env var unset, webhookSecret is an empty string. Webhook signature verification (typically HMAC-SHA256) against an empty secret either succeeds for empty signatures or fails open depending on implementation. Either way, an attacker could POST forged webhook events to mark bookings as paid without actually paying.
**Fix:** Startup-time assertion: in production, throw if webhookSecret is empty. Document in launch-cutover.md as required env var.

### MED-M16 — autoConfirmBookings can release escrow but leave booking stuck at 'confirmed'
**Where found:** packages/api/src/jobs/workers.ts:76-87
```ts
try {
  await db.query(
    `UPDATE bookings SET status = 'payout_ready', updated_at = NOW()
     WHERE id = $1 AND status = 'confirmed'`,
    [booking.id],
  );
} catch (statusErr) {
  logger.error('Post-escrow status update failed — escrow released but booking stuck at confirmed', {
    bookingId: booking.id,
    error: statusErr instanceof Error ? statusErr.message : 'Unknown',
  });
}
```
**Understood:** The comment in the catch admits the failure mode: escrow is released to the wallet, but the booking status doesn't advance to 'payout_ready'. Provider is paid (wallet has funds) but the booking record is in 'confirmed' state — payout job won't pick it up because it filters on 'payout_ready'. Admin sees stuck booking, provider sees money. Reconciliation requires manual SQL.
**Fix:** Wrap escrow release + status update in db.transaction so they're atomic. If post-escrow status update fails, ROLLBACK reverts the escrow release. Then retry on next scheduler tick.

### MED-M17 — TypeScript types missing 'founding' tier (drift with migration 073)
**Where found:** packages/api/src/types/user.types.ts:3
```ts
export type ProviderTier = 'new' | 'verified' | 'pro' | 'elite';
```
**Understood:** Migration 073 added 'founding' to providers.tier CHECK constraint. The TS type doesn't include it. Service code that types provider.tier as ProviderTier loses 'founding' at the type boundary. Same drift family as MED-K05 / MED-K20.

### POSITIVE — server.ts (Bug 1251 verified)
- requireAdminCsrf mounted on /api/v1/admin (write methods only — GET/HEAD/OPTIONS bypass).
- Admin login route is at /api/v1/auth/admin (not /api/v1/admin), so login isn't blocked by CSRF guard.
- helmet, cors with allowlist, raw body capture for webhook signatures, cookie-parser. Comprehensive defense in depth.
- /health (shallow) + /health/ready (DB + Redis) split — proper readiness probe pattern.
- /metrics Prometheus endpoint. Good observability.
- Sentry.setupExpressErrorHandler BEFORE custom error handler — captures unhandled errors.
- Routes mounted in dependency order (admin sub-routes before generic admin route fallthrough).

### POSITIVE — database.config.ts
- pg-types BIGINT → JS Number cast (Phase 13 Dispatch E).
- Pool error handler logs (no silent connection failures).
- Connection timeout 5s prevents request hangs.

### POSITIVE — platform.config.ts
- SiguradoShield comments + removal (Bug 1168). All insurance constants gone.
- Bug 1170/1198 cancellation comments — never reintroduce hardcoded tiers.
- otpLockoutThresholds: progressive (3→5min, 5→15min, 10→60min).
- jwtExpiresIn 15m for all roles (short-lived access tokens, refresh-driven).
- qualityScoreWeights: explicit 5-component weighted score.

### POSITIVE — models/db.ts
- query() and transaction() helpers. Comment requires parameterized statements.
- Transaction wrapper does proper BEGIN/COMMIT/ROLLBACK with finally release().

### POSITIVE — jobs/workers.ts (massive coverage)
- 13 distinct scheduler jobs covering: auto-confirm, quote expiry, unmatched booking expiry, NBI check, no-show detection, bypass detection (10 patterns incl. Tagalog), recurring booking generation, monthly invoicing, overdue invoice check, slot waitlist, data export processing, account deletion processing, suspicious IP detection, security cleanup, quality score compute, dispute auto-escalation.
- BYPASS_PATTERNS catches: PH phone numbers, GCash/Maya/PayMaya names, "meet me outside / pay directly", account numbers, "PM mo / direct message", text/tawag, off-app/sa labas, viber/telegram/signal/whatsapp, BDO/BPI/Metrobank, "bayad ko/kita". Comprehensive culture-specific.
- autoConfirmBookings has rollback on escrow release failure (escrow service throws → booking status reverts).
- checkNbiExpiry auto-suspends provider on expired NBI.
- All scheduler jobs initialized after server.listen() (avoids tasks running before server is ready).

### POSITIVE — seeds/run-seeds.ts
- Transactional. ROLLBACK on any failure. Files in alphabetical order.

### POSITIVE — booking.types.ts
- VALID_TRANSITIONS table — strict state machine enforcement.
- canTransition() helper.
- Type union of 17 statuses matches the validator enum.

### POSITIVE — payment.types.ts, api.types.ts, user.types.ts
- Standard discriminated unions and interfaces.

## Cumulative Phase M progress: 55 / 55 files (~3,548 lines) — **PHASE M COMPLETE**
