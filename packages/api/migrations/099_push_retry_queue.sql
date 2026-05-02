-- Migration 099: Failed-push-delivery retry queue.
-- MED-N57 fix.
--
-- Pre-fix: notification.service.deliverPushToDevice called the Expo
-- push API and on failure (network error, Expo 5xx, rate-limited)
-- only logged the error and moved on. The notification ROW was
-- already created in the database (in createNotification) so the user
-- could see it next time they opened the app — but the immediate
-- push that wakes the device never arrived. Critical things like
-- "your provider has arrived" or "your refund has been processed"
-- silently failed.
--
-- Post-fix: same pattern as gateway-retry-queue (MED-N28). On Expo
-- API failure we enqueue a row here. A worker processes pending rows
-- with exponential backoff (1, 2, 4, 8, 16 min). After max_attempts
-- (5) the row is marked failed_permanent and surfaces in admin UI.
--
-- Per-ticket failures (e.g., DeviceNotRegistered for a stale token)
-- are NOT enqueued — those are handled inline by removing the stale
-- token. Only the whole-call failures (couldn't talk to Expo at all)
-- get retried.

CREATE TABLE IF NOT EXISTS push_retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Recipient + payload captured at enqueue time so the retry uses
    -- the SAME message even if the source notification gets read /
    -- deleted in the interim.
    user_id UUID NOT NULL,
    notification_id UUID,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,

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

-- Worker query: pending rows whose next_retry_at has passed.
CREATE INDEX IF NOT EXISTS idx_push_retry_pending
    ON push_retry_queue(next_retry_at)
    WHERE status = 'pending';

-- Admin compliance dashboard: failed_permanent rows for ops.
CREATE INDEX IF NOT EXISTS idx_push_retry_failed_permanent
    ON push_retry_queue(failed_permanent_at DESC, user_id)
    WHERE status = 'failed_permanent';

CREATE INDEX IF NOT EXISTS idx_push_retry_user
    ON push_retry_queue(user_id, status);

COMMENT ON TABLE push_retry_queue IS
    'Failed push-delivery attempts queued for retry. Worker picks up pending rows with exponential backoff. failed_permanent rows surface in admin UI. MED-N57 fix.';
COMMENT ON COLUMN push_retry_queue.next_retry_at IS
    'Earliest time the worker should retry. Backoff: attempt N retries at NOW() + 2^N minutes (1, 2, 4, 8, 16 min for attempts 1-5).';
