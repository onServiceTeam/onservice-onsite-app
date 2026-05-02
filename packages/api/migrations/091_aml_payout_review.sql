-- Migration 091: AML (Anti-Money Laundering) review tracking on payouts.
-- MED-N77 fix.
--
-- Per RA 9160 (PH AMLA) §3 and AMLC implementing rules, covered persons
-- must report cash transactions exceeding ₱500,000 within one banking
-- day. Marketplace payouts above this threshold should not auto-process
-- through the standard 'pending' → 'approved' admin flow; they should
-- enter an 'aml_review_pending' state that requires explicit super_admin
-- approval and triggers an entry in the AMLA reporting queue.
--
-- This migration:
--   1. Adds 'aml_review_pending' to the payouts.status CHECK constraint.
--   2. Adds requires_aml_review BOOLEAN column (default FALSE) so the
--      service layer + admin UI can filter / surface large transactions.
--   3. Adds aml_review_amount_threshold_centavos (always recorded at
--      time of request, in case the configurable threshold changes
--      later — preserves audit trail).

-- 1. Status enum extension.
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
    CHECK (status IN (
        'pending',
        'processing',
        'approved',
        'completed',
        'rejected',
        'failed',
        'aml_review_pending'
    ));

-- 2. requires_aml_review flag for fast filter on the admin Compliance
-- dashboard. Existing rows default to FALSE (they predate the threshold
-- check; review on a forward-going basis only).
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS requires_aml_review BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Threshold-at-time-of-request. Captures the value of the
-- platform_settings key `aml_large_transaction_threshold_centavos`
-- as it was when the payout was filed, so audits later can prove
-- the trigger logic regardless of subsequent threshold changes.
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS aml_threshold_at_request_centavos BIGINT;

-- 4. Index for compliance dashboard's "show all aml-flagged payouts" query.
CREATE INDEX IF NOT EXISTS idx_payouts_aml_review
    ON payouts(requires_aml_review, status, created_at DESC)
    WHERE requires_aml_review = TRUE;

COMMENT ON COLUMN payouts.requires_aml_review IS
    'TRUE when this payout amount >= the AML large-transaction threshold at the time of filing. Requires super_admin review before disbursement. Pairs with status=aml_review_pending on the same row. RA 9160 (PH AMLA) §3 covered transaction.';
COMMENT ON COLUMN payouts.aml_threshold_at_request_centavos IS
    'Snapshot of the AML threshold setting at request time, in centavos. NULL for pre-091 rows.';
