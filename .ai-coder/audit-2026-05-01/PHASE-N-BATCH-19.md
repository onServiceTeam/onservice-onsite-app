# Audit 2026-05-01 — Phase N Batch 19 — invoice, reconciliation, compliance-admin, onboarding, suki, staff, review, booking-photo

**Status:** 8 service files fully read line-by-line, ~3,111 lines covered.

## Files fully read (8 files, 3,111 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/invoice.service.ts | 498 |
| packages/api/src/services/compliance-admin.service.ts | 489 |
| packages/api/src/services/reconciliation.service.ts | 472 |
| packages/api/src/services/provider-onboarding.service.ts | 349 |
| packages/api/src/services/suki.service.ts | 335 |
| packages/api/src/services/booking-photo.service.ts | 334 |
| packages/api/src/services/staff.service.ts | 321 |
| packages/api/src/services/review.service.ts | 313 |

## NEW MEDIUM findings (17)

### MED-N116 — invoice.service generateInvoiceNumber uses Math.random

**Where:** invoice.service.ts:66-71

```ts
const random = Math.random().toString(36).substring(2, 8).toUpperCase();
return `INV-${year}${month}-${random}`;
```

6 base36 chars = ~2^31 entropy. Birthday-collision at ~60K invoices in same year-month. Predictable Math.random not cryptographically random. UNIQUE constraint catches but raw error surfaces.

**Fix:** `crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8)` or use a per-account sequence column.

### MED-N117 — invoice.service bulk inserts NOT transactional

**Where:** invoice.service.ts:206-282

`generateMonthlyInvoices` runs ONE INSERT into business_invoices (line 206) THEN ONE INSERT into business_invoice_items (line 267) as separate top-level db.query calls. If the items INSERT fails (DB blip, FK violation), invoices exist with no line items — customer sees totals without line item breakdown.

**Fix:** Wrap in `db.transaction(async (client) => { ... })`. Both bulk INSERTs should use the same client.

### MED-N118 — invoice.service checkOverdueInvoices N+1 owner lookup

**Where:** invoice.service.ts:419-461

For each overdue invoice, runs a separate `SELECT owner_user_id FROM business_accounts` query inside the loop. With N=200 overdue invoices, 200+ extra round trips. Could be a single JOIN.

**Fix:** Bulk-join account info into the UPDATE...RETURNING, or use a CTE.

### MED-N119 — reconciliation.service ALERT_THRESHOLD_CENTAVOS hardcoded

**Where:** reconciliation.service.ts:53

`export const ALERT_THRESHOLD_CENTAVOS = 10_000;` — P100. Not platform_settings tunable. Same MED-N family.

**Fix:** Read from `platform_settings.reconciliation_alert_threshold_centavos`.

### MED-N120 — reconciliation alert never dispatches Slack/email

**Where:** reconciliation.service.ts file header + line 257-269

File comment explicitly says "Actual outbound dispatch (Slack/email) is intentionally deferred — the DB flag + structured error log IS the alert." For a money-conservation system at launch, missing money may sit unflagged for hours/days until someone checks the admin dashboard. Should at least integrate with Sentry alerts as Phase 14 D14 mentioned PagerDuty for breach SLA.

**Fix:** Add Slack webhook (or PagerDuty) integration when `discrepancyAlertSent = true` and amount exceeds threshold. Track in LAUNCH-LIMITATIONS as v1.0 manual-monitoring acceptable risk if not addressed.

### MED-N121 — reconciliation two separate wallet queries (non-atomic snapshot)

**Where:** reconciliation.service.ts:213-243

Platform totals query (line 213) then user wallets query (line 237) run as separate db.query calls. If escrow release happens between them, the snapshot mixes two timestamps — discrepancy false-positive.

**Fix:** Single CTE that aggregates both buckets in one statement. Or wrap in `BEGIN ISOLATION LEVEL REPEATABLE READ; ... COMMIT;`.

