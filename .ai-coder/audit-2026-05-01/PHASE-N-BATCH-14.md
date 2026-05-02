# Audit 2026-05-01 — Phase N Batch 14 — data-management, notification, security

**Status:** 3 service files fully read line-by-line, ~1,632 lines covered.

## Files fully read (3 files, 1,632 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/data-management.service.ts | 558 |
| packages/api/src/services/notification.service.ts | 551 |
| packages/api/src/services/security.service.ts | 524 |

## NEW CRITICAL findings (2)

### CRIT-N07 — Data export marked "completed" but no S3 upload happens

**Where found:** packages/api/src/services/data-management.service.ts:76-128

```ts
// In production: upload to S3 and store the URL
// For now, mark complete with metadata
await db.query(
  `UPDATE data_export_requests
   SET status = 'completed', file_size_bytes = $2,
       completed_at = NOW(), expires_at = $3
   WHERE id = $1`,
  ...
);
```

The data export is computed in memory (`gatherUserData` + JSON/CSV serialization) but the result is NEVER persisted to S3 or any storage. The DB row is marked `'completed'` with `file_url = NULL`. Customers requesting their NPC RA 10173 right-to-data-portability export get a "Export Complete" UI signal but no actual file delivery.

**Impact:**
- NPC RA 10173 violation: data subject's right to access requires actual data delivery within 15 days. Marking complete without delivery is non-compliance.
- Launch blocking for compliance.
- The DB row's `file_size_bytes` is recorded but the bytes themselves are discarded after the function returns.

**Fix:**
1. Upload the serialized blob to S3 (use `utils/s3-bir.ts` pattern from vat-report.service.ts:280-288 — already exists).
2. Store the resulting URL in `data_export_requests.file_url`.
3. Add presigned-URL generation for the customer download endpoint.
4. Add file lifecycle policy on S3 bucket matching the 7-day expiry.
5. Add regression test that fails when `processDataExport` returns without `file_url` being non-null on success.

### CRIT-N08 — anonymizeUser runs 7 queries OUTSIDE a transaction (partial-anonymization risk)

**Where found:** data-management.service.ts:375-441

`anonymizeUser` performs the GDPR-grade anonymization cascade through 7 separate `db.query` calls (no `db.transaction`):
1. UPDATE users (line 379)
2. DELETE user_addresses (line 392)
3. DELETE push_tokens (line 397)
4. DELETE refresh_tokens (line 402)
5. UPDATE reviews (line 407)
6. UPDATE messages (line 412)
7. UPDATE providers + provider_services (lines 425, 436)

If query #4 fails (e.g., DB connection blip), the user has been partially anonymized: addresses deleted, push tokens gone, refresh tokens not deleted (security risk!), reviews still have name. The DB is in a half-anonymized state with no rollback.

**Impact:**
- Critical privacy/security: refresh tokens not deleted means the "deleted" user's old session remains valid for up to 7 days.
- Compliance: NPC may flag the half-state as data still being processed.
- Hard to recover: no idempotent retry — re-running starts from scratch but UPDATE users would set `phone = +63000<NEW timestamp>` causing a UNIQUE collision because Date.now() is unique per call.

**Fix:**
1. Wrap entire function body in `db.transaction(async (client) => { ... })` and pass client through.
2. Make the function idempotent: skip operations that have already been applied (e.g., check `users.is_active = FALSE` early).
3. Use `crypto.randomUUID()` for anonymized phone/email rather than `Date.now()` to avoid collision on retry.
4. Add a regression test that simulates failure mid-cascade and asserts rollback.

## NEW MEDIUM findings (15)

### MED-N52 — data-management requestAccountDeletion checks only available_balance, not pending

**Where:** data-management.service.ts:269-280

```ts
SELECT COALESCE(SUM(available_balance), 0)::text AS balance
FROM wallets WHERE user_id = $1 AND available_balance > 0
```

