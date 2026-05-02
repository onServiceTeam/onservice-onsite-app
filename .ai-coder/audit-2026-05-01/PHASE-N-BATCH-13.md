# Audit 2026-05-01 — Phase N Batch 13 — compliance, VAT, service-area

**Status:** 3 service files fully read line-by-line, ~1,957 lines covered.

## Files fully read (3 files, 1,957 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/compliance.service.ts | 678 |
| packages/api/src/services/vat-report.service.ts | 645 |
| packages/api/src/services/service-area.service.ts | 634 |

## NEW CRITICAL findings (1)

### CRIT-N06 — VAT report PDF includes placeholder TIN + address (BIR non-compliance, same family as CRIT-N03)

**Where found:** packages/api/src/services/vat-report.service.ts:227-230

```ts
doc.fontSize(9).text('OnService Platform Inc.');
doc.text('TIN: 000-000-000-000');
doc.text('Address: [Placeholder] Makati City, Metro Manila, Philippines');
doc.text('VAT-Registered Taxpayer');
```

The monthly VAT report PDF (BIR Form 2550M-equivalent) is generated via cron and stored to S3 with the platform's TIN as `000-000-000-000` and address as `[Placeholder]`. This is the same compliance failure family as CRIT-N03 (OR + BIR 2307) — the platform's BIR-required identifiers are hardcoded placeholders.

**Impact:** Launch-blocking BIR compliance. The accountant cannot file BIR Form 2550M from this PDF without manual edits, and the monthly batch produces invalid filings if not human-reviewed.

**Fix:** Read TIN, registered address, and VAT registration status from `platform_settings` (or a new `bir_filer_info` settings group). Add admin UI for BIR identity. Validate at module load that all values are non-placeholder before allowing report generation. Same fix pattern as CRIT-N03 — share a `getBirFilerIdentity()` helper across or.service.ts, bir-2307.service.ts, vat-report.service.ts.

## NEW MEDIUM findings (10)

### MED-N42 — compliance recordConsent has race condition between revoke + insert

**Where:** packages/api/src/services/compliance.service.ts:226-260

```ts
if (!input.granted) {
  try {
    await db.query(`UPDATE consent_records SET revoked_at = NOW() WHERE ...`);
  } catch (...) { logger.warn(...); }
}
const result = await db.query<ConsentRow>(`INSERT INTO consent_records ...`);
```

If the UPDATE succeeds but the INSERT fails, prior consent rows are revoked but the new "revocation" event is never recorded. User has no current consent record, no audit trail for the revocation. Should be wrapped in `db.transaction(...)`.

**Fix:** Wrap revoke + insert in single transaction.

### MED-N43 — compliance updateDsrStatus sets completed_at on rejected too

**Where:** compliance.service.ts:459-461

```ts
if (TERMINAL_STATUSES.has(input.newStatus)) {
  sets.push('completed_at = NOW()');
}
```

A DSR that's rejected gets `completed_at` set, conflating "completed" and "rejected" in DSR reporting. NPC compliance reports may need separate columns for "responded by" vs "completed by".

**Fix:** Either rename `completed_at` to `closed_at`, or add a separate `rejected_at` column.

### MED-N44 — compliance exportAuditLogCsv lacks PII masking

**Where:** compliance.service.ts:506-571

```ts
SELECT al.id, al.created_at, u.email AS user_email, ... al.ip_address::text ...
```

CSV export returns raw `email` and `ip_address` for all rows. This is a second site of the CRIT-N02 family (admin.routes.ts:/admin/audit-log returns raw PII). Audit log download from admin should be role-gated (super_admin / dpo only) AND masked for non-DPO admins per pii-mask.ts.

**Fix:** Apply pii-mask.ts at export time. Pass actor role from caller, mask email + ip_address according to role.

### MED-N45 — compliance exportAuditLogCsv builds whole CSV in memory

**Where:** compliance.service.ts:553-570

```ts
const lines: string[] = [CSV_HEADER];
for (const r of result.rows) { lines.push([...].join(',')); }
return lines.join('\r\n');
```

50,000-row export with old/new JSONB values can easily run to 100MB+ in memory. Should use Node `Readable` stream + `res.write` chunking pattern. Also no Content-Length headers in route layer (would need to verify in routes/admin.routes.ts).

**Fix:** Convert to streaming via `pg-cursor` or a generator function returning rows in chunks.

### MED-N46 — vat-report generateMonthlyVatReport SELECT-then-INSERT race

**Where:** vat-report.service.ts:311-360

The check for `existingRow.finalized_at !== null` (line 318) reads, then upserts (line 345). Between SELECT and INSERT, another concurrent caller could finalize. The INSERT's ON CONFLICT updates the row even if it's now finalized. Defensive pattern would be `... ON CONFLICT ... WHERE finalized_at IS NULL` or pre-acquire row lock.

**Fix:** Add `FOR UPDATE` to the existing-check SELECT (and run the SELECT inside a transaction with the INSERT), OR add `WHERE finalized_at IS NULL` clause to the ON CONFLICT DO UPDATE.

