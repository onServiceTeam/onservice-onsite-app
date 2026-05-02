-- 114_b_crit01_crit02_partial_refund_tracking.sql
--
-- Phase B CRIT-01 + CRIT-02 fix.
--
-- CRIT-01 — pre-fix: payment.service.processRefund rejected any
-- refund when status != 'succeeded'. After the first partial refund
-- the status flipped to 'partially_refunded' and any subsequent
-- partial refund (legitimate use case — staged dispute resolution,
-- multi-step compensation) returned 409. Customers stuck waiting
-- for full refund instead of receiving partial credits.
--
-- CRIT-02 — pre-fix: PayMongo refund POST sent
--   payment_id: intent.paymongo_intent_id  // ← the INTENT id (pi_XYZ)
-- but PayMongo's /v1/refunds API expects the PAYMENT id (pay_XYZ).
-- The intent has many payments; refunds attach to the specific
-- payment that succeeded. Production refunds were silently failing
-- (returned 4xx from PayMongo) and the catch block only logged.
--
-- Schema changes:
--   1. payment_intents.refunded_amount BIGINT NOT NULL DEFAULT 0 —
--      cumulative centavos refunded across all partial refunds. Used
--      by processRefund to compute "next refund won't overrefund".
--   2. payment_intents.paymongo_payment_id TEXT NULL — captured from
--      payment.paid webhook (event.data.id). Promoted from
--      metadata.reference_id to a dedicated column for query speed
--      and to make the intent vs payment ID distinction obvious in
--      schema. Backfill from existing metadata.
--
-- Backfill: any payment_intent already at status='refunded' is
-- treated as fully refunded (refunded_amount = amount). For paymongo_
-- payment_id, copy from metadata.reference_id where present.

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS refunded_amount BIGINT NOT NULL DEFAULT 0;

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS paymongo_payment_id TEXT NULL;

-- Backfill cumulative refunded_amount for already-refunded intents.
UPDATE payment_intents
   SET refunded_amount = amount
 WHERE status = 'refunded'
   AND refunded_amount = 0;

-- Backfill paymongo_payment_id from metadata where the webhook handler
-- previously wrote it as `metadata.reference_id` (post-MED-N155 fix).
UPDATE payment_intents
   SET paymongo_payment_id = (metadata ->> 'reference_id')
 WHERE paymongo_payment_id IS NULL
   AND metadata IS NOT NULL
   AND (metadata ->> 'reference_id') IS NOT NULL
   AND (metadata ->> 'reference_id') LIKE 'pay_%';

CREATE INDEX IF NOT EXISTS payment_intents_paymongo_payment_id_idx
  ON payment_intents (paymongo_payment_id)
  WHERE paymongo_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_intents_status_partial_idx
  ON payment_intents (status)
  WHERE status = 'partially_refunded';
