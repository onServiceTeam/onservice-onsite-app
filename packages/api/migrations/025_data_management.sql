-- Phase 5 Medium Issues 131-150: Data Management & Privacy Compliance
-- Customer data export (RA 10173 right to portability), account deletion, anonymization

-- 1. Data export requests — tracks customer-initiated data export
CREATE TABLE data_export_requests (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
    format VARCHAR(10) NOT NULL DEFAULT 'json'
        CHECK (format IN ('json', 'csv')),
    file_url TEXT,
    file_size_bytes BIGINT,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_export_user ON data_export_requests(user_id);
CREATE INDEX idx_data_export_status ON data_export_requests(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_data_export_expires ON data_export_requests(expires_at) WHERE status = 'completed';

-- 2. Account deletion requests — 30-day cooling period per DPA
CREATE TABLE account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'cooling_off', 'processing', 'completed', 'cancelled')),
    reason TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cooling_off_ends_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_deletion_user ON account_deletion_requests(user_id);
CREATE INDEX idx_account_deletion_status ON account_deletion_requests(status)
    WHERE status IN ('pending', 'cooling_off', 'processing');
CREATE INDEX idx_account_deletion_cooldown ON account_deletion_requests(cooling_off_ends_at)
    WHERE status = 'cooling_off';
