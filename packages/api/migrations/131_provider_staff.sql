-- Provider staff / team members — D23 (Ken, 2026-06-04).
--
-- A provider can add a team member who has THEIR OWN login, goes through
-- back-office approval (mirroring provider onboarding), and whose job
-- performance rolls up fully into the provider's quality score. This migration
-- is the Phase-1 foundation: tables + columns + role. No app wiring yet.
--
-- Rollup note: the provider's headline rating already aggregates all reviews
-- WHERE provider_id = X, which includes staff-performed jobs regardless of
-- performer_staff_id — so "counts fully toward the provider" needs no change to
-- the score path. performer_staff_id only enables the per-member breakdown and
-- scoping a staff member's app to their own assigned jobs.

-- 1) New role for staff logins (scoped provider-side access).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'provider', 'admin', 'super_admin', 'provider_staff'));

-- 2) The staff link + approval state machine.
CREATE TABLE IF NOT EXISTS provider_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    -- NULL until the invited member signs up / links their account.
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    role_title VARCHAR(100),

    status VARCHAR(20) NOT NULL DEFAULT 'invited'
        CHECK (status IN ('invited', 'pending_review', 'approved', 'rejected', 'suspended', 'deactivated')),

    -- Invite (before the user account exists).
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invite_phone VARCHAR(20),
    invite_email VARCHAR(255),
    invite_token VARCHAR(100),
    invite_expires_at TIMESTAMPTZ,

    -- Back-office review (mirrors provider onboarding admin_decision).
    submitted_for_review_at TIMESTAMPTZ,
    admin_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_decision VARCHAR(20) CHECK (admin_decision IN ('approved', 'rejected', 'sent_back')),
    admin_decision_at TIMESTAMPTZ,
    admin_decision_reason TEXT,

    -- Per-member performance breakdown (advisory; provider score is the source
    -- of truth and rolls these in automatically via reviews.provider_id).
    rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    total_jobs INTEGER NOT NULL DEFAULT 0,
    total_reviews INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A user can be staff for a given provider only once.
    UNIQUE (provider_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_staff_provider ON provider_staff(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_user ON provider_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_status ON provider_staff(status);
-- Back-office review queue: members awaiting a decision.
CREATE INDEX IF NOT EXISTS idx_provider_staff_pending_review
    ON provider_staff(submitted_for_review_at)
    WHERE status = 'pending_review';
-- Invite-token lookup when a member accepts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_staff_invite_token
    ON provider_staff(invite_token)
    WHERE invite_token IS NOT NULL;

-- 3) Who actually performed the job / was reviewed. NULL = the provider owner.
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS performer_staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL;
ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS performer_staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_performer_staff ON bookings(performer_staff_id) WHERE performer_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_performer_staff ON reviews(performer_staff_id) WHERE performer_staff_id IS NOT NULL;
