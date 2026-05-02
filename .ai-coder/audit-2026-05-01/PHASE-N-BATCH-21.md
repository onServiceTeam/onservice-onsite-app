# Audit 2026-05-01 — Phase N Batch 21 — address, service-area-change, upload, metrics, cache, sms

**Status:** 6 service files fully read line-by-line, ~833 lines covered.

## Files fully read (6 files, 833 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/address.service.ts | 193 |
| packages/api/src/services/service-area-change.service.ts | 185 |
| packages/api/src/services/upload.service.ts | 181 |
| packages/api/src/services/metrics.service.ts | 131 |
| packages/api/src/services/cache.service.ts | 76 |
| packages/api/src/services/sms.service.ts | 67 |

## NEW CRITICAL findings (1)

### CRIT-N14 — sms.service.ts uses axios — invalidates Bug 1271 native fetch claim

**Where found:** packages/api/src/services/sms.service.ts:1, 39

```ts
import axios from 'axios';
// ...
const response = await axios.post<SemaphoreResponse[]>(SEMAPHORE_API_URL, { ... });
```

The Phase 14 D01 Bug 1271 fix established "no axios anywhere; native fetch wrapper only." All Phase B/M/N batches verified this claim service-by-service. **sms.service.ts breaks the rule.**

**Impact:**
- The OTP delivery path — the most security-critical outbound HTTP in the codebase — uses an unaudited dependency (axios) instead of the audited native-fetch wrapper.
- Phase 14 D01 closeout claimed Bug 1271 was fixed across the codebase; this service was missed.
- Dependency vulnerability surface: axios has had multiple CVEs (e.g., CVE-2023-45857, CVE-2024-39338). Native fetch via Node 24 has no such surface.
- Audit-trail gap: the original audit's Bug 1271 verification was incomplete.

**Fix:**
1. Replace `axios.post(URL, body)` with `globalThis.fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })`.
2. Parse `response.json()` for the Semaphore response payload.
3. Remove `axios` from `packages/api/package.json` dependencies.
4. Add a CI guard (gate) that greps `packages/api/src` for `from 'axios'` and fails the build.

## NEW MEDIUM findings (4)

### MED-N143 — sms.service dev-mode OTP plaintext in logs

**Where:** sms.service.ts:32

```ts
if (process.env.NODE_ENV === 'development') {
  logger.info(`[DEV SMS] To: ${phone} | Message: ${message}`);
  return true;
}
```

The `message` parameter contains the full OTP code in plaintext. Combined with CRIT-N12 (OTPs stored plaintext in DB), the dev environment now has the OTP in BOTH the DB row AND the application log. Log shipping to a centralized log store (Sentry, Datadog, CloudWatch) extends the leak surface.

**Fix:** Mask the OTP in dev logs: `logger.info('[DEV SMS] sent', { phoneSuffix: phone.slice(-4), messageLength: message.length })`. Or strip the 6-digit code via regex before logging.

### MED-N144 — upload.service ALLOWED_MIME from platformConfig (admin tunability)

**Where:** upload.service.ts:16

```ts
const ALLOWED_MIME = new Set<string>(platformConfig.allowedImageTypes);
```

Same MED-N family — admin can't tune file type allowlist without code deploy.

**Fix:** Read from `platform_settings.allowed_image_mime_types` JSONB array.

### MED-N145 — metrics.service status lists drift from VALID_TRANSITIONS

**Where:** metrics.service.ts:41-49

Hardcoded booking status lists for "active" and "completed" buckets. If `booking.types.ts:VALID_TRANSITIONS` adds a new state (e.g., 'rematching'), metrics service silently miscounts — bookings in the new state appear in neither bucket.

**Fix:** Import the canonical status sets from `booking.types.ts` and reference them. Add a regression test that asserts every status in VALID_TRANSITIONS appears in exactly one metrics bucket.

### MED-N146 — service-area-change.service decide() does NOT verify provider exists

**Where:** service-area-change.service.ts:148-158

```ts
if (input.decision === 'approved') {
  const row = updated.rows[0]!;
  await client.query(
    `UPDATE providers SET service_area_id = $2, ... WHERE user_id = $1`,
    [row.provider_id, ...]
  );
}
```

`row.provider_id` is the providers.user_id according to the WHERE clause. If the provider was deleted/deactivated between request and decision, the UPDATE silently affects zero rows. No error surfaced. Admin sees "approved" but provider's area unchanged.

**Fix:** Check `result.rowCount` after the UPDATE; throw if zero. Also verify provider is `status = 'approved'` before applying.

## POSITIVE findings

1. **Phase 14 D14 Bug 1325 verified** at upload.service.ts:117-127 — every S3 PutObject sets SSE-KMS or AES256 explicitly. Combined with the bucket policy denying unencrypted PUT (s3-customer-uploads.tf), defense in depth is real.
2. **upload.service path traversal defense** (line 136-138, 167-169) — resolved path checked against UPLOAD_DIR prefix before write or delete.
3. **upload.service file-type defense in depth** (lines 74-92) — both MIME type and file extension checked, plus size cap.
4. **Phase 14 D09 Bug 1268** verified at service-area-change.service end-to-end — request + admin decide + audit + apply, all transactional.
5. **address.service properly transactional** — single-default invariant maintained, delete + reassign-default in one transaction.
6. **address.service MAX_ADDRESSES_PER_USER cap** (line 40) — hardcoded at 10, prevents DoS via address explosion. Could be platform_settings tunable.
7. **socket.service.service.ts** correct re-emission guards via room scoping.

## Confirmations

- **Bug 1325 (S3 SSE-KMS)** verified at upload.service.ts:112-127 — comment explicitly references Bug 1325 + Terraform-level fail-closed defense.
- **Bug 1268 (service area change)** verified at service-area-change.service.

## Cumulative running totals (after Phase N Batch 21)

| | Total | Batch 21 additions |
|---|---:|---:|
| **CRITICAL** | **187 + 1 = 188 real** (2 invalidated of 190) | **+1** |
| **MEDIUM** | **628 + 4 = 632** | **+4** |
| Lines fully read | ~133,978 / 146,236 | +833 |
| Coverage | **91.6%** | +0.6% |
