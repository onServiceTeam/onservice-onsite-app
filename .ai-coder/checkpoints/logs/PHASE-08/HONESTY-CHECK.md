# Phase 08 — HONESTY CHECK

Things this phase **does NOT** ship, gaps from the original spec, and
shortcuts the AI coder took. Read this before declaring Phase 08 "done".

## What I claimed vs what I actually did

The Phase 08 plan asked for:
- A rebuilt admin **Financials** page covering overview, revenue
  breakdowns, escrow, payouts, guarantee fund, reconciliation, BIR
  reports, and OR receipt search.
- BIR-compliance backend: sequential per-month Official Receipts,
  quarterly BIR 2307 batches, monthly VAT (BIR 2550M-equivalent)
  reports, daily money reconciliation.

**What shipped:**
- `FinancialsPage.tsx` rebuilt to **1403 lines, 7 tabs** (Overview,
  Revenue, Escrow, Payouts, Guarantee Fund, Reconciliation, BIR
  Reports + Receipts search). The `/financials` route in
  `apps/admin/src/App.tsx` was pre-existing.
- 5 new backend services:
  - `or.service.ts` (**809 lines**, 8 exports: `generateOrNumber`,
    `issueOR`, `cancelOR`, `getOrById`, `getOrByNumber`,
    `listOrsByCustomer`, `listOrsByProvider`, `searchOrs`).
  - `bir-2307.service.ts` (**856 lines**, 6 exports incl.
    `quarterWindow`, `generateQuarterly2307Batches`,
    `regenerate2307ForProvider`, `getBatchById`, `listBatchesForProvider`,
    `listBatchesForQuarter`).
  - `vat-report.service.ts` (**655 lines**, 5 exports:
    `generateMonthlyVatReport`, `finalizeVatReport`, `getVatReport`,
    `listVatReports`, `getAnnualVatSummary`).
  - `reconciliation.service.ts` (**477 lines**, 6 exports + 1 const:
    `ALERT_THRESHOLD_CENTAVOS = 10_000`).
  - `financial-admin.service.ts` (**1065 lines**, 11 read-only
    exports).
- 2 new route files:
  `routes/financial-admin.routes.ts` (**217 lines**, mounted
  `/api/v1/admin/financials`) and `routes/bir-admin.routes.ts`
  (**333 lines**, mounted `/api/v1/admin/bir`). Both wired in
  `server.ts:165-166` BEFORE the generic `/api/v1/admin` mount so
  `/admin/financials/...` and `/admin/bir/...` win path resolution.
- Migration `055_financial_bir.sql` (**146 lines**) — new tables
  `official_receipts`, `or_sequences`, `bir_2307_batches`,
  `vat_monthly_reports`, `reconciliation_snapshots`; widens
  `admin_actions.action_type` and `admin_actions.target_type`
  CHECKs additively; drops NOT NULL from `admin_actions.admin_id`
  for system-issued audit rows.
- One sacred-file touch: `escrow.service.ts:181-198` adds a
  post-commit `orService.issueOR(...)` call wrapped in try/catch.
  See "Sacred-file touch" below.

## Tests written

`packages/api/__tests__/financial-bir-admin.test.ts` —
**58 unit tests, all PASS first-run**, contributing to the
**702/702** project total (Phase 07 baseline 644 → +58 this phase).

