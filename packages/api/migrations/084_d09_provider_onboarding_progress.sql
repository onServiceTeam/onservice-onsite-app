-- Phase 14 Dispatch 09 — Bugs 162, 1199, 1200.
-- Provider onboarding progress + manual admin review state.
--
-- v1.0 launch position: no real liveness vendor (Onfido / Persona) is
-- contracted. Every provider's documents and selfie are reviewed by a
-- human admin before activation. v1.1+ wires automated liveness when
-- business case warrants. Documented in LAUNCH-LIMITATIONS §27.
--
-- Renumbered from spec's 081 since D08 took 080-083.

BEGIN;

CREATE TABLE provider_onboarding_progress (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_step TEXT NOT NULL CHECK (current_step IN (
        'role_select', 'terms', 'categories', 'service_area',
        'documents', 'selfie', 'identity_verification',
        'background_check', 'review_pending', 'completed'
    )),
    steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
    data_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_for_review_at TIMESTAMPTZ,
    admin_review_started_at TIMESTAMPTZ,
    admin_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_decision TEXT CHECK (admin_decision IN ('approved', 'rejected', 'sent_back')),
    admin_decision_at TIMESTAMPTZ,
    admin_decision_reason TEXT,
    estimated_review_hours INTEGER NOT NULL DEFAULT 72,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- After submission, applications can only be edited if admin sent
    -- it back. Enforced in service code; this comment documents intent.
    CHECK (
        (submitted_for_review_at IS NULL)
        OR (admin_decision IS NOT NULL OR admin_review_started_at IS NULL OR admin_decision = 'sent_back')
    )
);

-- Pending-review queue for the admin Provider Review page.
CREATE INDEX idx_onboarding_pending_review
    ON provider_onboarding_progress(submitted_for_review_at)
    WHERE submitted_for_review_at IS NOT NULL AND admin_decision IS NULL;

-- Sent-back queue for the provider's "edit your submission" surface.
CREATE INDEX idx_onboarding_sent_back
    ON provider_onboarding_progress(updated_at)
    WHERE admin_decision = 'sent_back';

COMMIT;
