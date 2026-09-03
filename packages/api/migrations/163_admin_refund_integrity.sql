-- Booking-scoped admin refunds must be replay-safe. The request key is stored
-- in the existing immutable admin_actions evidence and enforced only for the
-- refund action so historical rows remain untouched.
CREATE UNIQUE INDEX admin_refund_idempotency_key
    ON admin_actions ((details ->> 'idempotencyKey'))
    WHERE action_type = 'refund_issued'
      AND details ? 'idempotencyKey';

-- A local escrow movement must never be repeated merely because the external
-- payment status update failed. This retry runs only paymentService.processRefund;
-- it does not debit booking escrow a second time.
ALTER TABLE gateway_retry_queue
    DROP CONSTRAINT IF EXISTS gateway_retry_queue_action_type_check;

ALTER TABLE gateway_retry_queue
    ADD CONSTRAINT gateway_retry_queue_action_type_check
    CHECK (action_type IN (
        'refund_from_escrow',
        'process_payment_refund',
        'release_escrow',
        'release_partial_escrow'
    ));
