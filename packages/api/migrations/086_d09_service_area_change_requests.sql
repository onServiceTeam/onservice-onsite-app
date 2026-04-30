-- Phase 14 Dispatch 09 — Bug 1268.
-- Service area change requests. Pre-D09 a provider could change their
-- service area instantly, with no admin review. v1.0 launch position:
-- area changes require admin approval (small but important moderation
-- gate to prevent gaming of the assignment radius).

BEGIN;

CREATE TABLE service_area_change_requests (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_area_id UUID REFERENCES service_areas(id),
    requested_area_id UUID NOT NULL REFERENCES service_areas(id),
    current_radius_km INTEGER,
    requested_radius_km INTEGER NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected', 'cancelled'
    )),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    decision_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one pending request per provider at a time. Partial unique index.
CREATE UNIQUE INDEX idx_area_change_one_pending_per_provider
    ON service_area_change_requests(provider_id)
    WHERE status = 'pending';

CREATE INDEX idx_area_change_pending
    ON service_area_change_requests(created_at)
    WHERE status = 'pending';

CREATE INDEX idx_area_change_provider
    ON service_area_change_requests(provider_id, created_at DESC);

COMMIT;
