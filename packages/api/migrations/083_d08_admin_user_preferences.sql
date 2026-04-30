-- Phase 14 Dispatch 08 — Bug 282.
-- Admin saved filters per page.
--
-- Pre-D08 admins re-applied the same filters every visit on Bookings,
-- Disputes, Payouts, Audit Log, etc. This migration adds a key-value
-- table for per-admin per-page filter persistence.
--
-- The admin UI reads/writes filters by (admin_user_id, page_key)
-- where page_key = 'bookings' | 'disputes' | 'payouts' | 'audit-log' etc.
-- The actual filter shape is JSONB so each page can store whatever
-- structure it needs without schema migration churn.

BEGIN;

CREATE TABLE admin_user_preferences (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_key TEXT NOT NULL,
    saved_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    saved_filters_name TEXT,                    -- optional name like "My weekly review"
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (admin_user_id, page_key, COALESCE(saved_filters_name, ''))
);

CREATE INDEX idx_admin_user_prefs_user_page
    ON admin_user_preferences(admin_user_id, page_key);

-- One default per (admin_user, page_key) — the partial unique index
-- enforces this without preventing multiple named saved filters.
CREATE UNIQUE INDEX idx_admin_user_prefs_default
    ON admin_user_preferences(admin_user_id, page_key)
    WHERE is_default = TRUE;

COMMIT;
