# Phase 08 — Pre-Mortem

Six plausible incident scenarios for the Financial dashboard rebuild +
BIR compliance services in production.

## 1. OR sequence collision under concurrent escrow releases

**Scenario:** Two booking releases finalise at the same millisecond.
Both `escrow.service.releaseEscrow` calls commit their wallet
transactions and then call `orService.issueOR`. Each call enters its
own `db.transaction` and races to reserve the next OR sequence number
for the current Asia/Manila month. Without a serialising primitive,
both could read the same `last_sequence`, both increment, both
INSERT — producing two ORs with the same `or_number` (which would
violate BIR's gap-free, monotonic-per-month requirement and the
`official_receipts.or_number UNIQUE` constraint).

**Detection:** Postgres rejects the second INSERT with a `23505`
unique-violation on `or_number`; the second `issueOR` throws and is
caught by the escrow.service try/catch, logged at error level. The
booking that lost the race receives no OR until a backfill cron is
run.

**Mitigation now:** The `or_sequences` UPSERT
(`INSERT ... ON CONFLICT (year, month) DO UPDATE SET last_sequence =
or_sequences.last_sequence + 1 RETURNING last_sequence`) runs INSIDE
the same `db.transaction` as the `official_receipts` INSERT. Postgres
serialises the conflicting writers on the row lock taken by `ON
CONFLICT DO UPDATE`, so each caller observes a strictly-incremented
sequence. Plus `issueOR` is idempotent on `booking_id` — the existing-
OR short-circuit at the top of the function eliminates retries
producing duplicates.

**Future hardening:** wrap the per-month UPSERT in a SAVEPOINT so the
caller can detect-and-retry on serialisation failure rather than
abort the whole transaction, allowing batch backfills to drain
faster.

## 2. BIR 2307 double-issuance in the same quarter

**Scenario:** Two super-admins click "Generate Q2 2026" within
seconds of each other, or the cron and a manual click overlap. Each
caller iterates the same provider list and tries to insert a batch
row for `(provider_id, tax_year, tax_quarter)`. Without protection,
both batches would be written and the BIR would receive two
certificates for the same provider+quarter — a compliance violation.

**Detection:** the second writer would silently produce duplicate
rows; without a UNIQUE constraint the only after-the-fact detection
would be a daily reconciliation query
(`SELECT provider_id, tax_year, tax_quarter, COUNT(*) FROM
bir_2307_batches GROUP BY 1,2,3 HAVING COUNT(*)>1`).

**Mitigation now:** migration 055 declares
`UNIQUE(provider_id, tax_year, tax_quarter)` on `bir_2307_batches`,
and `generateQuarterly2307Batches` writes via
`INSERT ... ON CONFLICT (provider_id, tax_year, tax_quarter) DO
NOTHING RETURNING ...` — the second writer's INSERT returns no row
and increments `batchesSkipped`. `regenerate2307ForProvider`
explicitly opts in to the same UNIQUE key with `DO UPDATE` so admin-
forced regeneration is the only path that overwrites.

**Future hardening:** add a per-quarter advisory lock
(`pg_advisory_xact_lock(hashtext('2307:'||year||':'||quarter))`) at
the start of `generateQuarterly2307Batches` so only one full pass
runs at a time, eliminating the wasted SELECT/INSERT cycles entirely.

## 3. VAT report regenerated after finalization

**Scenario:** Accounting team finalizes the May 2026 VAT report
(record locked, BIR submission filed). A super-admin later clicks
"Generate" again on the same row — perhaps to refresh a PDF — and
the regenerated row would clobber the official numbers that BIR
already received.

**Detection:** the discrepancy would surface only when the BIR copy
is compared against the platform copy at audit time — too late.

**Mitigation now:**
- `generateMonthlyVatReport` SELECTs the existing row first; if
  `finalized_at IS NOT NULL` it throws `409 'VAT report for YYYY-MM
  is finalized; cannot regenerate.'` before any UPSERT runs.
- `finalizeVatReport` itself uses a race-safe UPDATE (`WHERE
  finalized_at IS NULL`) so the second of two concurrent finalize
  calls also returns 409 — no silent overwrite.
- Audit row `vat_report_finalized` records the finalising admin and
  the locked totals, so any subsequent unauthorised attempt is
  loudly visible in the audit log.

**Future hardening:** add a column-level CHECK or trigger that
prevents UPDATEs to `total_gross_sales/output_vat/vat_payable` once
`finalized_at IS NOT NULL`, even from raw SQL.

