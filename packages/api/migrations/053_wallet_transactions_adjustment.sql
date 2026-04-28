-- Migration 053: Allow 'adjustment' type in wallet_transactions
--
-- Phase 05 (Provider 360) introduces super-admin manual wallet adjustments.
-- The existing CHECK constraint on wallet_transactions.type does not include
-- 'adjustment'. This migration extends the constraint additively. No existing
-- type is removed, so downstream code paths that depend on the prior set of
-- types remain valid (sacred-file safety: additive only).

ALTER TABLE wallet_transactions
    DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN (
        'payment', 'escrow_hold', 'escrow_release', 'commission',
        'payout', 'refund', 'withdrawal', 'guarantee_contribution',
        'service_fee', 'adjustment'
    ));
