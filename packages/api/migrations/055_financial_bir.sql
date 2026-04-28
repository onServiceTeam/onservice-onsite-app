-- Phase 08 — Migration 055: Financial depth + BIR compliance
-- Adds: official_receipts (sequential OR), bir_2307_batches (quarterly withholding),
-- vat_monthly_reports (BIR 2550M-equivalent), reconciliation_snapshots (daily).
-- Also widens admin_actions.action_type and admin_actions.target_type for OR/BIR/VAT/recon events.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- official_receipts — sequential per-month OR numbering
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS official_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    or_number VARCHAR(20) NOT NULL UNIQUE,           -- e.g., "OR-2026-04-000123"
    booking_id UUID NOT NULL REFERENCES bookings(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID REFERENCES providers(id),       -- NULL only for refund-only ORs
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    gross_amount BIGINT NOT NULL,                    -- centavos (service price + service fee)
    vat_amount BIGINT NOT NULL,                      -- centavos (VAT-inclusive: gross * 12/112)
    net_amount BIGINT NOT NULL,                      -- centavos (gross - vat)
    commission_amount BIGINT NOT NULL,
    service_fee_amount BIGINT NOT NULL,
    provider_received BIGINT NOT NULL,
    platform_retained BIGINT NOT NULL,

    pdf_url TEXT,                                    -- S3 URL of generated PDF (nullable if generation deferred)
    is_cancellation BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE for negative/cancellation ORs
    cancels_or_id UUID REFERENCES official_receipts(id),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),

    CONSTRAINT or_money_consistent CHECK (
        gross_amount = net_amount + vat_amount
    )
);

CREATE INDEX IF NOT EXISTS idx_or_booking ON official_receipts(booking_id);
CREATE INDEX IF NOT EXISTS idx_or_customer ON official_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_or_provider ON official_receipts(provider_id);
CREATE INDEX IF NOT EXISTS idx_or_issued_at ON official_receipts(issued_at DESC);

-- Per-month OR sequence so OR numbers are monotonic + gap-free within each month.
-- Atomic counter row: (year, month) -> last_sequence.
CREATE TABLE IF NOT EXISTS or_sequences (
    year INTEGER NOT NULL,
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    last_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (year, month)
);

-- ─────────────────────────────────────────────────────────────
-- bir_2307_batches — quarterly withholding cert per provider
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bir_2307_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    tax_year INTEGER NOT NULL,
    tax_quarter SMALLINT NOT NULL CHECK (tax_quarter BETWEEN 1 AND 4),
    gross_income BIGINT NOT NULL,                    -- centavos
    withholding_rate NUMERIC(5,4) NOT NULL,          -- e.g., 0.0100 for 1%
    withheld_amount BIGINT NOT NULL,                 -- centavos
    pdf_url TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, tax_year, tax_quarter)
);

CREATE INDEX IF NOT EXISTS idx_2307_provider_year ON bir_2307_batches(provider_id, tax_year, tax_quarter);

-- ─────────────────────────────────────────────────────────────
-- vat_monthly_reports — BIR 2550M-equivalent monthly summary
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vat_monthly_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_year INTEGER NOT NULL,
    period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    total_gross_sales BIGINT NOT NULL,
    output_vat BIGINT NOT NULL,
    input_vat BIGINT NOT NULL DEFAULT 0,
    vat_payable BIGINT NOT NULL,
    or_count INTEGER NOT NULL DEFAULT 0,
    pdf_url TEXT,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(period_year, period_month)
);

-- ─────────────────────────────────────────────────────────────
-- reconciliation_snapshots — daily money sanity check
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date DATE NOT NULL UNIQUE,
    paymongo_balance BIGINT,                          -- if available via API; else NULL
    platform_escrow_total BIGINT NOT NULL,
    platform_revenue_total BIGINT NOT NULL,
    guarantee_fund_total BIGINT NOT NULL,
    sum_of_user_wallets BIGINT NOT NULL,
    expected_total BIGINT NOT NULL,                   -- escrow + revenue + guarantee + user wallets
    discrepancy BIGINT NOT NULL,                      -- centavos; signed (paymongo - expected)
    discrepancy_alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_date ON reconciliation_snapshots(snapshot_date DESC);

-- ─────────────────────────────────────────────────────────────
-- Extend admin_actions.action_type with Phase 08 events
-- (preserves all values from migration 054 + adds Phase 08 OR/BIR/VAT/recon)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        -- pre-existing (migrations 001..054)
        'provider_approved', 'provider_rejected', 'provider_suspended', 'provider_reactivated',
        'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
        'customer_suspended', 'customer_reactivated', 'customer_credited',
        'booking_cancelled', 'booking_reassigned', 'booking_force_completed',
        'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
        'dispute_message_sent', 'dispute_reopened',
        'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued',
        'manual_escrow_release',
        -- Phase 08 additions
        'or_issued', 'or_cancelled',
        'bir_2307_batch_generated', 'bir_2307_regenerated',
        'vat_report_generated', 'vat_report_finalized',
        'reconciliation_run', 'reconciliation_alert_acknowledged'
    ));

-- Widen target_type to include receipt/tax/recon objects so audit rows from
-- Phase 08 services can reference them.
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
    CHECK (target_type IN (
        'provider', 'customer', 'booking', 'dispute', 'payout', 'config',
        'official_receipt', 'bir_2307_batch', 'vat_report', 'reconciliation'
    ));

-- Allow admin_id to be NULL for system-issued audit rows (e.g. auto-issued OR on escrow release).
ALTER TABLE admin_actions ALTER COLUMN admin_id DROP NOT NULL;

COMMIT;
