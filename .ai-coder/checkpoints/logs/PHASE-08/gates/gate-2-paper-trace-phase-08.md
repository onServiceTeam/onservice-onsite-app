# Phase 08 — Paper Trace

End-to-end traces for each new runtime path delivered in Phase 08
(Financial dashboard rebuild + BIR compliance: sequential OR, BIR 2307
quarterly batches, monthly VAT 2550M-equivalent, daily reconciliation).
Sacred-money endpoints DELEGATE: this phase's services audit and record
BIR-required artifacts; they do NOT mutate wallets. The single money-
adjacent change is `escrow.service.releaseEscrow` calling `issueOR`
AFTER its own transaction commits, in a try/catch that cannot roll back
money math.

## 1. Issue OR (called automatically from escrow release) — `issueOR`

```
[escrow.service.releaseEscrow] (packages/api/src/services/escrow.service.ts:181)
   ─── escrow tx COMMIT (wallets + escrow_status flipped) ───
   ↓ try {
   ↓   await orService.issueOR({ bookingId, commissionAmount,
   ↓                              serviceFeeAmount, providerReceived,
   ↓                              platformRetained })
[or.service.issueOR]              (or.service.ts:330)
   ↓ validate bookingId; coerce 4 centavo inputs to non-negative ints
       → 400 'bookingId is required.' / '<name> must be a non-negative integer (centavos).'
   ↓ SELECT * FROM official_receipts
       WHERE booking_id=$1 AND is_cancellation=FALSE LIMIT 1
       → if row exists: log 'OR already issued' and RETURN existing  (idempotent)
   ↓ SELECT b.*, cu.first_name, p.business_name
       FROM bookings b LEFT JOIN users cu LEFT JOIN providers p
       WHERE b.id=$1
       → 404 'Booking not found.'
       → 409 'OR can only be issued for released bookings.' if escrow_status<>'released'
       → 400 'Invalid booking gross amount.' if gross<=0
   ↓ vat = round(gross * 12 / 112); net = gross - vat   (VAT-inclusive)
   ↓ db.transaction:
       INSERT INTO or_sequences (year, month, last_sequence) VALUES (...,1)
         ON CONFLICT (year, month) DO UPDATE
           SET last_sequence = or_sequences.last_sequence + 1
         RETURNING last_sequence                        (sequence reserved)
       INSERT INTO official_receipts (or_number, booking_id, ...,
         gross_amount, vat_amount, net_amount, ..., is_cancellation=FALSE)
         RETURNING *                                    (CHECK gross=net+vat enforced)
   ↓ try buildOrPdf(...) → uploadPdf(orNumber, pdf)
       (PDF best-effort, OUTSIDE the tx; failure logged at error and OR row stays)
   ↓ if AWS_S3_BUCKET + AWS_REGION set: log 'OR PDF upload (stub)' and return canonical
       https://<bucket>.s3.<region>.amazonaws.com/receipts/<orNumber>.pdf
       else: log 'Skipping OR PDF upload' and return null
   ↓ if pdfUrl: UPDATE official_receipts SET pdf_url=$1 WHERE id=$2 RETURNING *
   ↓ try INSERT INTO admin_actions
        (admin_id, action_type, target_type, target_id, details, reason)
        VALUES (NULL, 'or_issued', 'official_receipt', $1, $2::jsonb, 'auto-issued on escrow release')
        (admin_id is NULL — system-issued; widened in migration 055)
        (catch → logger.warn 'Failed to write admin_actions row for OR issuance')
[escrow]
   ↓ } catch (orErr) {
   ↓   logger.error 'OR issuance failed after escrow release (audit-only side effect)'
   ↓ }                                                  ← MONEY CANNOT ROLL BACK
```
**Money side-effect:** NO (in this service). Wallet credit + retain
split happened in escrow.service.ts BEFORE `issueOR` ran.
**Audit row:** `or_issued` (system-issued, admin_id=NULL).

```
              dotted line back to escrow.service:
   ┌────────────────────────────────────────────────────────────────┐
   │ escrow.service.releaseEscrow():                                │
   │   await db.transaction(async (client) => { ...wallet writes... }) │
   │   ── COMMIT ──                                                 │
   │   try { await orService.issueOR(...) }   ← outside tx          │
   │   catch (orErr) { logger.error(...); }   ← swallows; no throw  │
   └────────────────────────────────────────────────────────────────┘
   The OR call is NOT inside the wallet transaction. Any failure here
   (pdfkit crash, S3 misconfig, 23514 CHECK violation, etc.) cannot
   undo the wallet/escrow ledger writes that already committed.
```