### MED-N122 — compliance-admin requestDsrMoreInfo + audit + notification not transactional

**Where:** compliance-admin.service.ts:159-217

UPDATE data_subject_requests (line 178) + admin_actions audit (line 192-198) + notification (line 200-213) — all separate top-level db.query (or service call). If audit fails after status flip, NPC RA 10173 audit-trail gap. If notification fails, customer doesn't know more info needed.

**Fix:** Wrap UPDATE + audit in `db.transaction`; keep notification as post-commit best-effort.

### MED-N123 — compliance-admin NPC ref regex unbounded suffix (MED-N79 family)

**Where:** compliance-admin.service.ts:280

`/^NPC-\d{4}-[A-Z0-9]{6,}$/` — same `{6,}` unbounded as breach-log.service.ts. NPC actual format has fixed length.

**Fix:** Tighten to `/^NPC-\d{4}-[A-Z0-9]{6}$/`.

### MED-N124 — compliance-admin rejectDsr sets completed_at on rejection

**Where:** compliance-admin.service.ts:240-251

```ts
status = 'rejected', ... completed_at = NOW()
```

A rejected DSR gets `completed_at` set — same MED-N43 conflation. NPC reporting may need separate `rejected_at` vs `completed_at`.

**Fix:** Add `rejected_at` column or rename `completed_at` → `closed_at`.

### MED-N125 — compliance-admin publishConsentVersion pre-check race

**Where:** compliance-admin.service.ts:408-440