Provider wallet has both `available_balance` (withdrawable) and `pending_balance` (in escrow). User can request deletion while pending escrow holds money. After 30-day cooling-off, money becomes inaccessible (anonymized account can't withdraw).

**Fix:** Sum `(available_balance + pending_balance)` and require both be zero, or block until pending is cleared via natural booking flow.

### MED-N53 — data-management anonymized phone format wrong length

**Where:** data-management.service.ts:376

```ts
const anonymizedPhone = `+63000${Date.now().toString().slice(-7)}`;
```

This produces 12 chars (`+63000` + 7 digits). PH phones in the codebase are 13 chars (+63 + 10 digits). Validators in middleware/validators (Phase M) likely reject this format if any read code-path validates phones. May break admin queries.

**Fix:** Use `+639000000000` + 4 random hex digits style (PH 11-digit normalized format), or document the deviation in the schema comment.

### MED-N54 — data-management cancelAccountDeletion doesn't check cooling_off_ends_at

**Where:** data-management.service.ts:301-316

If cooling_off has already ended and `processExpiredCoolingOff` cron is about to flip the row to 'processing', a user could cancel right before processing starts. Race condition. Also no audit row for the cancellation.

**Fix:** Add `WHERE status IN ('pending', 'cooling_off') AND cooling_off_ends_at > NOW()` clause and an `admin_actions` audit row recording the cancellation reason.

### MED-N55 — data-management active-bookings filter excludes 'in_progress' from completion list

**Where:** data-management.service.ts:257-260

```ts
AND status NOT IN ('confirmed', 'payout_ready', 'paid_out',
                   'cancelled_by_customer', ...)
```

Status not in completed/cancelled — but no carve-out for 'in_progress'. So `in_progress` blocks deletion. UX blocking: in-progress booking can't be cancelled by the user (in_progress means provider already started). User stuck unable to delete account until 48h auto-confirm fires.

**Fix:** Either accept the deletion request and let cooling-off cover the in_progress window, or surface a clearer error: "Booking #XXX is in progress. It will auto-complete in N hours; please request deletion afterward."

### MED-N56 — data-management dispute status not blocked

**Where:** data-management.service.ts:254-267

The active-bookings check excludes booking states but does NOT check `disputes.status` separately. A user could request deletion while in active dispute. After cooling-off, anonymization happens with disputeresolved against an anonymized actor.

**Fix:** Add `EXISTS (SELECT 1 FROM disputes WHERE ... AND status NOT IN ('resolved', 'closed'))` clause.

### MED-N57 — notification deliverPushToDevice fire-and-forget without retry

**Where:** notification.service.ts:196-199

```ts
void deliverPushToDevice(userId, title, body, ...);
```

If Expo push API call fails (network, rate limit, 5xx), the push is lost silently. Only logged. No retry queue.

**Fix:** Enqueue to a `push_queue` table on failure with a worker that retries with exponential backoff. Same pattern as MED-N28 (refund-pending).

### MED-N58 — notification statusMessages hardcoded English (no i18n)

**Where:** notification.service.ts:256-302

All notification bodies are English-only. Tagalog/Filipino-speaking providers see English notifications. Bug 1170/1198 cancellation policy was localized but notifications were not.

**Fix:** Move to notification_templates DB (already exists for some types per `templateService.getTemplateBySlug`). Add Tagalog versions per template slug. Default to user's locale from users.preferred_locale.

### MED-N59 — notification cancelled_by_provider uses "customer has cancelled" body

**Where:** notification.service.ts:287-296

```ts
cancelled_by_customer: { ... body: 'The customer has cancelled this booking.' ... },
cancelled_by_provider: { ... body: 'The customer has cancelled this booking.' ... },
```

Both cancellation events use identical body text claiming "the customer has cancelled". The `cancelled_by_provider` case is mis-attributed.

**Fix:** Change the `cancelled_by_provider` body to "The provider has cancelled this booking. We will help you find another provider."

### MED-N60 — notification createNotification merges type into data field

**Where:** notification.service.ts:38-49

```ts
const enrichedData = { ...params.data, type: params.type };
```

If caller's `data` already has a `type` key (e.g., a custom payload), it gets overwritten by `params.type`. Subtle bug.

**Fix:** Use a different key like `notificationType` or namespace under `data._meta.type`.

### MED-N61 — notification resolveTemplate fallback hides DB corruption

**Where:** notification.service.ts:95-110

```ts
try { const template = await templateService.getTemplateBySlug(slug); ... }
catch { /* Template not found or inactive — use hardcoded fallback */ }
```

Catch block is empty (no logger). If `notification_templates` table is corrupted or the slug is mistyped at the call site, the catch silently uses fallback. Admin would never know template subsystem is broken.

**Fix:** Add `logger.warn('Failed to resolve template; using fallback', { slug, err })` in the catch.

### MED-N62 — security checkOtpLockout uses Math.max not sum (attacker bypass)

**Where:** security.service.ts:92

```ts
const effectiveCount = Math.max(failedCount, ipFailedCount);
```

If an attacker hits 5 phones on 1 IP (5 IP failures, 1 phone failure each), `effectiveCount = max(1, 5) = 5`. Locks out the LAST phone tried, but the 4 other phones' counts say they're at 1 failure → not locked. Attacker rotates through phones to evade per-phone lockout.

**Fix:** Add IP-only lockout that's independent of phone-level lockout. If `ipFailedCount >= IP_THRESHOLD`, block ALL OTP attempts from that IP regardless of phone (maybe with shorter lockout window). Document the threat model in a comment.

### MED-N63 — security revokeDevice has no audit log

**Where:** security.service.ts:241-250

```ts
export async function revokeDevice(userId: string, deviceId: string): Promise<boolean> {
  const result = await db.query(`DELETE FROM device_fingerprints WHERE id = $1 AND user_id = $2`, ...);
  return (result.rowCount ?? 0) > 0;
}
```

Device revocation is a security-sensitive action with NO `logSecurityEvent` call. If an attacker revokes the legitimate user's device, there's no trail.

**Fix:** Add `await logSecurityEvent({ userId, eventType: 'device_revoked', metadata: { deviceId } })` before/after the DELETE.

### MED-N64 — security blockIp ON CONFLICT skips re-block of inactive rows

**Where:** security.service.ts:286-292

```ts
ON CONFLICT (ip_address) WHERE is_active = TRUE
DO UPDATE SET ...
```

Partial unique index `(ip_address) WHERE is_active = TRUE` only fires the conflict on active rows. If an IP was blocked, then unblocked (`is_active = FALSE`), then blocked again, the second block creates a NEW row with that same IP. Multiple inactive history rows accumulate.

**Fix:** Either (a) drop the `WHERE is_active = TRUE` from the partial index (use plain UNIQUE on ip_address) and use `DO UPDATE SET is_active = TRUE, ...`, or (b) accept the history-rows pattern and document it.

### MED-N65 — security detectSuspiciousIps serial loop, not batched

**Where:** security.service.ts:439-449

For each suspicious IP, calls `isIpBlocked` (1 query) then `blockIp` (2 queries: INSERT + logSecurityEvent). At 100 suspicious IPs/hour, that's 300 queries serially. Cron job latency increases linearly.

**Fix:** Use a single `INSERT ... SELECT FROM login_attempts ... ON CONFLICT DO NOTHING` to bulk-block. Bulk-write security_events too.

### MED-N66 — security CAPTCHA_SECRET_KEY missing in prod fails open silently

**Where:** security.service.ts:151-158

```ts
if (!captchaSecret) {
  if (process.env.NODE_ENV === 'development') { ... return true; }
  logger.warn('CAPTCHA_SECRET_KEY not configured');
  return false;
}
```

Production with missing secret returns `false` (CAPTCHA fails). Correct posture, but silent — only logger.warn at first call. Should fail at module load (same pattern as CRIT-M04 TOTP_ENCRYPTION_KEY).

**Fix:** Add a startup-time check in server.ts or a config validator that throws if `NODE_ENV === 'production' && !CAPTCHA_SECRET_KEY`. Mirrors the recommended fix for CRIT-M04.

## POSITIVE findings

1. **Phase 14 D08 marketing consent enforcement** correctly implemented — `isMarketingChannelEligible` and `listMarketingEligibleUsers` both require `marketing_consent_acknowledged_at IS NOT NULL` AND per-channel toggle (notification.service.ts:508-551).
2. **Bug 1271 native fetch wrapper** verified — Expo push API uses `globalThis.fetch` (notification.service.ts:148), Cloudflare Turnstile uses `globalThis.fetch` (security.service.ts:161). No axios.
3. **Defense in depth on push token lifecycle** — DeviceNotRegistered errors trigger automatic stale-token cleanup (notification.service.ts:170-176). Reduces wasted Expo API calls.
4. **OTP lockout multi-tier** — `OTP_LOCKOUT_THRESHOLDS` from platformConfig provides graduated lockout (5min → 15min → 1hr → 24hr) which is correct security posture.

## Confirmations

- **CRIT-M05 (trust proxy missing)** has downstream impact here — `recordLoginAttempt` and `checkOtpLockout` use `req.ip` which is wrong behind LB. OTP lockout based on bad IP = either too lax (LB IP mistakenly trusted) or too strict (one LB IP locks out all users).
- **MED-N31/N32 (in-process platformConfig over platform_settings)** confirmed at security.service.ts:39-40, 427.
- **CRIT-M04 (TOTP encryption optional)** has security.service.ts:151-158 as analogous pattern (CAPTCHA_SECRET fail-open in prod).

## Cumulative running totals (after Phase N Batch 14)

| | Total | Batch 14 additions |
|---|---:|---:|
| **CRITICAL** | **181 + 2 = 183 real** (1 invalidated of 184) | **+2** |
| **MEDIUM** | **535 + 15 = 550** | **+15** |
| Lines fully read | ~119,453 / 146,236 | +1,632 |
| Coverage | **81.7%** | +1.1% |

## Files NOT YET READ — remaining (~82 files, ~21,900 lines)

Top priority for Batch 15:
- admin.service.ts (520) + breach-log.service.ts + bir-admin.service.ts
- payout.service.ts (Phase B claimed; verify) + tip.service.ts + suki.service.ts
- account.service.ts + recurring-booking.service.ts + uploads.service.ts
- booking.service.ts (1197) — full re-read overdue
- auth.routes.ts (977) + booking.routes.ts (1025)