## 2. Cancel OR (POST /api/v1/admin/financials/receipts/:id/cancel) — `cancelOR`

```
[super-admin] FinancialsPage Receipts tab → "Cancel OR"
[express] auth.middleware → authMiddleware
[route] financial-admin.routes.ts:188 requireSuperAdmin
   ↓ require body.reason → 400 'reason is required.'
   ↓ orService.cancelOR(orId, reason, req.user.userId)
[service] or.service.ts:527
   ↓ validate orId, cancelledBy → 400
   ↓ trim reason; len ∈ [5, 500] else 400 'reason must be between 5 and 500 characters.'
   ↓ db.transaction:
       SELECT * FROM official_receipts WHERE id=$1 FOR UPDATE
         → 404 'Official receipt not found.'
         → 409 'Cannot cancel a cancellation OR.' (if is_cancellation)
         → 409 'Official receipt is already cancelled.' (if cancelled_at)
       UPDATE official_receipts
         SET cancelled_at=$1, cancellation_reason=$2, cancelled_by=$3
         WHERE id=$4 RETURNING *
       (generateOrNumber inside same tx → atomic next sequence)
       INSERT INTO official_receipts (
         or_number, booking_id, customer_id, provider_id, issued_at,
         gross_amount=-orig.gross, vat_amount=-orig.vat, net_amount=-orig.net,
         ..., is_cancellation=TRUE, cancels_or_id=orig.id, cancelled_at, ...)
         RETURNING *
       (CHECK or_money_consistent still holds because all 3 are negated)
   ↓ try INSERT INTO admin_actions
        VALUES ($1, 'or_cancelled', 'official_receipt', $2, $3::jsonb, $4)
        (catch → logger.warn; cancellation NOT rolled back)
[response] 201 { success: true, data: { original, cancellation } }
```
**Money side-effect:** NO. The cancellation OR has negative amounts
but no wallet write. **Audit row:** `or_cancelled`.

## 3. Generate quarterly BIR 2307 batches (POST /api/v1/admin/bir/2307/quarter/:year/:quarter/generate) — `generateQuarterly2307Batches`

```
[super-admin] FinancialsPage BIR tab → "Generate Q<n> <year>"
[route] bir-admin.routes.ts:184 requireSuperAdmin
   ↓ parseIntParam(year) + parseQuarter(quarter)
   ↓ bir2307Service.generateQuarterly2307Batches(year, quarter)
[service] bir-2307.service.ts:540
   ↓ assertYearQuarter(year, quarter)
       → 400 'tax year must be …' / 'tax quarter must be 1, 2, 3, or 4.'
   ↓ {startUtc, endUtc} = quarterWindow(year, quarter)   (Asia/Manila +08:00 calendar)
   ↓ ytd = ytdWindowThroughQuarter(year, quarter)
   ↓ aggregateQuarterlyIncome(startUtc, endUtc):
       SELECT provider_id, SUM(provider_received)::text
         FROM official_receipts
        WHERE is_cancellation=FALSE AND issued_at>=$1 AND issued_at<$2
        GROUP BY provider_id                            (1 query)
   ↓ for each provider crossing P500,000 YTD threshold:
       SELECT 1 FROM bir_2307_batches WHERE provider_id=$1 AND tax_year=$2 AND tax_quarter=$3
         → if exists: batchesSkipped++
       INSERT INTO bir_2307_batches
         (provider_id, tax_year, tax_quarter, gross_income, withholding_rate, withheld_amount)
         VALUES ($1, $2, $3, $4, 0.01, $6)
         ON CONFLICT (provider_id, tax_year, tax_quarter) DO NOTHING
         RETURNING ...
       attachPdfToBatch(...) → uploadPdf (stubbed; null when AWS env vars unset)
       writeBatchAuditRow(NULL, batch, reason, 'bir_2307_batch_generated')
         INSERT INTO admin_actions (admin_id=NULL, action_type='bir_2307_batch_generated',
           target_type='bir_2307_batch', target_id, details::jsonb, reason)
         (try/catch → logger.warn on failure; batch row stays)
[response] 201 { success, data: QuarterlyBatchResult { batchesCreated, batchesSkipped,
                  totalProvidersProcessed, totalGrossIncome, totalWithheld } }
```
**Money side-effect:** NO. Read-only against `official_receipts`;
append-only to `bir_2307_batches` + `admin_actions`.