**All 58 are hermetic** — they mock `db.query`, `db.transaction`,
external pdfkit/S3 surfaces, and surrounding services. **No
integration test exercises the real postgres CHECK constraints, real
S3 PutObject, or real PayMongo `/v1/balances` this phase.** This is
deliberate: S3 + PayMongo are not wired (see future-bugs #1, #2),
so an integration test would have nothing real to talk to.

## Money conservation evidence

The Phase 08 services WRITE NO MONEY. The single money-adjacent
change is `escrow.service.ts:181-198`, which calls
`orService.issueOR(...)` AFTER the existing escrow transaction has
already committed:

| Service                          | Wallet writes? | What it writes |
|----------------------------------|----------------|----------------|
| `or.service.ts`                  | NO  | `or_sequences`, `official_receipts`, `admin_actions` |
| `bir-2307.service.ts`            | NO  | `bir_2307_batches`, `admin_actions` |
| `vat-report.service.ts`          | NO  | `vat_monthly_reports`, `admin_actions` |
| `reconciliation.service.ts`      | NO  | `reconciliation_snapshots`, `admin_actions` |
| `financial-admin.service.ts`     | NO  | nothing — read-only aggregator |
| `escrow.service.ts` (sacred)     | yes (unchanged) | wallet/escrow rows — **byte-for-byte identical math to Phase 07**; only added a non-throwing post-commit OR-issuance hook |

Money math in `escrow.service.ts` is unchanged: same FOR UPDATE
locks, same rates, same transaction boundary. The newly-added
try/catch around `orService.issueOR` ensures that any failure of OR
issuance (pdfkit crash, S3 misconfig, CHECK violation) cannot roll
back the wallet/escrow writes that already committed. **All 35
escrow tests still pass.**

## Known gaps

### S3 upload is stubbed

`uploadPdf` in each of `or.service`, `bir-2307.service`,
`vat-report.service` returns the canonical
`https://<bucket>.s3.<region>.amazonaws.com/...` URL when both
`AWS_S3_BUCKET` and `AWS_REGION` are set, otherwise logs a warn and
returns `null`. **No `aws-sdk` import is added in this phase** —
the URL is purely string interpolation; no bytes leave the process.
See future-bugs #1.

### PayMongo balance is caller-supplied (no API call this phase)

`runDailyReconciliation` accepts `paymongoBalance` as input. When
`null`, `discrepancy = 0` and the snapshot is annotated with
`'PayMongo balance unavailable; expected_total only'`; no alert
fires. This is correct behaviour, but it means today's daily
reconciliation has no actual external check. Future cron must call
PayMongo `/v1/balances` and pass the result. See future-bugs #2.

### BIR 2307 logic is a simplified RR 16-2023 baseline — REQUIRES ACCOUNTANT REVIEW

`WITHHOLDING_THRESHOLD_CENTAVOS = 50_000_000` (₱500,000) and a flat
`WITHHOLDING_RATE = 0.01` (1%). Provider-specific tax classification
(VAT vs non-VAT, individual vs corporation, exemption certificates)
is NOT considered. Generated PDFs must be marked DRAFT and reviewed
by an authorized accountant before BIR submission. See future-bugs #3.

### VAT `input_vat` is hard-coded to 0

`generateMonthlyVatReport` sets `inputVat = 0` (marketplace
assumption); accountant overlays the correct credits before BIR
submission. See future-bugs #4.

### Reconciliation alert dispatch is log-only

When `|discrepancy| > ALERT_THRESHOLD_CENTAVOS` (₱100), the snapshot
is flagged `discrepancy_alert_sent=true` and `logger.error` fires.
No Slack/email/PagerDuty integration. See future-bugs #5.

### `payouts` table is `to_regclass`-guarded

`getPayoutsSummary` returns zeros when the `payouts` table is
absent. No migration in Phase 08 creates that table — the Payouts
tab will render zeros on every cluster until a separate phase ships
the bank-payout pipeline. See future-bugs #6.

### `bookings.completed_at` / `bookings.city` are assumed present

Several aggregations rely on these columns. If a legacy migration
omits either, the affected breakdowns return zeros (revenue) or
fail-to-group (city). Boundary tests mock the reads so the suite
cannot catch the mismatch. See future-bugs #7.

### OR cancellation shares the next-month sequence rather than reusing the original number with a VOID suffix

BIR-compliant per the gap-free monotonic requirement, but the
`cancels_or_id` foreign key is the only visible link to the
original. Reviewers used to a "VOID register" pattern may need a
view to surface the pair. See future-bugs #8.

## SQL literal vs parameter for `action_type` / `target_type`

Every INSERT into `admin_actions` writes `action_type` AND
`target_type` as **SQL literals** inside the SQL string (e.g.,
`VALUES ($1, 'or_issued', 'official_receipt', $2, ...)`), not via
`$N` parameter substitution.

**Why:** the values are constants tied to the
`admin_actions_action_type_check` and `admin_actions_target_type_check`
CHECK constraints widened in migration 055. Using a literal makes the
constraint dependency obvious at every call site (a grep finds every
place the constraint matters), and unit tests assert the literal
appears in the SQL string — accidental parameterisation or a typo
would fail loudly. This mirrors Phases 06/07's encoding choice for
the same reason.

In addition, every Phase-08 audit-row INSERT is wrapped in try/catch
with `logger.warn` so a CHECK-constraint violation (e.g., a future
contributor renames a literal but forgets to update the migration)
never rolls back the data row. The data row is the authoritative
artifact; the audit is best-effort.

## Sacred-file touch — `escrow.service.ts`

This phase **does** modify `packages/api/src/services/escrow.service.ts`,
a sacred file. The change is minimal and audit-only:

- `+1` import: `import * as orService from './or.service';` at line 8.
- `+~13 lines` at the end of `releaseEscrow` (around line 181), AFTER
  `await db.transaction(...)` returns (i.e., outside the wallet
  transaction):
  ```ts
  try {
    await orService.issueOR({
      bookingId,
      commissionAmount,
      serviceFeeAmount: serviceFee,
      providerReceived: providerReceives,
      platformRetained: platformRetains,
    });
  } catch (orErr) {
    logger.error('OR issuance failed after escrow release (audit-only side effect)', {
      bookingId,
      error: orErr instanceof Error ? orErr.message : String(orErr),
    });
  }
  ```

**No money math was added, removed, or changed.** The wallet writes,
the FOR UPDATE locks, the commission split, the guarantee-fund
contribution, and every existing transaction boundary are unchanged.
The OR call lives strictly OUTSIDE the wallet transaction; any
failure logs at error level and cannot roll back money.

**All 35 escrow tests still pass.** Mutation coverage for
`escrow.service.ts` continues to be carried by its own boundary tests
and Stryker pass under `verify-master`.

## pdfkit dependency added with `--legacy-peer-deps`

`pdfkit@0.16.0` and `@types/pdfkit@0.13.4` were added to
`packages/api/package.json` (visible at lines 35 and 50). The install
required `--legacy-peer-deps` to satisfy a **pre-existing**
peer-dependency conflict in `eslint-plugin-react`. This is a
workspace-wide condition that pre-dates Phase 08 — Phase 08 did not
introduce it; the same flag was needed by earlier phases that added
deps. Documenting it here so future contributors don't waste a cycle
investigating a "Phase 08 broke npm install" report.

## Spec items deferred / not shipped

| Item                                                  | Status        | Why |
| ----------------------------------------------------- | ------------- | --- |
| Real S3 upload of OR / 2307 / VAT PDFs                | **deferred**  | `aws-sdk` not added; `uploadPdf` returns canonical URL only when env vars set, else `null`. |
| PayMongo `/v1/balances` integration                   | **deferred**  | `paymongoBalance` is caller-supplied; `null` suppresses alerts. |
| Provider-specific BIR 2307 tax profiles               | **deferred**  | RR 16-2023 baseline encoded; accountant review required. |
| VAT input-VAT credits per provider                    | **deferred**  | `input_vat = 0` hard-coded; accountant overlays. |
| Reconciliation alert dispatch (Slack/email)           | **deferred**  | log-only via `logger.error` + DB flag. |
| `payouts` table + Payouts tab population              | **deferred**  | `to_regclass`-guarded; zeros until table exists. |
| OR cancellation as VOID-suffixed original number      | **deferred**  | uses next-month sequence + `cancels_or_id` FK; BIR-compliant. |
| Integration tests against real postgres for new flows | **deferred**  | hermetic mocks only this phase. |

## Migration count

Phase 08 ships **one** migration: `055_financial_bir.sql`
(146 lines). It is **additive** (4 new tables — `official_receipts`,
`or_sequences`, `bir_2307_batches`, `vat_monthly_reports`,
`reconciliation_snapshots` — plus indexes and CHECK widening on
`admin_actions`). The CHECK widening drops-and-recreates the existing
constraint to add 8 new `action_type` literals and 4 new
`target_type` literals. **One non-additive change:** `ALTER TABLE
admin_actions ALTER COLUMN admin_id DROP NOT NULL` so system-issued
audit rows can write `admin_id=NULL`. No data writes; no schema-
breaking changes to existing columns.
