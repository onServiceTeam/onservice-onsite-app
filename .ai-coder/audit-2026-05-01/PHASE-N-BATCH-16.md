# Audit 2026-05-01 — Phase N Batch 16 — auth.routes + booking.routes

**Status:** 2 route files fully read line-by-line, ~2,002 lines covered.

## Files fully read (2 files, 2,002 lines)

| File | Lines |
|---|---:|
| packages/api/src/routes/auth.routes.ts | 977 |
| packages/api/src/routes/booking.routes.ts | 1025 |

## NEW CRITICAL findings (2)

### CRIT-N10 — booking.routes confirmation flow has multi-step failure recovery that can leak money

**Where found:** packages/api/src/routes/booking.routes.ts:504-548

After `transitionBookingStatus` (line 496-502) flips status to `'confirmed'`, the route runs THREE non-transactional steps:
1. `escrowService.releaseEscrow(id)` — moves money from escrow to provider/platform/guarantee wallets (line 507).
2. `UPDATE bookings SET status = 'payout_ready'` — separate db.query (line 509-512).
3. On error, attempts rollback `UPDATE bookings SET status = 'completed_by_provider', confirmed_at = NULL` (line 519-522).

Failure modes:
- **escrowService.releaseEscrow throws BEFORE money commits**: rollback succeeds, OK.
- **escrowService.releaseEscrow commits money but throws AFTER (e.g., on OR issuance)**: rollback re-sets booking status, but money already moved. Provider's wallet has the funds but booking is back at `completed_by_provider`. Customer can re-trigger confirmation → DOUBLE escrow release attempted. The escrow trx-aware helper has a `WHERE escrow_status = 'held'` guard (escrow.service.ts:529-536) that would block, but the booking shows `confirmed_at = NULL` while wallet shows credit.
- **Money committed, status update step 2 fails (line 510-512)**: code falls into else branch (line 525-528), logs error, but does NOT rethrow. Response returns success with status='confirmed' but provider wallet credited and booking stuck at 'confirmed'. Provider sees 'paid' in their dashboard but customer sees 'confirmed' (no payout_ready yet). Manual intervention required.

**Impact:**
- Money/state inconsistency on transient failures.
- Phase 14 D06 transactional discipline regression (the entire confirmation flow + escrow release should be atomic).

**Fix:**
1. Wrap `transitionBookingStatus` (status update to 'confirmed') AND `escrowService.releaseEscrowInTransaction` (the trx-aware helper that already exists) AND the secondary status update to 'payout_ready' in ONE outer transaction.
2. Move OR issuance, referral credit, suki recording to AFTER commit (they are best-effort by design — and currently are).
3. Remove the rollback try/catch dance — the transaction handles rollback automatically.

### CRIT-N11 — auth.routes admin login JSON response still leaks accessToken + refreshToken

**Where found:** packages/api/src/routes/auth.routes.ts:577-585, 678-686, 814-823

Bug 1251 fix moved admin tokens to HttpOnly cookies. But the response body STILL returns the tokens in JSON for "backward compat":

```ts
res.json({
  success: true,
  data: {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: formatUserResponse(user),
    sessionExpiresAt: ...
  },
});
```

If admin app is targeted by XSS (e.g., a stored XSS in admin Notes field), the malicious script can fetch /auth/admin/login (or replay a credential prompt), receive the response JSON, and exfiltrate both tokens — defeating the entire point of HttpOnly cookies.

The comment says "the client refactor on the same PR stops reading them" — meaning the legacy client code path was supposed to be removed but the response body wasn't trimmed. This contradicts the documented Bug 1251 fix.

**Impact:**
- HttpOnly cookies provide no defense if the same tokens are also in the response body. Reverts the security posture to Phase 13 levels.
- An attacker with XSS can persist a backdoor by stealing the long-lived refresh token via a single login event.

**Fix:**
1. Remove `accessToken` and `refreshToken` from response body of `/auth/admin/login` (line 580-581), `/auth/admin/2fa/verify` (line 681-682), and `/auth/admin/2fa/enable` (line 818-819).
2. Return only `{ success: true, data: { user, sessionExpiresAt } }`.
3. Update admin client to rely entirely on cookies (or document explicitly which legacy flows still need body tokens, and audit those callers).
4. Add a CI guard test that asserts admin login response body has no `accessToken` / `refreshToken` keys.

## NEW MEDIUM findings (12)

### MED-N80 — auth.routes admin login email lookup not indexed

**Where:** auth.routes.ts:411-415

```ts
SELECT ... FROM users WHERE email = $1 AND role IN ('admin', 'super_admin')
```

Param is pre-lowercased. If `users.email` lacks `LOWER` index or `CITEXT` type, this is a sequential scan over all users on every admin login attempt. Not a security issue but a DOS vector under load.