## 4. Reconciliation false-positive alert during PayMongo API outage

**Scenario:** A future cron implementation calls PayMongo's `/v1/balances`
endpoint to obtain `paymongoBalance` and the call times out / 5xx's.
A naive caller might pass `0` or `NaN`, and `runDailyReconciliation`
would compute a multi-million-peso "discrepancy", flip
`discrepancy_alert_sent=true`, log at error level, and wake the
on-call engineer at 03:00 even though nothing is actually wrong.

**Detection:** the error log payload includes `paymongoBalance` and
`expectedTotal`; an alerted snapshot with `paymongoBalance: 0` and
`expectedTotal: <millions>` is the unmistakable fingerprint.

**Mitigation now:** when `paymongoBalance === null` (or omitted),
`runDailyReconciliation` sets `discrepancy = 0` and prepends the
fixed note `'PayMongo balance unavailable; expected_total only'` to
the snapshot — **no alert is fired**. Validation also rejects
non-integer values up-front (`400 'paymongoBalance must be an integer
(centavos) or null.'`), preventing `NaN` from ever reaching the
discrepancy math. The future cron MUST pass `null` (not `0`) on API
failure — documented in future-bugs.

**Future hardening:** when the real PayMongo client lands, wrap its
fetch in `try/catch` and explicitly pass `null` on any failure (HTTP
≥ 400, parse error, timeout). Add a separate "stale balance" alert
class that fires only after N consecutive null days.

## 5. pdfkit failure breaking escrow release

**Scenario:** A future pdfkit upgrade introduces a regression that
throws for certain unicode customer names (or the bundled font file
goes missing in a Docker rebuild). Without isolation, the throw
inside `buildOrPdf` would propagate up through `issueOR` and back
into `escrow.service.releaseEscrow`, causing the escrow release
endpoint to 500 — money already credited to the provider's wallet,
but the API returned an error and the caller might retry the entire
release.

**Detection:** error log messages
`'OR PDF generation failed (OR row already persisted)'` followed by
`'OR issuance failed after escrow release (audit-only side effect)'`
spike in the dashboard. Booking has `escrow_status='released'` but
no `pdf_url` on its OR row.

**Mitigation now:** **two layers of try/catch**:
1. Inside `issueOR`, the `buildOrPdf` + `uploadPdf` block is wrapped
   so a PDF failure logs at error level but the OR row stays
   committed (PDF can be regenerated later from stored data).
2. Inside `escrow.service.releaseEscrow`, the entire `orService.issueOR`
   call is wrapped in try/catch with a logger.error and explicit
   comment `OR issuance failed after escrow release (audit-only side
   effect)` — money math is already committed and CANNOT roll back.

**Future hardening:** add a backfill cron
(`SELECT id FROM official_receipts WHERE pdf_url IS NULL ORDER BY
issued_at ASC LIMIT 100`) that retries PDF generation +
upload for any row that ended up with `pdf_url=NULL`.

## 6. admin_actions schema constraint failure breaking BIR batch row

**Scenario:** A future contributor renames the literal
`'bir_2307_batch_generated'` → `'bir2307_batch_generated'` in
`bir-2307.service.ts` but forgets to update migration 055's CHECK
list. Local tests pass (db is mocked). On production, the first
quarterly generate call would attempt to insert each batch row's
audit entry and Postgres would throw `23514` on
`admin_actions_action_type_check`. Without isolation, the entire
batch generation rolls back — the carefully-computed quarterly
withholding totals lost — and on the retry the SAME failure recurs.

**Detection:** the audit insert throws inside the `try { ... } catch`
in `writeBatchAuditRow`, logged at warn level with the rejected
literal in the error message. The batch row itself is preserved
(see mitigation), so production stays green.

**Mitigation now:** every Phase-08 audit-row INSERT (in `or.service`,
`bir-2307.service`, `vat-report.service`, `reconciliation.service`)
is wrapped in `try { ... } catch (err) { logger.warn(...); }` —
audit failures NEVER roll back the data row. The data row is the
authoritative artifact; the audit is best-effort. This pattern
mirrors the literal-vs-parameter rationale documented in Phase 07's
HONESTY-CHECK: literals make the constraint dependency obvious at
every call site, and the try/catch contains the blast radius when a
contributor forgets to extend the CHECK list.

**Future hardening:** generate the CHECK-allowed literal union at
build time from a TypeScript const (e.g., a `const ACTION_TYPES`
shared with the migration generator) so renaming the literal in TS
fails the typecheck before it can fail at runtime.
