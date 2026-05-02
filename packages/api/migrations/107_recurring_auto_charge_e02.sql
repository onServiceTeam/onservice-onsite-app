-- 107_recurring_auto_charge_e02.sql
--
-- Resolves Escalation E02 (D22 decision: Path A — real auto-charge).
--
-- Adds the columns and indexes needed for the recurring scheduler to
-- charge a stored PayMongo payment method on the customer's behalf.
-- PCI scope: we never store raw card data, only PayMongo's tokenized
-- payment_method_id reference (SAQ A merchant posture preserved).
--
-- New columns on recurring_bookings:
--   payment_method_id       — TEXT NULL — PayMongo source/PM ID.
--   payment_method_label    — TEXT NULL — short description shown to
--                             customer (e.g. "Visa ending 4242").
--                             stored alongside so the UI can render
--                             without re-querying PayMongo.
--   auto_charge_status      — TEXT NULL — 'pending'|'succeeded'|'failed'|'suspended'.
--   auto_charge_consecutive_failures — INT default 0.
--   auto_charge_suspended_at — TIMESTAMPTZ NULL.
--   auto_charge_last_attempt_at — TIMESTAMPTZ NULL.
--
-- New event types on security_events / notifications:
--   notification.type 'recurring_auto_charge_succeeded'
--   notification.type 'recurring_auto_charge_failed'
--   notification.type 'recurring_auto_charge_suspended'

BEGIN;

-- 1) recurring_bookings columns -------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_bookings' AND column_name = 'payment_method_id'
  ) THEN
    ALTER TABLE recurring_bookings
      ADD COLUMN payment_method_id TEXT NULL,
      ADD COLUMN payment_method_label TEXT NULL,
      ADD COLUMN auto_charge_status TEXT NULL
        CHECK (auto_charge_status IS NULL OR auto_charge_status IN
               ('pending', 'succeeded', 'failed', 'suspended')),
      ADD COLUMN auto_charge_consecutive_failures INT NOT NULL DEFAULT 0,
      ADD COLUMN auto_charge_suspended_at TIMESTAMPTZ NULL,
      ADD COLUMN auto_charge_last_attempt_at TIMESTAMPTZ NULL;
  END IF;
END$$;

-- 2) Index for the scheduler ----------------------------------------------
-- Targets the scheduler's hot path: WHERE auto_charge=TRUE
--   AND auto_charge_suspended_at IS NULL
--   AND payment_method_id IS NOT NULL
--   AND next_booking_date <= today.
CREATE INDEX IF NOT EXISTS idx_recurring_bookings_autocharge_due
  ON recurring_bookings (next_booking_date)
  WHERE auto_charge = TRUE
    AND auto_charge_suspended_at IS NULL
    AND payment_method_id IS NOT NULL;

-- 3) Tracking ledger ------------------------------------------------------
-- recurring_auto_charge_attempts records every charge attempt regardless
-- of outcome. The scheduler writes one row per attempt; admin alerts read
-- from this table; consumer of the audit screen reads from this table.
CREATE TABLE IF NOT EXISTS recurring_auto_charge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_booking_id UUID NOT NULL REFERENCES recurring_bookings(id) ON DELETE CASCADE,
  booking_id UUID NULL REFERENCES bookings(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_centavos BIGINT NOT NULL,
  wallet_portion_centavos BIGINT NOT NULL DEFAULT 0,
  paymongo_portion_centavos BIGINT NOT NULL DEFAULT 0,
  payment_method_id TEXT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'skipped_no_method', 'skipped_suspended')),
  failure_reason TEXT NULL,
  paymongo_payment_id TEXT NULL,
  consecutive_failures_after INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rac_attempts_recurring
  ON recurring_auto_charge_attempts (recurring_booking_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_rac_attempts_outcome
  ON recurring_auto_charge_attempts (outcome, attempted_at DESC);

-- 4) Platform setting for failure threshold -------------------------------
-- After this many consecutive failures we suspend the auto-charge and
-- require the customer to re-confirm the payment method. Default 3.
INSERT INTO platform_settings (key, value, description)
  VALUES (
    'recurring_auto_charge_max_consecutive_failures',
    '3',
    'After this many consecutive PayMongo failures the recurring auto-charge is suspended; customer must re-confirm payment method to resume.'
  )
ON CONFLICT (key) DO NOTHING;

-- 5) Notification + admin alert taxonomy ----------------------------------
-- We deliberately store new notification types in code rather than as a
-- DB CHECK extension; the notifications table treats type as TEXT (see
-- migration 010). Documented here for traceability:
--   - 'recurring_auto_charge_succeeded'
--   - 'recurring_auto_charge_failed'
--   - 'recurring_auto_charge_suspended'

COMMIT;
