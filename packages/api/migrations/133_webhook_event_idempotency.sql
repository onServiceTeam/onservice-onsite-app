-- Webhook idempotency (§33). PayMongo redelivers the same event id on retry and
-- can occasionally deliver concurrently. This table is the dedup gate: the
-- handler claims the event id ('processing') before doing any work, marks it
-- 'done' on success, and deletes the claim on failure so a retry reprocesses.
-- Event-level (not wallet_transactions.reference_id, which is multi-purpose), so
-- it covers booking-payment AND top-up events without a risky unique constraint.

CREATE TABLE IF NOT EXISTS webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'done')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- For an optional periodic cleanup of old 'done' rows.
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at);
