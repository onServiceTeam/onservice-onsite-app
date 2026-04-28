# Phase 08 — Boundary Tests

Boundary behavior for every export across the 5 new services and 2 new
route files in Phase 08. ✓ = covered by a unit test in
`packages/api/__tests__/financial-bir-admin.test.ts` (58 tests, all
PASS first-run; project total **702/702**).

Money column legend:
- `NO`  = service performs no wallet/escrow/ledger writes.
- `YES (indirect, escrow→OR)` = invoked as a post-commit side-effect of
  `escrow.service.releaseEscrow`; this service still performs no money
  writes itself (records the BIR receipt artifact).

---

## File: packages/api/src/services/or.service.ts (809 lines, 8 exports)

| Export (file:line) | Signature / return type | Inputs validated | Error codes thrown | SQL writes (count + tables) | Money | Audit row (action_type literal) |
|---|---|---|---|---|---|---|
| `generateOrNumber` (or.service.ts:283) | `(client: TxClient, issuedAt?: Date) => Promise<string>` | none (internal helper; called inside caller's tx) | `500 'Failed to reserve OR sequence number.'` | 1 — `or_sequences` UPSERT (ON CONFLICT DO UPDATE last_sequence+=1) | NO | NO |
| `issueOR` (or.service.ts:330) | `(input: IssueOrInput) => Promise<OfficialReceipt>` | `bookingId` non-empty; 4 centavo fields finite, integer, ≥0 | `400 'bookingId is required.'`, `400 '<name> must be a non-negative integer (centavos).'`, `404 'Booking not found.'`, `409 'OR can only be issued for released bookings.'`, `400 'Invalid booking gross amount.'`, `500 'Failed to insert official receipt.'` | 2 in tx — `or_sequences` UPSERT + `official_receipts` INSERT; +1 best-effort `official_receipts` UPDATE pdf_url; +1 best-effort `admin_actions` INSERT | YES (indirect, escrow→OR) | `or_issued` (literal; admin_id=NULL) |
| `cancelOR` (or.service.ts:527) | `(orId, reason, cancelledBy) => Promise<{ original, cancellation }>` | `orId`, `cancelledBy` non-empty; reason trimmed length ∈ [5, 500] | `400 'orId is required.'`, `400 'cancelledBy is required.'`, `400 'reason must be between 5 and 500 characters.'`, `404 'Official receipt not found.'`, `409 'Cannot cancel a cancellation OR.'`, `409 'Official receipt is already cancelled.'`, `500 'Failed to mark OR cancelled.'`, `500 'Failed to insert cancellation OR.'` | 3 in tx — `official_receipts` UPDATE + `or_sequences` UPSERT + `official_receipts` INSERT (negated amounts); +1 best-effort `admin_actions` INSERT | NO | `or_cancelled` (literal) |
| `getOrById` (or.service.ts:661) | `(id) => Promise<OfficialReceipt \| null>` | `id` non-empty | `400 'id is required.'` | 0 (1 read) | NO | NO |
| `getOrByNumber` (or.service.ts:671) | `(orNumber) => Promise<OfficialReceipt \| null>` | `orNumber` non-empty | `400 'orNumber is required.'` | 0 (1 read) | NO | NO |
| `listOrsByCustomer` (or.service.ts:681) | `(customerId, limit=50, offset=0) => Promise<{rows, total}>` | `customerId`; limit clamp [1,200]; offset ≥0 | `400 'customerId is required.'` | 0 (2 reads in parallel) | NO | NO |
| `listOrsByProvider` (or.service.ts:710) | `(providerId, year?, quarter?) => Promise<OfficialReceipt[]>` | `providerId`; year 4-digit; quarter ∈ {1,2,3,4} | `400 'providerId is required.'`, `400 'year must be a 4-digit integer.'`, `400 'quarter must be 1, 2, 3 or 4.'` | 0 (1 read) | NO | NO |
| `searchOrs` (or.service.ts:747) | `(query) => Promise<{rows, total}>` | `from`/`to` parseable Dates if present; limit/offset clamp | `400 'from must be a valid ISO date.'`, `400 'to must be a valid ISO date.'` | 0 (2 reads in parallel) | NO | NO |

Cross-cutting:
- ✓ `issueOR` is **idempotent**: an existing non-cancellation OR for
  the same `booking_id` short-circuits and returns the prior row.
- ✓ VAT math is VAT-INCLUSIVE: `vat = round(gross*12/112); net = gross - vat;`
  the `or_money_consistent` CHECK in migration 055 guarantees gross =
  net + vat at the row level.
- ✓ Cancellation is append-only: a NEW row with negated amounts and
  `is_cancellation=TRUE` is inserted (BIR requires that issued OR
  numbers are never reused or removed). The cancellation OR shares
  the next-sequence number from the same `or_sequences` UPSERT.
- ✓ All `admin_actions` INSERTs use the SQL literal for
  `action_type`/`target_type` to bind the call site to the CHECK
  constraint defined in migration 055.

---

## File: packages/api/src/services/bir-2307.service.ts (856 lines, 6 exports)

| Export (file:line) | Signature / return type | Inputs validated | Error codes thrown | SQL writes (count + tables) | Money | Audit row |
|---|---|---|---|---|---|---|
| `quarterWindow` (bir-2307.service.ts:110) | `(year, quarter) => { startUtc, endUtc, startManila, endManila, ytdStartUtc }` | year ∈ [2024, 2100]; quarter ∈ {1..4} | `400 'tax year must be …'`, `400 'tax quarter must be 1, 2, 3, or 4.'` | 0 (pure) | NO | NO |
| `generateQuarterly2307Batches` (bir-2307.service.ts:538) | `(year, quarter) => Promise<QuarterlyBatchResult>` | year+quarter via assertYearQuarter | same as `quarterWindow`; `500 'Invalid tax_quarter in bir_2307_batches row.'` (defensive on stored row) | per provider above threshold: 1 `bir_2307_batches` INSERT (ON CONFLICT DO NOTHING); +1 best-effort `bir_2307_batches` UPDATE pdf_url; +1 best-effort `admin_actions` INSERT per batch | NO | `bir_2307_batch_generated` (admin_id=NULL system) |
| `regenerate2307ForProvider` (bir-2307.service.ts:660) | `(providerId, year, quarter, adminUserId) => Promise<Bir2307Batch>` | `providerId`, `adminUserId` non-empty; year+quarter | `400 'providerId is required.'`, `400 'adminUserId is required.'`, `409 'Provider has no income for that quarter — cannot generate empty batch.'`, `409 'Provider has not crossed the BIR 2307 withholding threshold for this quarter.'`, `500 'Failed to upsert BIR 2307 batch.'`, `404 'Provider not found.'` | 1 in tx — `bir_2307_batches` UPSERT (ON CONFLICT DO UPDATE); +1 best-effort UPDATE pdf_url; +1 best-effort `admin_actions` INSERT | NO | `bir_2307_regenerated` (admin_id=adminUserId) |
| `getBatchById` (bir-2307.service.ts:780) | `(id) => Promise<Bir2307Batch \| null>` | `id` non-empty | `400 'id is required.'` | 0 (1 read) | NO | NO |
| `listBatchesForProvider` (bir-2307.service.ts:793) | `(providerId, year?) => Promise<Bir2307Batch[]>` | `providerId`; year 4-digit | `400 'providerId is required.'`, `400 'year must be a 4-digit integer.'` | 0 (1 read) | NO | NO |
| `listBatchesForQuarter` (bir-2307.service.ts:825) | `(year, quarter, limit, offset) => Promise<Bir2307Batch[]>` | year+quarter via assertYearQuarter; limit/offset numeric | same as above | 0 (1 read) | NO | NO |

Cross-cutting:
- ✓ Threshold + rate constants: `WITHHOLDING_THRESHOLD_CENTAVOS =
  50_000_000` (₱500,000) and `WITHHOLDING_RATE = 0.01` (1%) — RR
  16-2023 baseline. Marked **REQUIRES ACCOUNTANT REVIEW** in
  HONESTY-CHECK before any live BIR submission.
- ✓ Idempotency on `(provider_id, tax_year, tax_quarter)` — UNIQUE
  constraint in migration 055 + the ON CONFLICT DO NOTHING / DO UPDATE
  clauses make double-generate races harmless.
- ✓ Asia/Manila quarter window computed via fixed +08:00 offset (no
  DST in PHT).

---

## File: packages/api/src/services/vat-report.service.ts (655 lines, 5 exports)

| Export (file:line) | Signature / return type | Inputs validated | Error codes thrown | SQL writes (count + tables) | Money | Audit row |
|---|---|---|---|---|---|---|
| `generateMonthlyVatReport` (vat-report.service.ts:312) | `(year, month, adminUserId?) => Promise<VatMonthlyReport>` | year, month 1..12, not future month | `400 'year must be …'`, `400 'month must be an integer between 1 and 12.'`, `400 'Cannot generate VAT report for future periods'`, `409 'VAT report for YYYY-MM is finalized; cannot regenerate.'`, `500 'Failed to upsert VAT monthly report.'` | 1 — `vat_monthly_reports` UPSERT (ON CONFLICT DO UPDATE pdf_url=NULL); +1 best-effort UPDATE pdf_url; +1 best-effort `admin_actions` INSERT | NO | `vat_report_generated` |
| `finalizeVatReport` (vat-report.service.ts:457) | `(year, month, adminUserId) => Promise<VatMonthlyReport>` | year+month; `adminUserId` non-empty | `400 'adminUserId is required.'`, `404 'VAT report for YYYY-MM not found; generate it first.'`, `409 'VAT report for YYYY-MM is already finalized.'` | 1 — `vat_monthly_reports` UPDATE (`WHERE finalized_at IS NULL` race-safe); +1 best-effort `admin_actions` INSERT | NO | `vat_report_finalized` |
| `getVatReport` (vat-report.service.ts:549) | `(year, month) => Promise<VatMonthlyReport \| null>` | year+month | as above | 0 (1 read) | NO | NO |
| `listVatReports` (vat-report.service.ts:564) | `(year?, limit?, offset?) => Promise<VatMonthlyReport[]>` | optional year; limit/offset numeric | none beyond input parse | 0 (1 read) | NO | NO |
| `getAnnualVatSummary` (vat-report.service.ts:613) | `(year) => Promise<VatAnnualSummary>` | year integer | none | 0 (1 read) | NO | NO |

Cross-cutting:
- ✓ Aggregation source: `official_receipts WHERE is_cancellation=FALSE`
  for the Asia/Manila wall month — cancellation ORs (negative-amount
  rows) are excluded so net liability is correct.
- ✓ `input_vat = 0` is hard-coded (marketplace assumption); accountant
  overlays before BIR submission.
- ✓ Finalize is race-safe: `UPDATE … WHERE finalized_at IS NULL` so
  the second of two concurrent finalize calls returns 409 instead of
  silently winning.

---

## File: packages/api/src/services/reconciliation.service.ts (477 lines, 6 exports + 1 const)

| Export (file:line) | Signature / return type | Inputs validated | Error codes thrown | SQL writes (count + tables) | Money | Audit row |
|---|---|---|---|---|---|---|
| `ALERT_THRESHOLD_CENTAVOS` (reconciliation.service.ts:53) | `const = 10_000` (₱100) | n/a | n/a | n/a | NO | n/a |
| `runDailyReconciliation` (reconciliation.service.ts:178) | `(input?: RunReconciliationInput) => Promise<ReconciliationSnapshot>` | snapshotDate YYYY-MM-DD, not future; `paymongoBalance` integer or null | `400 'snapshotDate must be in YYYY-MM-DD format.'`, `400 'snapshotDate cannot be in the future.'`, `400 'paymongoBalance must be an integer (centavos) or null.'`, `409 'Reconciliation snapshot already exists for YYYY-MM-DD.'`, `500 'Failed to insert reconciliation snapshot.'` | 1 — `reconciliation_snapshots` INSERT; +1 `admin_actions` INSERT (via insertAuditRow helper, try/catch) | NO | `reconciliation_run` |
| `acknowledgeDiscrepancy` (reconciliation.service.ts:340) | `(snapshotId, ackNote, adminUserId) => Promise<ReconciliationSnapshot>` | ackNote trimmed length ∈ [5, 1000]; `adminUserId` non-empty string | `400 'ackNote length must be between 5 and 1000 characters.'`, `400 'adminUserId is required.'`, `404 'Reconciliation snapshot not found.'`, `409 'Snapshot has no active discrepancy alert to acknowledge.'`, `500 'Failed to update reconciliation snapshot.'` | 1 in tx — `reconciliation_snapshots` UPDATE (FOR UPDATE lock); +1 `admin_actions` INSERT | NO | `reconciliation_alert_acknowledged` |
| `getSnapshotById` (reconciliation.service.ts:421) | `(id) => Promise<ReconciliationSnapshot \| null>` | `id` non-empty | (none — null on miss) | 0 (1 read) | NO | NO |
| `getSnapshotByDate` (reconciliation.service.ts:433) | `(date) => Promise<ReconciliationSnapshot \| null>` | YYYY-MM-DD | `400 'date must be in YYYY-MM-DD format.'` | 0 (1 read) | NO | NO |
| `listRecentSnapshots` (reconciliation.service.ts:448) | `(limit?) => Promise<ReconciliationSnapshot[]>` | limit clamped [1, 365] | none | 0 (1 read) | NO | NO |
| `listAlertedSnapshots` (reconciliation.service.ts:463) | `() => Promise<ReconciliationSnapshot[]>` | none | none | 0 (1 read) | NO | NO |

Cross-cutting:
- ✓ When `paymongoBalance === null` (no API call configured this
  phase): `discrepancy = 0` and the snapshot's `notes` are augmented
  with `'PayMongo balance unavailable; expected_total only'`. No
  alert is fired in this state.
- ✓ Alert fires when `Math.abs(discrepancy) > ALERT_THRESHOLD_CENTAVOS`
  — logged at `error` level + `discrepancy_alert_sent=true` on the row.
  Outbound dispatch (Slack/email) is intentionally deferred — see
  HONESTY-CHECK / future-bugs.

---

## File: packages/api/src/services/financial-admin.service.ts (1065 lines, 11 exports — all read-only)

| Export (file:line) | Signature / return type | Inputs validated | Error codes thrown | SQL writes | Money | Audit row |
|---|---|---|---|---|---|---|
| `getFinancialOverview` (financial-admin.service.ts:247) | `(from, to) => Promise<FinancialOverview>` | YYYY-MM-DD; from ≤ to | `400 'Invalid date format. Use YYYY-MM-DD.'`, `400 '"from" date must be on or before "to" date.'` | 0 (multiple reads, Promise.all) | NO | NO |
| `getRevenueByCategory` (financial-admin.service.ts:305) | `(from, to) => Promise<...>` | as above | as above | 0 | NO | NO |
| `getRevenueByCity` (financial-admin.service.ts:347) | `(from, to, limit?) => Promise<...>` | as above; limit clamp [1, 100] | as above | 0 | NO | NO |
| `getRevenueByTier` (financial-admin.service.ts:392) | `(from, to) => Promise<...>` | as above | as above | 0 | NO | NO |
| `getRevenueByPaymentMethod` (financial-admin.service.ts:436) | `(from, to) => Promise<...>` | as above | as above | 0 | NO | NO |
| `getEscrowSummary` (financial-admin.service.ts:502) | `() => Promise<EscrowSummary>` | none | none | 0 | NO | NO |
| `getPayoutsSummary` (financial-admin.service.ts:607) | `() => Promise<PayoutsSummary>` | none | none | 0 (`to_regclass`-guarded — returns zeros if `payouts` table absent) | NO | NO |
| `getGuaranteeFundSummary` (financial-admin.service.ts:692) | `() => Promise<GuaranteeFundSummary>` | none | none | 0 (uses `GUARANTEE_FLOOR_CENTAVOS = 100_000_000` for headroom) | NO | NO |
| `getReconciliationOverview` (financial-admin.service.ts:767) | `() => Promise<ReconciliationOverview>` | none | none | 0 | NO | NO |
| `getBirReportsOverview` (financial-admin.service.ts:847) | `(year?) => Promise<BirReportsOverview>` | year integer if present | none | 0 | NO | NO |
| `searchReceipts` (financial-admin.service.ts:960) | `(query) => Promise<{rows, total}>` | dynamic clause builder; limit/offset clamp | none | 0 (2 reads, Promise.all) | NO | NO |

Cross-cutting:
- ✓ Every optional Phase-08 table read (`payouts`,
  `official_receipts`, `bir_2307_batches`, `vat_monthly_reports`,
  `reconciliation_snapshots`) is gated by `tableExists()` →
  `SELECT to_regclass($1)::text` so a fresh DB cannot crash the
  Financials page.
- ✓ "Completed booking" set is `('completed_by_provider','confirmed','paid_out')`
  via `COMPLETED_STATUSES_SQL` constant (mirrors `customer-admin.service`).
- ✓ Dependency on `bookings.completed_at` and `bookings.city` is
  documented in future-bugs (graceful zero on missing columns).

---

## File: packages/api/src/routes/financial-admin.routes.ts (217 lines)
Mounted at **`/api/v1/admin/financials`** in `server.ts:165` BEFORE
the generic `/api/v1/admin` mount. Auth via `authMiddleware`; reads
require admin role; the single mutating route (`/receipts/:id/cancel`)
requires super_admin.

| Method + path | Service call | requireSuperAdmin? |
|---|---|---|
| GET `/overview` | `getFinancialOverview(from,to)` | no |
| GET `/revenue/by-category` | `getRevenueByCategory(from,to)` | no |
| GET `/revenue/by-city` | `getRevenueByCity(from,to,limit)` | no |
| GET `/revenue/by-tier` | `getRevenueByTier(from,to)` | no |
| GET `/revenue/by-payment` | `getRevenueByPaymentMethod(from,to)` | no |
| GET `/escrow` | `getEscrowSummary()` | no |
| GET `/payouts` | `getPayoutsSummary()` | no |
| GET `/guarantee-fund` | `getGuaranteeFundSummary()` | no |
| GET `/receipts/search` | `searchReceipts(query)` | no |
| GET `/receipts/:id` | `orService.getOrById(id)` (404 if null) | no |
| POST `/receipts/:id/cancel` | `orService.cancelOR(id, reason, userId)` (201) | **yes** |

## File: packages/api/src/routes/bir-admin.routes.ts (333 lines)
Mounted at **`/api/v1/admin/bir`** in `server.ts:166`.

| Method + path | Service call | requireSuperAdmin? |
|---|---|---|
| GET `/vat/reports` | `vatReportService.listVatReports(year,limit,offset)` | no |
| GET `/vat/reports/:year/:month` | `getVatReport(year,month)` (404 if null) | no |
| POST `/vat/reports/:year/:month/generate` | `generateMonthlyVatReport(...)` (201) | **yes** |
| POST `/vat/reports/:year/:month/finalize` | `finalizeVatReport(...)` | **yes** |
| GET `/vat/annual/:year` | `getAnnualVatSummary(year)` | no |
| GET `/2307/quarter/:year/:quarter` | `listBatchesForQuarter(...)` | no |
| GET `/2307/provider/:providerId` | `listBatchesForProvider(...)` | no |
| GET `/2307/:id` | `getBatchById(id)` (404 if null) | no |
| POST `/2307/quarter/:year/:quarter/generate` | `generateQuarterly2307Batches(...)` (201) | **yes** |
| POST `/2307/provider/:providerId/regenerate` | `regenerate2307ForProvider(...)` (201) | **yes** |
| GET `/reconciliation/recent` | `listRecentSnapshots(limit)` | no |
| GET `/reconciliation/alerts` | `listAlertedSnapshots()` | no |
| GET `/reconciliation/:id` | `getSnapshotById(id)` (404 if null) | no |
| POST `/reconciliation/run` | `runDailyReconciliation(input)` (201) | **yes** |
| POST `/reconciliation/:id/acknowledge` | `acknowledgeDiscrepancy(id, note, userId)` | **yes** |
| GET `/overview` | `financialAdminService.getBirReportsOverview(year)` | no |

Cross-cutting route invariants:
- ✓ Both routers `app.use(...)` mounts precede the generic
  `/api/v1/admin` mount in `server.ts` so `/admin/financials/...` and
  `/admin/bir/...` win path resolution before any catch-all.
- ✓ Every handler wraps the service call in `try { ... } catch
  (error) { next(error); }` — error propagation goes through
  `error.middleware`.
- ✓ Validation lives in route helpers (`parseDateRange`,
  `parseIntParam`, `parseQuarter`, `parseMonth`, `parseOptionalNumber`)
  — services double-check; routes throw 400 first.

## Cross-cutting invariants asserted across the suite

- ✓ Every mutating function's INSERT into `admin_actions` writes
  `action_type` and `target_type` as **SQL literals**, matching the
  CHECK constraints widened in migration 055.
- ✓ Every audit-row write (`'or_issued'`, `'or_cancelled'`,
  `'bir_2307_batch_generated'`, `'bir_2307_regenerated'`,
  `'vat_report_generated'`, `'vat_report_finalized'`,
  `'reconciliation_run'`, `'reconciliation_alert_acknowledged'`) is
  wrapped in try/catch with `logger.warn` — audit failure never rolls
  back the data row.
- ✓ Every service call that may write `admin_id=NULL` (system-issued)
  relies on migration 055's `ALTER COLUMN admin_id DROP NOT NULL`.
- ✓ Test file: `packages/api/__tests__/financial-bir-admin.test.ts` —
  **58 tests, all PASS** first-run. Hermetic mocks of `db` and
  surrounding modules. Project total: **702/702** (Phase 07 baseline
  644 → +58 this phase).