### MED-N47 — vat-report regenerate sets pdf_url = NULL during regen window

**Where:** vat-report.service.ts:351-358

```ts
ON CONFLICT (period_year, period_month) DO UPDATE
  SET ... pdf_url = NULL
```

During regeneration, the row briefly has NULL pdf_url between the upsert (line 345) and PDF re-upload (line 372). If listVatReports is called in this window (or PDF upload fails), the report appears as having no PDF. UX issue + ops confusion.

**Fix:** Either keep the old `pdf_url` until the new PDF uploads successfully, or add a `pdf_status` column ('regenerating' | 'ready' | 'failed').

### MED-N48 — service-area createServiceArea NOT in a transaction (no audit row)

**Where:** packages/api/src/services/service-area.service.ts:117-147

`createServiceArea` writes to `service_areas` and never records an `admin_actions` audit row. Missing audit pattern — every other admin-mutation service in the codebase writes paired audit rows. Phase 14 D06 transactional discipline is incomplete here.

**Fix:** Wrap in `db.transaction` and add admin_actions INSERT. Take adminUserId as required parameter. (admin.routes.ts already gates this with requireSuperAdmin per CRIT-N01 family — but admin_actions row is missing.)

### MED-N49 — service-area generateSlug fallback uses Math.random()

**Where:** service-area.service.ts:94-97

```ts
const fallback = Math.random().toString(36).substring(2, 10);
return `area-${fallback}`;
```

Pseudo-random not cryptographically random. Predictable. If two areas with non-ASCII names are created near simultaneously, collision risk. UNIQUE constraint on slug would fail with raw DB error.

**Fix:** Use `crypto.randomBytes(4).toString('hex')` or similar. Better: enforce `name` to produce a non-empty slug at the validation layer.

### MED-N50 — service-area checkCoverage scales O(N areas) in JS

**Where:** service-area.service.ts:304-343

For each coverage check, all active areas are loaded into memory and Haversine'd one by one. With 50+ areas (post-launch nationwide) this is fine, but with 500+ it's a noticeable per-request hit. PostGIS spatial index would handle this in DB.

**Fix (optional / future-proofing):** Add PostGIS extension + GiST index on `service_areas.center_geom` and use `ST_DWithin`. Acceptable as-is for Boracay launch.

### MED-N51 — service-area joinWaitlist ON CONFLICT key (phone, city) treats moves as duplicates

**Where:** service-area.service.ts:367

```ts
ON CONFLICT (phone, city) DO UPDATE SET ...
```

If the same phone signs up for waitlist in city A and later city B, both rows persist (different cities). If they re-sign for city A, the row updates. But if cities share names (e.g., "San Pedro" exists in Laguna AND Mindanao), the conflict misfires. Should also include `province` in the unique key.

**Fix:** Migration to add `province` to the unique constraint, or compare (phone, city, province) tuple in application code.

## POSITIVE findings

1. **Compliance state machine is correct** — `ALLOWED_TRANSITIONS` (lines 103-108) correctly enforces received → in_progress → completed/rejected with terminal states.
2. **DSR due-date math is correct** — INTERVAL '15 days' set at insert, dueAt comparison uses date diff, `isOverdue` flag honors terminal states.
3. **VAT month window is correctly Asia/Manila** (lines 130-142) — UTC offsets handled, isFutureMonth uses Manila wall time.
4. **VAT report finalized rows are locked** — finalize() uses `WHERE finalized_at IS NULL` race-safe update (line 477-484).
5. **service-area haversine** is correct (line 102-115) — earth radius 6371km, proper formula.
6. **Bug 1271 native fetch verified** in all 3 files (no axios).

## Confirmations

- **CRIT-N03 BIR placeholder identity** family extended with VAT report (CRIT-N06).
- **Phase 11 audit_log fail-silent pattern** confirmed at compliance.service.ts and vat-report.service.ts — both use try/catch + logger.warn for audit writes.
- **service-area getActiveServiceAreas** uses correct status filter (active + soft_launch). Matches checkCoverage. Bug 1170/1198 cancellation policy pattern (server canonical) implicitly applied since coverage is server-checked.

## Cumulative running totals (after Phase N Batch 13)

| | Total | Batch 13 additions |
|---|---:|---:|
| **CRITICAL** | **180 + 1 = 181 real** (1 invalidated of 182) | **+1** |
| **MEDIUM** | **525 + 10 = 535** | **+10** |
| Lines fully read | ~117,821 / 146,236 | +1,957 |
| Coverage | **80.6%** | +1.4% |

## Files NOT YET READ — remaining (~85 files, ~23,500 lines)

Top priority for Batch 14:
- data-management.service.ts (557) + notification.service.ts (551) + security.service.ts (524) — admin/ops trio
- admin.service.ts (520) + breach-log.service.ts + bir-admin.service.ts
- booking.service.ts (1197) — needs full re-read (Phase B partial)
- auth.routes.ts (977) + booking.routes.ts (1025) + provider.routes.ts (735)
