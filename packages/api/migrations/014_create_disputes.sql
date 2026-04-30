-- Migration: Create disputes, dispute_evidence, admin_actions tables (Sprint 4)
-- Implements FR-053 dispute transitions.
-- Replaces the simpler dispute schema from migration 008.
--
-- DEPRECATION NOTE (Phase 14 D04 — Ken decision 2026-04-30, Option A pull):
-- The original Sprint-4 plan also implemented SiguradoShield™ (Chapter 7
-- in-house insurance product). SiguradoShield is deferred to v1.1+ pending
-- Insurance Commission license OR licensed-insurer partnership. The dispute
-- tables in this migration remain in production and are used for the
-- regular escrow dispute flow (no insurance claims). When/if Layer 2 is
-- wired in v1.1+, a NEW migration adds claim-specific tables; this migration
-- file is immutable historical record. See LAUNCH-LIMITATIONS §23 and
-- .ai-coder/decisions/D04-siguradoshield.md.

DROP TABLE IF EXISTS dispute_messages CASCADE;
DROP TABLE IF EXISTS dispute_evidence CASCADE;
DROP TABLE IF EXISTS disputes CASCADE;

CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id),
    filed_by UUID NOT NULL REFERENCES users(id),
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('no_show', 'incomplete', 'substandard', 'damage', 'theft', 'overcharge', 'other')),
    description TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'escalated', 'resolved')),
    tier SMALLINT NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 3),
    assigned_to UUID REFERENCES users(id),
    resolution_type VARCHAR(30)
        CHECK (resolution_type IS NULL OR resolution_type IN (
            'full_refund', 'partial_refund', 'no_refund', 'free_redo',
            'refund_with_warning', 'refund_with_suspension', 'split_decision'
        )),
    refund_amount BIGINT DEFAULT 0,
    refund_percent DECIMAL(5,2),
    decision_notes TEXT,
    internal_notes TEXT,
    provider_response TEXT,
    provider_responded_at TIMESTAMPTZ,
    auto_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_resolution CHECK (
        (status != 'resolved') OR (resolution_type IS NOT NULL AND decision_notes IS NOT NULL)
    )
);

CREATE INDEX idx_disputes_booking ON disputes(booking_id);
CREATE INDEX idx_disputes_filed_by ON disputes(filed_by);
CREATE INDEX idx_disputes_status ON disputes(status, created_at);
CREATE INDEX idx_disputes_assigned ON disputes(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_disputes_tier ON disputes(tier, status);

CREATE TABLE dispute_evidence (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    evidence_type VARCHAR(20) NOT NULL
        CHECK (evidence_type IN ('photo', 'video', 'document')),
    file_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispute_evidence_dispute ON dispute_evidence(dispute_id);

CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    admin_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL
        CHECK (action_type IN (
            'provider_approved', 'provider_suspended', 'provider_reactivated',
            'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
            'customer_suspended', 'customer_reactivated', 'customer_credited',
            'booking_cancelled', 'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
            'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued'
        )),
    target_type VARCHAR(30) NOT NULL
        CHECK (target_type IN ('provider', 'customer', 'booking', 'dispute', 'payout', 'config')),
    target_id UUID NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin ON admin_actions(admin_id);
CREATE INDEX idx_admin_actions_target ON admin_actions(target_type, target_id);
CREATE INDEX idx_admin_actions_type ON admin_actions(action_type);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);