## 4. Regenerate BIR 2307 for one provider (POST /api/v1/admin/bir/2307/provider/:id/regenerate) — `regenerate2307ForProvider`

```
[super-admin] BIR tab → provider row → "Regenerate"
[route] bir-admin.routes.ts:198 requireSuperAdmin
   ↓ require body.year + body.quarter (400 'year required' / 'quarter required')
   ↓ bir2307Service.regenerate2307ForProvider(providerId, year, quarter, req.user.userId)
[service] bir-2307.service.ts:660
   ↓ validate providerId, adminUserId, year/quarter
   ↓ SELECT SUM(provider_received) FROM official_receipts WHERE provider_id=$1
       AND is_cancellation=FALSE AND issued_at >= $2 AND issued_at < $3   (quarter window)
       → 409 'Provider has no income for that quarter — cannot generate empty batch.'
   ↓ SELECT SUM(provider_received) FROM official_receipts ... (ytd window)
   ↓ computeWithholding(quarterly, ytd)
       → 409 'Provider has not crossed the BIR 2307 withholding threshold for this quarter.'
   ↓ db.transaction:
       INSERT INTO bir_2307_batches (...) VALUES (...)
         ON CONFLICT (provider_id, tax_year, tax_quarter) DO UPDATE
           SET gross_income=EXCLUDED..., withholding_rate=EXCLUDED...,
               withheld_amount=EXCLUDED..., pdf_url=NULL, issued_at=NOW()
         RETURNING ...
   ↓ loadProviderInfo([providerId])
       → 404 'Provider not found.'
   ↓ attachPdfToBatch(batch, providerForPdf)
   ↓ writeBatchAuditRow(adminUserId, batch, reason, 'bir_2307_regenerated')
[response] 201 { success, data: Bir2307Batch }
```
**Money side-effect:** NO. **Audit row:** `bir_2307_regenerated`
(admin_id=adminUserId).

## 5. Generate monthly VAT report (POST /api/v1/admin/bir/vat/reports/:year/:month/generate) — `generateMonthlyVatReport`

```
[super-admin] BIR tab → "Generate VAT for YYYY-MM"
[route] bir-admin.routes.ts:96 requireSuperAdmin
   ↓ parseIntParam(year) + parseMonth(month)
   ↓ vatReportService.generateMonthlyVatReport(year, month, req.user.userId)
[service] vat-report.service.ts:312
   ↓ validateYearMonth(year, month)
       → 400 'year must be …' / 'month must be an integer between 1 and 12.'
   ↓ if isFutureMonth(year, month) → 400 'Cannot generate VAT report for future periods'
   ↓ SELECT … FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2
       → if existing.finalized_at IS NOT NULL → 409
         'VAT report for YYYY-MM is finalized; cannot regenerate.'
   ↓ {startIso, endIso} = monthWindow(year, month)   (Asia/Manila wall month)
   ↓ SELECT SUM(gross_amount)::text, SUM(vat_amount)::text, COUNT(*)::text
       FROM official_receipts
       WHERE is_cancellation=FALSE
         AND issued_at >= $1::timestamptz AND issued_at < $2::timestamptz
   ↓ inputVat = 0  (marketplace baseline — accountant overlays before submission)
       vatPayable = outputVat - inputVat
   ↓ INSERT INTO vat_monthly_reports (...) VALUES (...)
       ON CONFLICT (period_year, period_month) DO UPDATE
         SET total_gross_sales=EXCLUDED..., output_vat=EXCLUDED..., input_vat=EXCLUDED...,
             vat_payable=EXCLUDED..., or_count=EXCLUDED..., generated_at=NOW(), pdf_url=NULL
       RETURNING ...
       → 500 'Failed to upsert VAT monthly report.' if no row
   ↓ try buildVatPdf(report) → uploadPdf(year, month, pdf)   (best-effort, outside tx)
       → if pdfUrl: UPDATE vat_monthly_reports SET pdf_url=$1 WHERE id=$2
   ↓ try INSERT INTO admin_actions
        VALUES ($1, 'vat_report_generated', 'vat_report', $2, $3, $4::jsonb)
        (admin_id = adminUserId or NULL when cron-invoked)
        (catch → logger.warn; report row stays)
[response] 201 { success, data: VatMonthlyReport }
```
**Money side-effect:** NO. **Audit row:** `vat_report_generated`.

## 6. Finalize VAT report (POST /api/v1/admin/bir/vat/reports/:year/:month/finalize) — `finalizeVatReport`

