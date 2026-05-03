-- Migration 122 — Phase 27a fix for wallet topup flow.
--
-- BUG-PHASE27-01: payment_intents.booking_id is `uuid NOT NULL`, but the
-- wallet topup flow at packages/api/src/routes/wallet.routes.ts:91
-- constructs a string topUpId of the form 'topup_<userId>_<timestamp>'
-- and passes it to paymentService.createPaymentIntent as the bookingId
-- arg. Postgres rejects it with `invalid input syntax for type uuid`,
-- so every customer wallet top-up has 500'd since the feature shipped.
-- Phase 24d's webhook test acknowledged the bug (test-phase24d:265-269)
-- and worked around it by passing a fake UUID; the real flow stayed broken.
--
-- This migration:
--   1. Makes booking_id nullable so topup intents can store NULL there.
--   2. Adds topup_id text column with an idx for the webhook lookup.
--   3. Adds a CHECK constraint so every row has either booking_id OR
--      topup_id (one of them — exclusive-or in spirit, both NULL banned).
--   4. Backfill: any existing topup-prefixed metadata (paranoid; should
--      be 0 rows since the flow was 100% broken) gets topup_id set.

DO $migration_122$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='payment_intents' AND column_name='topup_id'
  ) THEN
    ALTER TABLE payment_intents
      ALTER COLUMN booking_id DROP NOT NULL,
      ADD COLUMN topup_id text NULL;

    -- Index for the webhook lookup path (getTopupPaymentIntent).
    CREATE INDEX idx_payment_intents_topup_id
      ON payment_intents (topup_id)
      WHERE topup_id IS NOT NULL;

    -- Either booking_id or topup_id must be set (never both NULL,
    -- never both NOT NULL — they're mutually exclusive paths).
    ALTER TABLE payment_intents
      ADD CONSTRAINT payment_intents_kind_xor
      CHECK (
        (booking_id IS NOT NULL AND topup_id IS NULL)
        OR
        (booking_id IS NULL AND topup_id IS NOT NULL)
      );

    -- Defensive backfill: any pre-existing topup intent (shouldn't
    -- exist because flow was broken, but guard against legacy data).
    UPDATE payment_intents
       SET topup_id = (metadata->>'booking_id')
     WHERE metadata->>'intent_kind' = 'top_up'
       AND topup_id IS NULL;

    RAISE NOTICE 'Migration 122 applied: payment_intents.topup_id added; booking_id now nullable.';
  ELSE
    RAISE NOTICE 'Migration 122 — payment_intents.topup_id already exists; skipped.';
  END IF;
END
$migration_122$;
