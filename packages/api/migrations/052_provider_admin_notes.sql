-- Migration 052: provider_admin_notes
-- Phase 05 — Provider 360 internal notes (NOT visible to provider).
-- Notes can be pinned, categorized, and edited/deleted by author or super admin.

CREATE TABLE provider_admin_notes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    category VARCHAR(20) NOT NULL DEFAULT 'general'
        CHECK (category IN ('general', 'quality', 'financial', 'legal')),
    body TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_notes_provider
    ON provider_admin_notes(provider_id, pinned DESC, created_at DESC);