```
[super-admin] BIR tab → "Finalize"
[route] bir-admin.routes.ts:115 requireSuperAdmin
   ↓ vatReportService.finalizeVatReport(year, month, req.user.userId)
[service] vat-report.service.ts:457
   ↓ validateYearMonth + require adminUserId → 400
   ↓ SELECT … FROM vat_monthly_reports WHERE period_year=$1 AND period_month=$2
       → 404 'VAT report for YYYY-MM not found; generate it first.'
       → 409 'VAT report for YYYY-MM is already finalized.' (if finalized_at IS NOT NULL)
   ↓ UPDATE vat_monthly_reports
        SET finalized_at = NOW(), finalized_by = $1
        WHERE id = $2 AND finalized_at IS NULL                ← race-safe guard
        RETURNING ...
       → 409 'VAT report for YYYY-MM is already finalized.' (lost the race)
   ↓ try INSERT INTO admin_actions
        VALUES ($1, 'vat_report_finalized', 'vat_report', $2, ...)
        (catch → logger.warn)
[response] 200 { success, data: VatMonthlyReport (finalized_at set) }
```
**Money side-effect:** NO. **Audit row:** `vat_report_finalized`.
Once finalized the row is locked: subsequent `generateMonthlyVatReport`
calls return 409 above.

## 7. Run daily reconciliation (POST /api/v1/admin/bir/reconciliation/run) — `runDailyReconciliation`

```
[super-admin] BIR Recon tab → "Run reconciliation"
[route] bir-admin.routes.ts:264 requireSuperAdmin
   ↓ body { snapshotDate?, paymongoBalance?, notes? }
   ↓ reconciliationService.runDailyReconciliation({...})
[service] reconciliation.service.ts:178
   ↓ snapshotDate = input?.snapshotDate ?? todayInManila()    (en-CA / Asia/Manila)
   ↓ validateSnapshotDate → 400 'snapshotDate must be in YYYY-MM-DD format.'
                          / 'snapshotDate cannot be in the future.'
   ↓ paymongoBalance INPUT — if null, discrepancy=0 + note 'PayMongo balance unavailable;
     expected_total only'  (NO API call this phase)
   ↓ SELECT id FROM reconciliation_snapshots WHERE snapshot_date=$1
       → 409 'Reconciliation snapshot already exists for YYYY-MM-DD.'
   ↓ SELECT type, SUM(available_balance + pending_balance)::text
       FROM wallets
       WHERE user_id IS NULL
         AND type IN ('platform_escrow','platform_revenue','guarantee_fund')
       GROUP BY type
   ↓ SELECT SUM(available_balance + pending_balance) FROM wallets WHERE user_id IS NOT NULL
   ↓ expectedTotal = escrow + revenue + guarantee + sumOfUserWallets
   ↓ if paymongoBalance != null:
       discrepancy = paymongoBalance - expectedTotal
       if |discrepancy| > 10_000 (₱100): alertSent=true, logger.error(...)
   ↓ INSERT INTO reconciliation_snapshots (...) VALUES (...) RETURNING *
       → 500 'Failed to insert reconciliation snapshot.'
   ↓ insertAuditRow({ adminId, actionType: 'reconciliation_run',
                      targetId, details, reason })
       (writes admin_actions; try/catch inside helper)
[response] 201 { success, data: ReconciliationSnapshot }
```
**Money side-effect:** NO. Read-only against `wallets`; append-only to
`reconciliation_snapshots` + `admin_actions`. **Audit row:**
`reconciliation_run`.

## 8. Acknowledge reconciliation alert (POST /api/v1/admin/bir/reconciliation/:id/acknowledge) — `acknowledgeDiscrepancy`

```
[super-admin] BIR Recon tab → alerted snapshot row → "Acknowledge"
[route] bir-admin.routes.ts:291 requireSuperAdmin
   ↓ require body.note → 400 'note required'
   ↓ reconciliationService.acknowledgeDiscrepancy(id, note, req.user.userId)
[service] reconciliation.service.ts:340
   ↓ trim note; len ∈ [5, 1000] → else 400
   ↓ require adminUserId → 400
   ↓ db.transaction:
       SELECT * FROM reconciliation_snapshots WHERE id=$1 FOR UPDATE
         → 404 'Reconciliation snapshot not found.'
         → 409 'Snapshot has no active discrepancy alert to acknowledge.'
       UPDATE reconciliation_snapshots
         SET discrepancy_alert_sent = FALSE, notes = $2 WHERE id=$1 RETURNING *
       → 500 'Failed to update reconciliation snapshot.' (no row)
   ↓ insertAuditRow({ actionType: 'reconciliation_alert_acknowledged', ... })
[response] 200 { success, data: ReconciliationSnapshot }
```
**Money side-effect:** NO. **Audit row:** `reconciliation_alert_acknowledged`.

