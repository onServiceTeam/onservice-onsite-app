# PHASE 08 — FINANCIAL DEPTH + BIR COMPLIANCE

**Goal:** Build real financial dashboards, sequential OR (Official Receipt) numbering, BIR Form 2307 generation per provider, monthly VAT reports, and reconciliation alerts.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/08-financial-and-bir`
**Estimated time:** 10 hours
**Dependencies:** Phase 07 complete and merged
**Risk:** High — financial accuracy; involves BIR forms with legal weight. A Philippine accountant should review the output before live use.

---

## Step 1 — Pre-flight

## Step 2 — Migration 053: receipts and tax records

```sql
-- Sequential Official Receipt numbering (BIR requirement)
CREATE TABLE official_receipts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    or_number VARCHAR(20) NOT NULL UNIQUE,  -- e.g., "OR-2026-04-000123"
    booking_id UUID NOT NULL REFERENCES bookings(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID REFERENCES providers(id),  -- NULL for refund-only ORs
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    gross_amount INTEGER NOT NULL,           -- centavos (service price + fee)
    vat_amount INTEGER NOT NULL,             -- centavos (12% of gross)
    net_amount INTEGER NOT NULL,             -- centavos (gross - vat)
    commission_amount INTEGER NOT NULL,
    service_fee_amount INTEGER NOT NULL,
    provider_received INTEGER NOT NULL,
    platform_retained INTEGER NOT NULL,

    pdf_url TEXT,                            -- S3 URL of generated PDF
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id)
);

CREATE INDEX idx_or_number ON official_receipts(or_number);
CREATE INDEX idx_or_booking ON official_receipts(booking_id);
CREATE INDEX idx_or_customer ON official_receipts(customer_id);
CREATE INDEX idx_or_provider_year ON official_receipts(provider_id, EXTRACT(YEAR FROM issued_at));

-- BIR Form 2307 batches (Certificate of Creditable Tax Withheld at Source)
CREATE TABLE bir_2307_batches (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    tax_year INTEGER NOT NULL,
    tax_quarter SMALLINT NOT NULL CHECK (tax_quarter BETWEEN 1 AND 4),
    gross_income INTEGER NOT NULL,           -- centavos
    withholding_rate DECIMAL(4,3) NOT NULL,  -- e.g., 0.010 for 1% (per RR 16-2023)
    withheld_amount INTEGER NOT NULL,        -- centavos
    pdf_url TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, tax_year, tax_quarter)
);

CREATE INDEX idx_2307_provider_year ON bir_2307_batches(provider_id, tax_year, tax_quarter);

-- Monthly VAT reports (BIR Form 2550M)
CREATE TABLE vat_monthly_reports (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    period_year INTEGER NOT NULL,
    period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    total_gross_sales INTEGER NOT NULL,
    output_vat INTEGER NOT NULL,
    input_vat INTEGER NOT NULL DEFAULT 0,
    vat_payable INTEGER NOT NULL,
    pdf_url TEXT,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id),
    UNIQUE(period_year, period_month)
);