**Fix:** Add `CREATE INDEX users_email_lower_idx ON users (LOWER(email))` migration, or migrate `email` to CITEXT type.

### MED-N81 — auth.routes /me PATCH allows email update with no uniqueness check

**Where:** auth.routes.ts:351-398

```ts
if (email !== undefined) {
  sets.push(`email = $${idx++}`);
  vals.push(email);
}
```

If `users.email` has a UNIQUE constraint, the DB throws raw `23505` violation on duplicate; not surfaced as friendly 409. If no UNIQUE constraint exists, two users can share the same email — breaks admin-login lookup (MED-N80) and password-reset flow.

**Fix:** Pre-check `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id != $2` and throw 409 on conflict. Verify migration adds UNIQUE on `LOWER(email)` for admin role users.

### MED-N82 — auth.routes 2FA setup writes secret outside transaction

**Where:** auth.routes.ts:722-726

```ts
const encryptedSecret = encryptSecret(secret);
await db.query(`UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2`, ...);
```

If the response fails to send (network drop), the secret is stored but the QR code never reaches the user. They must call setup again, which OVERWRITES the previous secret. Acceptable but could be cleaner.

**Fix:** Defer the UPDATE until /enable confirms the code. Hold the secret in a short-lived in-memory cache (or signed token returned to client). Otherwise document as acceptable.

### MED-N83 — auth.routes 2FA verify decrypts secret with hardcoded fallback (CRIT-M04 family)

**Where:** auth.routes.ts:628, 778, 954

```ts
const decryptedSecret = decryptSecret(user.totp_secret!);
```

Per CRIT-M04 (Phase M), `decryptSecret` falls back to plaintext if `TOTP_ENCRYPTION_KEY` env var is missing. In production with env unset, TOTP secrets are stored AND read as plaintext. The 2FA verify step still works (verifyTotp accepts any string), but compromise of DB now compromises all admin TOTP secrets.

**Fix:** See CRIT-M04 fix — fail at module load if `TOTP_ENCRYPTION_KEY` missing in production. This route file should not need changes once that's enforced.

### MED-N84 — auth.routes preAuthToken endpoints lack Zod validation

**Where:** auth.routes.ts:401, 593, 925

`/auth/admin/login`, `/auth/admin/2fa/verify`, `/auth/admin/2fa/disable` extract fields directly from `req.body` with manual type checks. Most other endpoints use `validationMiddleware(Zod schema)`. Inconsistent and error-prone.

**Fix:** Add Zod schemas to `validators/auth.validators.ts` and apply via validationMiddleware.

### MED-N85 — auth.routes refresh-token (mobile) accepts token in body, no rotation enforced

**Where:** auth.routes.ts:301-312

`/auth/refresh-token` accepts `{ refreshToken }` in body and returns new pair. The route delegates to `authService.refreshAccessToken` (verified Phase B). But there's no IP/device fingerprint rebinding — a stolen refresh token from another device works seamlessly until manually revoked.

**Fix:** Track device_fingerprint with the refresh_token row at issuance; on refresh, compare current request fingerprint to stored. On mismatch, log security event + reject (force re-login).

### MED-N86 — booking.routes assign allows customer self-assign of provider

**Where:** booking.routes.ts:657-661

```ts
const isAdmin = role === 'admin' || role === 'super_admin';
const isBookingOwner = booking.customer_id === userId;
if (!isAdmin && !isBookingOwner) { throw 403; }
```

Customers can assign a SPECIFIC provider via `POST /bookings/:id/assign` with `{ providerId }`. This bypasses the matching algorithm and skips conflict-of-interest checks (e.g., matching service area, surge pricing fairness). A customer brigading a specific provider can also be a vector for collusion (customer pays in cash off-app for the discount, completes booking via app to launder the relationship).

**Fix:** Either (a) admin-only assignment; customer can only `confirm` an assignment that the matching algorithm proposed, OR (b) keep customer self-assign but log as `security_events` for fraud-pattern analysis (already covered by bypass-detection cron per Phase M).

### MED-N87 — booking.routes assign suki UPDATE outside transaction

**Where:** booking.routes.ts:706-718

If the suki discount calc + booking UPDATE succeeds but the subsequent `notifyProviderNewJob` (line 721) fails (Expo down), the booking is assigned but the provider doesn't know. Customer also gets a notification (line 729-733) — even if provider didn't receive theirs.

**Fix:** Wrap the suki calc + booking UPDATE in a transaction. Move notifications to AFTER commit (they are best-effort, but log + retry queue for failures).

### MED-N88 — booking.routes report-no-show: cancellation + escrow not transactional

**Where:** booking.routes.ts:946-1023

```ts
await db.query(`UPDATE bookings SET status = 'cancelled_by_customer' ...`);
await escrowService.handleCancellation(id, hoursUntil, true, true);
await notificationService.createNotification(...);
```

