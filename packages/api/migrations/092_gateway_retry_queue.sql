-- Migration 092: Failed-gateway-action retry queue.
-- MED-N28 fix.
--
-- When a dispute is resolved or a booking confirmation triggers a
-- gateway-side action (PayMongo refund, escrow release, partial
-- escrow release, payout transfer), the post-commit gateway call
-- can fail (network, gateway 5xx, rate-limited) AFTER the durable
-- DB state has already committed. Pre-fix: the failure was logged
-- with logger.error and forgotten. The dispute showed "resolved"
-- with refundAmount > 0 but the customer never got their money
-- back. Manual ops triage was the only path forward.
--
-- This migration creates a retry queue:
--   - One row per attempted action that failed.
--   - Tracks attempt count, next-retry time, last error.
--   - Worker job picks them up periodically with exponential
--     backoff.
--   - Admin Compliance / Disputes UI surfaces failed_permanent
--     rows for manual escalation.

CREATE TABLE IF NOT EXISTS gateway_retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What we're retrying.
    action_type TEXT NOT NULL CHECK (action_type IN (
        'refund_from_escrow',
        'release_escrow',
        'release_partial_escrow'
    )),

    -- What it relates to (refund/release operations are always
    -- booking-scoped; dispute_id is captured when applicable for
    -- the admin UI cross-link but is nullable so non-dispute
    -- post-commit failures can also enqueue).
    booking_id UUID NOT NULL,
    dispute_id UUID,

    -- Action parameters (refund amount, payout description, etc.).
    -- Captured at enqueue time so the retry uses the SAME values
    -- the original call used — no drift if the source row is
    -- mutated later.
    amount_centavos BIGINT,
    description TEXT,

    -- Retry policy.
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    last_attempted_at TIMESTAMPTZ,

    -- Lifecycle.
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'in_progress',
        'succeeded',
        'failed_permanent'
    )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    succeeded_at TIMESTAMPTZ,
    failed_permanent_at TIMESTAMPTZ
);

-- Worker query: pending rows whose next_retry_at has passed,
-- ordered by next_retry_at so older failures are retried first.
CREATE INDEX IF NOT EXISTS idx_gateway_retry_pending
    ON gateway_retry_queue(next_retry_at)
    WHERE status = 'pending';

-- Admin compliance dashboard query: failed_permanent rows that
-- need manual ops attention, scoped by booking.
CREATE INDEX IF NOT EXISTS idx_gateway_retry_failed_permanent
    ON gateway_retry_queue(failed_permanent_at DESC, booking_id)
    WHERE status = 'failed_permanent';

CREATE INDEX IF NOT EXISTS idx_gateway_retry_booking
    ON gateway_retry_queue(booking_id, status);

CREATE INDEX IF NOT EXISTS idx_gateway_retry_dispute
    ON gateway_retry_queue(dispute_id)
    WHERE dispute_id IS NOT NULL;

COMMENT ON TABLE gateway_retry_queue IS
    'Failed post-commit gateway actions (refund/release) waiting for retry. Worker job processes pending rows with exponential backoff. failed_permanent rows surface in admin UI for manual ops. MED-N28 fix.';
COMMENT ON COLUMN gateway_retry_queue.next_retry_at IS
    'Earliest time the worker should retry. Backoff: attempt N retries at NOW() + 2^N minutes (1, 2, 4, 8, 16 min for attempts 1-5).';
COMMENT ON COLUMN gateway_retry_queue.status IS
    'pending: awaiting next retry. in_progress: worker has claimed it. succeeded: gateway accepted on a later retry. failed_permanent: exhausted max_attempts; needs manual ops.';