-- Reconciliation snapshots (daily)
CREATE TABLE reconciliation_snapshots (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    snapshot_date DATE NOT NULL UNIQUE,
    paymongo_balance INTEGER,                -- if available via API
    platform_escrow_total INTEGER NOT NULL,
    platform_revenue_total INTEGER NOT NULL,
    guarantee_fund_total INTEGER NOT NULL,
    sum_of_wallets INTEGER NOT NULL,
    discrepancy INTEGER NOT NULL,            -- centavos; absolute value
    discrepancy_alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Step 3 — Sequential OR generation

Service: `packages/api/src/services/or.service.ts`. Functions:

```ts
// Generates next OR number atomically. Format: OR-YYYY-MM-NNNNNN
// Uses a sequence + locked select for safety.
export async function generateOrNumber(client: TransactionClient): Promise<string>

// Issues an OR for a booking when escrow releases. Generates PDF, uploads to S3.
export async function issueOR(bookingId: string): Promise<OfficialReceipt>

// Cancels an OR (e.g., on full refund). Issues a cancellation OR with negative amounts.
export async function cancelOR(orId: string, reason: string, cancelledBy: string): Promise<void>
```

PDF generation: use `pdfkit` (already in approved dependency list — add via `npm install --save-exact pdfkit@0.16.0` in `packages/api`). Template: ALL fields BIR requires per RMC 53-2014 (taxpayer name, TIN, address, sequence number, date, customer details, line items, VAT-in-excluded breakdown, signatory).

Hook OR issuance into the escrow release flow: after escrow.service `releaseEscrow()` completes, call `issueOR(bookingId)`.

## Step 4 — BIR Form 2307 generation

Service: `packages/api/src/services/bir-2307.service.ts`. Per RR 16-2023:
- Withholding rate is 1% on gross income for individual contractors (providers with TIN registered as Self-Employed)
- Threshold: applies once provider's YTD income from the platform crosses ₱500,000 (only the ½ of gross above threshold gets withheld at 1% — see RR 16-2023 for exact mechanics; verify with accountant)
- Issued quarterly to each provider
- Quarterly batches generated automatically end of Mar/Jun/Sep/Dec

Function:

```ts
// Generates 2307 PDFs for all providers who crossed threshold in the quarter.
// Idempotent: skips providers who already have a 2307 for that quarter.
export async function generateQuarterly2307Batches(year: number, quarter: 1|2|3|4): Promise<void>
```

Provider sees their 2307s in their financials tab (mobile + admin). Admin can preview/regenerate from provider 360 → financials tab.

**FLAG TO KEN:** This implementation should be reviewed by your Philippine accountant before relying on it for actual BIR filings. The withholding mechanics (when exactly to withhold, how to compute the threshold) have nuances that vary by provider's BIR registration status. The plan generates the form correctly given the inputs; the inputs need accountant verification.

## Step 5 — Monthly VAT report

Service: `vat-report.service.ts`:

```ts
// Generates the monthly VAT report (BIR Form 2550M-equivalent).
// All bookings completed in the period are summed.
// Output VAT = 12% of gross sales (already in OR records).
// Input VAT = if you have a provider-side OR/receipt for input VAT credits (mostly N/A for marketplace).
export async function generateMonthlyVatReport(year: number, month: number): Promise<VatMonthlyReport>
```

Cron job: 5th day of each month, generates previous month's report. Admin can download PDF.

## Step 6 — Reconciliation job

Daily cron at 02:00 Asia/Manila:

```ts
// Snapshots all wallet totals + PayMongo balance (if API allows).
// Computes discrepancy.
// If |discrepancy| > 10000 centavos (₱100), creates a critical alert.
export async function runDailyReconciliation(): Promise<ReconciliationSnapshot>
```

Result visible in admin Financials tab → Reconciliation section.

## Step 7 — Financial dashboard rebuild

Replace `apps/admin/src/pages/FinancialsPage.tsx` (currently 260 lines) with structured tabs:

**Tabs:**
- **Overview** — top stats (GMV, revenue, refunds), date-range picker, charts (revenue by category, by city, by tier, by payment method)
- **Escrow** — total in escrow now, pending release queue, aging report (>24h, >48h, >7d)
- **Payouts** — pending payouts, today's payouts, failed payouts (with reason), manual trigger, payout schedule editor
- **Guarantee Fund** — current balance, 30d inflow, 30d outflow, runway months, replenishment alert
- **Reconciliation** — daily reconciliation history (last 30), discrepancy alerts
- **BIR Reports** — Monthly VAT (download PDFs), Quarterly 2307 batches (download PDFs), Annual summaries
- **Receipts** — search OR by number / customer / date

## Step 8 — Tests

- OR sequence is monotonic (no duplicates, no gaps within a month)
- OR generated for every escrow release
- 2307 generated correctly for sample data
- Monthly VAT sums correctly
- Reconciliation detects manufactured discrepancies

## Step 9 — Verify, commit, report. STOP.