If `handleCancellation` fails after the booking is marked cancelled, the customer is "cancelled" but escrow is stuck. Same shape as CRIT-N10.

**Fix:** Use `escrowService.handleCancellationInTransaction` (already exists per escrow.service.ts:642) and wrap the booking UPDATE in the same transaction.

### MED-N89 — booking.routes photos endpoint hardcodes mime_type='image/jpeg'

**Where:** booking.routes.ts:906

```ts
INSERT INTO booking_photos (..., mime_type) VALUES (..., 'image/jpeg')
```

If actual upload was PNG/WEBP/HEIC (mobile commonly uploads HEIC from iOS), the stored mime_type is wrong. Subsequent S3 lifecycle / Content-Type-based handling breaks.

**Fix:** Pass mime_type from /api/v1/uploads response through the photo-attach call.

### MED-N90 — booking.routes match endpoint exposes internal matching config

**Where:** booking.routes.ts:631-633

```ts
res.json({ success: true, data: {
  bookingId: id, providers, config: matchingService.getMatchConfig(),
}});
```

Returning `getMatchConfig()` to the customer client exposes internal weights (e.g., distance weight, rating weight, surge eligibility). A malicious customer can reverse-engineer the algorithm and game it.

**Fix:** Remove `config` from the response. If admin needs visibility, expose via separate admin-only endpoint.

### MED-N91 — booking.routes pricing-preview lacks Zod schema

**Where:** booking.routes.ts:291-324

Manual validation only. No `validationMiddleware`.

**Fix:** Add `pricingPreviewSchema` to validators/booking.validators.ts.

## POSITIVE findings

1. **Bug 1251 admin cookie auth verified end-to-end** — auth.routes /admin/login (line 569-575), /admin/2fa/verify (line 670-676), /admin/2fa/enable (line 805-812), /admin/refresh (line 877-883), /admin/logout (line 914) all use `setAdminSessionCookies` and `clearAdminSessionCookies`. CSRF token revocation on refresh (line 875).
2. **Force 2FA enrollment for admin** (auth.routes.ts:510-540) — admins without TOTP get `pre_auth_2fa_setup` token forcing setup before full session.
3. **Phase 14 D07 photo URL validation** verified at booking.routes.ts:871-878 — file:// URIs rejected; only HTTP(S) URLs accepted.
4. **Phase 14 D07 photo dual-write** verified at booking.routes.ts:888-910 — writes to both legacy text[] columns AND booking_photos table, atomically.
5. **Provider arrival geo-check** (booking.routes.ts:449-475) — server-side haversine distance check against `platformConfig.providerArrivalRadiusMeters` before allowing 'provider_arrived' transition.
6. **Provider minimum time-on-site** (booking.routes.ts:477-494) — server-enforced minimum on-site duration before 'completed_by_provider'. Anti-fraud measure.
7. **No-show minimum wait** (booking.routes.ts:984-994) — server-enforced minimum minutes-since-scheduled before allowing report-no-show. Anti-abuse.
8. **OTP attempt recording on success AND failure** (auth.routes.ts:191-198 + 203-211) — proper anti-bruteforce telemetry.
9. **CAPTCHA gate at threshold** (auth.routes.ts:164-187) — once OTP failures cross threshold, CAPTCHA required before further attempts.
10. **Booking conflict detection on assign** (booking.routes.ts:684-695) — prevents same-time double-booking of provider.

## Confirmations

- **CRIT-M05 (trust proxy)** has direct downstream impact — `getClientIp(req)` used at lines 148, 202, 223, 286, 406, 598, 845, etc. throughout auth.routes. All OTP lockout / login attempt records use bad IPs without trust proxy.
- **CRIT-M04 (TOTP encryption optional)** confirmed at auth.routes.ts:628, 778, 954 — every TOTP verify path calls `decryptSecret`.
- **CRIT-N03 (placeholder BIR identity)** is downstream of OR issuance after escrow release — booking.routes line 504-548 trigger this.
- **Bug 1271 native fetch** verified — no axios in either route file.

## Cumulative running totals (after Phase N Batch 16)

| | Total | Batch 16 additions |
|---|---:|---:|
| **CRITICAL** | **183 + 2 = 185 real** (2 invalidated of 187) | **+2** |
| **MEDIUM** | **563 + 12 = 575** | **+12** |
| Lines fully read | ~123,739 / 146,236 | +2,002 |
| Coverage | **84.6%** | +1.4% |

## Files NOT YET READ — remaining (~76 files, ~17,500 lines)

Top priority for Batch 17:
- provider.routes.ts (735) + catalog.routes.ts (466) + business.routes.ts (400)
- recurring-booking.service.ts + uploads.service.ts + tip.service.ts
- account.service.ts + suki.service.ts + checklist.service.ts
- pricing.service.ts + matching.service.ts + auth.service.ts (Phase B claimed)
