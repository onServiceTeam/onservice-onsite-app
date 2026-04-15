-- Migration: Create disputes table
-- 3-tier dispute resolution system

CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id),
    filed_by UUID NOT NULL REFERENCES users(id),
    against UUID NOT NULL REFERENCES users(id),
    tier INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 3),
    status VARCHAR(30) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'escalated', 'resolved', 'closed')),
    category VARCHAR(50) NOT NULL
        CHECK (category IN (
            'poor_quality', 'incomplete_work', 'no_show', 'overcharge',
            'property_damage', 'safety_concern', 'harassment', 'fraud', 'other'
        )),
    description TEXT NOT NULL,
    resolution TEXT,
    refund_amount INTEGER DEFAULT 0,     -- in centavos
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disputes_booking ON disputes(booking_id);
CREATE INDEX idx_disputes_filed_by ON disputes(filed_by);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_tier ON disputes(tier);

-- Dispute evidence
CREATE TABLE dispute_evidence (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users(id),
    evidence_type VARCHAR(20) NOT NULL
        CHECK (evidence_type IN ('text', 'image', 'screenshot')),
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_dispute ON dispute_evidence(dispute_id);

-- Dispute messages (communication between parties and admin)
CREATE TABLE dispute_messages (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_admin_message BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispute_messages_dispute ON dispute_messages(dispute_id);