```ts
const existing = await db.query<...>(SELECT id FROM admin_actions WHERE ... LIMIT 1`);
if (existing.rows.length > 0) throw 409;
const result = await db.query<...>(`INSERT INTO admin_actions ...`);
```

Two simultaneous publish calls both pass the existence check and both INSERT — duplicate published versions. No unique constraint on the JSONB details fields.

**Fix:** Either (a) add a partial unique index on `admin_actions(action_type, target_type, (details->>'consentType'), (details->>'version')) WHERE action_type = 'consent_version_published'`, OR (b) use the dedicated `consent_versions` table that the file header recommends but doesn't exist yet.

### MED-N126 — suki.service SUKI_TIERS hardcoded in platformConfig

**Where:** packages/api/src/services/suki.service.ts:32-34

```ts
const SUKI_TIERS = platformConfig.sukiTiers;
const POINTS_REDEMPTION_RATE = platformConfig.sukiPointsRedemptionRate;
```

Same MED-N family — tier thresholds, discount %, points-per-peso multiplier all hardcoded in platformConfig. Admin can't tune the loyalty program.

**Fix:** Move to `platform_settings.suki_tiers` JSONB and `suki_points_redemption_rate`. Add admin UI under Settings.

### MED-N127 — suki.service redeemPoints conversion semantics confusing

**Where:** suki.service.ts:147-149

```ts
const amountCredited = points;  // 1:1 conversion?
```

Variable named `amountCredited` equals `points` — but tier config has `pointsPerPeso` (line 75 multiplier when EARNING). At redemption, the inverse rate isn't applied — 100 points becomes 100 centavos. If pointsPerPeso=2 (provider tier doubles points), customer earns 200 points per P1 spent, then redeems 200 points for P2 — net free. Should redemption rate differ from earning rate.

**Fix:** Add `pointsToPesoRate` setting (e.g., 100 points = P1) and apply at line 147. Document earning vs redemption rate explicitly.

### MED-N128 — staff.service removeStaffMember hard DELETE (no audit, no soft-delete)

**Where:** staff.service.ts:294

```ts
await db.query(`DELETE FROM admin_staff WHERE id = $1`, [staffId]);
```

Hard delete with NO admin_actions audit row. Phase 14 D06 transactional discipline applied to most admin mutations but missed here. Removing a staff member's history is destructive and unaudited.

**Fix:** Soft-delete via `deleted_at, deleted_by, deleted_reason` (migration 076 added these to admin_staff?). Add admin_actions audit. Wrap in transaction.

### MED-N129 — staff.service addStaffMember no audit row

**Where:** staff.service.ts:222-246

`INSERT INTO admin_staff ...` happens with no admin_actions audit. Adding a staff member is a privileged action and needs trail.

**Fix:** Wrap in transaction with admin_actions INSERT.

### MED-N130 — review.service flagged-content detection too narrow

**Where:** review.service.ts:284-289

```ts
function containsFlaggedContent(text: string): boolean {
  const phonePattern = /(\+?63|0)\d{10}/;
  const emailPattern = /...@.../;
  return phonePattern.test(text) || emailPattern.test(text);
}
```

Only flags phone numbers and emails. Doesn't flag profanity, defamation, harassment, threats. Spam reviews with marketing copy or insults pass through unflagged.

**Fix:** Add a profanity word list (Tagalog + English), threat-pattern regex, ALL CAPS detection. Consider integrating with a content-moderation API for production. Track on LAUNCH-LIMITATIONS if deferred.

### MED-N131 — review.service no max comment length validation

**Where:** review.service.ts:57-148

`createReview` accepts `data.comment` with no length cap. A malicious customer could submit a 1MB comment.

**Fix:** Validate `comment.length <= 2000` chars at validator layer.

### MED-N132 — booking-photo.service uploadBookingPhoto + DB insert non-transactional

**Where:** booking-photo.service.ts:119-152

S3 upload (line 119-125) succeeds, then DB insert (line 128-145). If DB insert fails, code calls `deleteUploadedFile` (line 150) as compensating action. But that delete itself can fail (S3 unavailable), leaving orphan S3 object that customer/provider didn't upload via the API.

**Fix:** Either (a) accept the orphan risk (S3 lifecycle policy can clean up unattached objects via tag), OR (b) tag the S3 object with the booking_id at upload time and run a periodic sweeper that deletes objects older than 1h with no booking_photos row.

## POSITIVE findings

1. **Phase 14 D09 provider-onboarding** verified end-to-end: trackProgress + submitForReview + adminDecide all properly transactional with admin_actions audit (lines 131, 198, 271). Bug 162/1199/1200 fixes real.
2. **Phase 14 D07 booking-photo dual-store** verified: server stores S3 storage_url, never file:// URI. Bug 36/461/1224 root cause closed.
3. **Phase 14 D06 reconciliation transactional discipline** correct — acknowledgeDiscrepancy uses FOR UPDATE row lock + transaction-wrapped UPDATE.
4. **Phase 14 D06 staff role archive** verified: deleteRole soft-deletes (line 128-172) with admin_actions audit. Bug 127 fix real.
5. **Suki tier-up bonus + notification** correctly transactional in recordBookingForSuki.
6. **review.service** uses transactional create + aggregate-rating refresh in single transaction (line 109-148).
7. **review.service privateNote** explicitly omitted from formatReview (line 305) to prevent leak to clients.
8. **Bug 1271 native fetch** verified across all 8 files.

## Confirmations

- **Phase 14 D06 Bug 127** (admin_role soft delete) verified at staff.service.deleteRole.
- **Phase 14 D09 Bug 162/1199/1200** verified at provider-onboarding.service end-to-end.
- **Phase 14 D07 Bug 36/461/1224** verified at booking-photo.service S3 path enforcement.
- **CRIT-N02 PII masking gap** family extended — neither suki, staff, nor invoice services apply PII masking on customer/provider fields returned to admins. Existing pii-mask.ts pattern not invoked.

## Cumulative running totals (after Phase N Batch 19)

| | Total | Batch 19 additions |
|---|---:|---:|
| **CRITICAL** | **187 real** | 0 |
| **MEDIUM** | **601 + 17 = 618** | **+17** |
| Lines fully read | ~131,771 / 146,236 | +3,111 |
| Coverage | **90.1%** | +2.1% |
