-- Phase 11 — Compliance Center: NPC consent + DSR tracking
-- Two new tables, no changes to existing schema. PKs use uuidv7() to match
-- migration 009 style. consent_type intentionally has NO CHECK constraint —
-- the app layer keeps it flexible so new consent surfaces can be added
-- without a migration.

CREATE TABLE consent_records (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL,
        -- Examples: 'tos_acceptance', 'privacy_policy', 'marketing_email',
        -- 'marketing_sms', 'data_sharing_partners', 'biometric_processing'
    version VARCHAR(20) NOT NULL,
    granted BOOLEAN NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_consent_user_type ON consent_records(user_id, consent_type);

-- Data subject requests (NPC: right to access, erasure, correction, portability,
-- restriction, objection). Statutory response window is 15 days.
CREATE TABLE data_subject_requests (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id),
    request_type VARCHAR(20) NOT NULL
        CHECK (request_type IN ('access', 'erasure', 'correction', 'portability', 'restriction', 'objection')),
    status VARCHAR(20) NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'in_progress', 'completed', 'rejected')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    handled_by UUID REFERENCES users(id),
    user_message TEXT,
    admin_notes TEXT,
    response_payload_url TEXT,
    rejection_reason TEXT
);

CREATE INDEX idx_dsr_status_due ON data_subject_requests(status, due_at)
    WHERE status IN ('received', 'in_progress');
CREATE INDEX idx_dsr_user ON data_subject_requests(user_id);
