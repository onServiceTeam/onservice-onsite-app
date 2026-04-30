-- Phase 14 Dispatch 06 — soft-delete columns for Bugs 80, 105, 127.
--
-- The transactional-audit fix requires these three tables to support
-- soft delete (instead of hard DELETE) so the deletion + the
-- admin_actions audit row can land inside a single db.transaction
-- without the FK from the audit row's target_id back to the deleted
-- row being orphaned.
--
-- Affected tables:
--   - provider_admin_notes  (Bugs 80, 82)  — admin notes about providers
--   - business_members      (Bug 105)      — B2B account members
--   - admin_roles           (Bug 127)      — RBAC roles
--
-- Convention (matches Phase 13 audit standard):
--   - deleted_at      TIMESTAMPTZ      — NULL means active.
--   - deleted_by      UUID             — admin user id who soft-deleted.
--                                        FK to users(id) ON DELETE SET NULL
--                                        so user purges (NPC right-to-erasure)
--                                        don't cascade-destroy audit data.
--   - deleted_reason  TEXT             — operator-provided rationale.
--
-- Read-side filtering:
-- All read queries that previously assumed every row is active must add
-- `WHERE deleted_at IS NULL` to skip soft-deleted rows. The D06 service
-- code applies this filter consistently. A retention-purge cron is out
-- of scope for D06; per the spec, hard purge of soft-deleted rows older
-- than the BIR/NPC retention windows is a Dispatch 14 concern.
--
-- Indexes:
-- Each table gets a partial index on deleted_at IS NULL so the active
-- subset stays fast without bloating the existing indexes.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- (1) provider_admin_notes — Bugs 80 + 82
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE provider_admin_notes
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_provider_admin_notes_active
    ON provider_admin_notes(provider_id, pinned DESC, created_at DESC)
    WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- (2) business_members — Bug 105
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE business_members
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_business_members_active
    ON business_members(business_account_id, user_id)
    WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- (3) admin_roles — Bug 127
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE admin_roles
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_roles_active
    ON admin_roles(name)
    WHERE deleted_at IS NULL;

COMMIT;