## 9. Financial overview (GET /api/v1/admin/financials/overview)

```
[admin] FinancialsPage Overview tab → useQuery(['fin','overview',from,to])
[route] financial-admin.routes.ts:46 requireAdmin
   ↓ parseDateRange → from/to YYYY-MM-DD (400 if missing)
   ↓ financialAdminService.getFinancialOverview(from, to)
[service] financial-admin.service.ts:247
   ↓ assertDateRange(from, to)              (400 'Invalid date format.' / '"from" date …')
   ↓ Promise.all of aggregations:
       SELECT SUM(...) FROM bookings WHERE status IN
         ('completed_by_provider','confirmed','paid_out')
         AND completed_at >= $1 AND completed_at < $2 + 1 day  (single query / metric)
       SELECT … FROM wallets WHERE user_id IS NULL AND type='platform_revenue'
       (other metrics — see boundaries doc for full per-metric SQL)
[response] { success, data: FinancialOverview }
```
**Total queries:** 4–6 in parallel via `Promise.all`. No N+1.
**Audit row:** NO. **Money side-effect:** NO.

## 10. FinancialsPage tab fetch flow (frontend → all tabs)

```
[admin browser] /financials  →  apps/admin/src/App.tsx (lazy)
   ↓ FinancialsPage.tsx mounts; tab state in URL hash
   ↓ activeTab switches between:
       Overview         → GET /api/v1/admin/financials/overview?from&to
       Revenue          → /financials/revenue/by-{category,city,tier,payment}
       Escrow           → /financials/escrow
       Payouts          → /financials/payouts                    ← to_regclass-guarded
       Guarantee Fund   → /financials/guarantee-fund
       Reconciliation   → /financials/reconciliation/{recent,alerts}
                          + /bir/reconciliation/run (super-admin)
       BIR Reports      → /bir/overview, /bir/vat/reports,
                          /bir/2307/quarter/:year/:quarter
       Receipts         → /financials/receipts/search?orNumber&customerName&...
   ↓ each panel uses react-query useQuery with the tuple key above; failures
     surface inline; super-admin-only buttons gated by req.user.role check
     server-side (route layer) — UI shows the buttons but the API enforces.
```
**Total endpoints touched:** ~13 GETs + 6 POSTs across the 7 tabs.
None of the GETs write to the DB. Writes are explicitly listed in
traces 2–8 above.

## 11. List ORs by provider (GET /api/v1/admin/bir/2307/provider/:providerId / underlying read of OR table)

```
[admin] BIR provider drilldown
[route] bir-admin.routes.ts:159 requireAdmin
   ↓ bir2307Service.listBatchesForProvider(providerId, year?)
[service] bir-2307.service.ts:793
   ↓ require providerId → 400
   ↓ if year: validate 4-digit integer else 400
   ↓ SELECT <BATCH_SELECT> FROM bir_2307_batches b
       LEFT JOIN providers p ON p.id=b.provider_id
       WHERE b.provider_id=$1 [AND b.tax_year=$2]
       ORDER BY tax_year DESC, tax_quarter DESC                  (1 query)
[response] { success, data: Bir2307Batch[] }
```
**Money side-effect:** NO. **Audit row:** NO.

## 12. Receipts search (GET /api/v1/admin/financials/receipts/search) — `searchReceipts`

```
[admin] Receipts tab → debounced search box + filters
[route] financial-admin.routes.ts:155 requireAdmin
   ↓ pluck { orNumber, customerName, providerName, from, to, limit, offset }
   ↓ financialAdminService.searchReceipts({ ... })
[service] financial-admin.service.ts:960
   ↓ build dynamic WHERE with `clauses.push(...)` + parameter array
       (or_number ILIKE, customer name ILIKE on users, provider business_name ILIKE,
        issued_at >= from, issued_at <= to)
   ↓ Promise.all:
       SELECT … FROM official_receipts r
         LEFT JOIN users cu LEFT JOIN providers p
         <where>
         ORDER BY r.issued_at DESC LIMIT $N OFFSET $N+1
       SELECT COUNT(*)::text FROM official_receipts r
         LEFT JOIN ...                                         (same where, no limit)
[response] { success, data: { rows[], total } }
```
**Total queries:** 2 in parallel. No N+1. Read-only.
