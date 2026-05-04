-- Phase 36b — 45s round-robin offer cycle.
--
-- Tracks each "we offered this booking to this provider" attempt so the
-- background cron + acceptance endpoints can drive a real round-robin
-- through the ranked candidates instead of the current one-shot
-- "GET /match → POST /assign" flow.
--
-- Design note (decision recorded inline so future readers don't need
-- a separate decision file):
--
--   * Status enum stays string-checked so v1.1 can add 'recalled' or
--     'declined_silent' without a migration.
--   * UNIQUE (booking_id, provider_id) prevents the same provider from
--     being re-offered the same booking in the same cycle (an
--     intentional design constraint — once they decline, we move on).
--   * expires_at is computed at INSERT time from offer_timeout_seconds
--     setting (default 45s, lives in matching.service.getMatchConfig()
--     for now; can be moved to platform_settings in v1.1 if ops want
--     to tune live).
--
-- Cron picks `pending` rows where expires_at < NOW(), flips them to
-- `expired`, and the dispatch service immediately offers the next
-- ranked candidate.

BEGIN;

CREATE TABLE booking_offers (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    -- Snapshot of the score at offer time so we can audit "why did the
    -- system pick this provider" if the customer disputes.
    score NUMERIC(5,3),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
    offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    decline_reason TEXT,
    -- attempt_number lets reporting say "this booking went through 3
    -- providers before someone accepted".
    attempt_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (booking_id, provider_id)
);

-- Hot index for the cron's expiry sweep.
CREATE INDEX idx_booking_offers_pending_expiry
    ON booking_offers (expires_at)
    WHERE status = 'pending';

CREATE INDEX idx_booking_offers_booking ON booking_offers(booking_id);
CREATE INDEX idx_booking_offers_provider_pending
    ON booking_offers(provider_id)
    WHERE status = 'pending';

COMMIT;
