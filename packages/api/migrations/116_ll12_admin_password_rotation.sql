-- LAUNCH-LIMITATIONS #12 fix — proactive rotation for legacy password hashes.
--
-- Pre-fix: when an admin logs in with a hash stored under the legacy
-- format (or with weaker scrypt parameters), the API rehashes inside
-- the same login. If they NEVER log in again, the legacy hash sits
-- forever and the SEC hardening migration is incomplete. There was
-- no mechanism to PROACTIVELY require those accounts to rotate.
--
-- Post-fix:
--   1. users.must_rotate_password — a flag the super_admin can set on
--      legacy-hash accounts (or any account, e.g., suspected
--      compromise). Login still succeeds (so the admin can change
--      the password) but the response carries `mustRotatePassword: true`
--      so the admin web app gates routing — only the change-password
--      screen is reachable until the flag clears.
--   2. admin_actions CHECK widened with two new action types so the
--      flagging operation + each rotation lands in the audit log.
--
-- Migration is idempotent.

-- ── Column add ──────────────────────────────────────────────────────

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_rotate_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.must_rotate_password IS
  'LAUNCH-LIMITATIONS #12 — when TRUE the next successful login returns mustRotatePassword:true and the admin web app routes the user straight to the change-password screen. Cleared automatically when the password is rotated. Initially set by a super_admin via /admin/security/flag-legacy-hashes (legacy scrypt rotation) or via the admin_actions force-rotate path (compromise response).';

-- Partial index — the count + flag operations both filter on this
-- predicate so an index keeps the hot path fast at any user-table size.
CREATE INDEX IF NOT EXISTS idx_users_must_rotate_password
    ON users (must_rotate_password)
    WHERE must_rotate_password = TRUE;

-- ── admin_actions CHECK widening ────────────────────────────────────
-- The CHECK has been re-set wholesale several times (mig 100 / 103 /
-- 106). Migration 106 narrowed the list aggressively and dropped many
-- legacy types that earlier migrations included; further service code
-- still emits the older types and the runtime tolerates the
-- mismatched CHECK as long as the values it inserts are in the latest
-- list. To avoid clobbering the canonical list yet again, this
-- migration uses a DO block that introspects the existing CHECK and
-- appends only what's missing.

DO $$
DECLARE
    cur_def TEXT;
BEGIN
    -- Skip if admin_actions doesn't exist (fresh DB safety net).
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_actions') THEN
        RAISE NOTICE 'admin_actions table missing; skipping CHECK widening';
        RETURN;
    END IF;

    SELECT pg_get_constraintdef(oid) INTO cur_def
      FROM pg_constraint
     WHERE conname = 'admin_actions_action_type_check';

    -- No existing CHECK → add a permissive one with both new types.
    IF cur_def IS NULL THEN
        ALTER TABLE admin_actions
            ADD CONSTRAINT admin_actions_action_type_check
            CHECK (action_type IN (
                'legacy_password_rotation_flagged',
                'admin_password_rotated'
            ));
        RETURN;
    END IF;

    -- Existing CHECK present. Append only if the new types aren't in it.
    -- pg_get_constraintdef serialises an ANY(ARRAY[...]) CHECK with a
    -- shape like:
    --   CHECK (((action_type)::text = ANY ((ARRAY['a'::character varying, ...])::text[])))
    -- The closing punctuation is ARRAY's `]`, then `::text[])` (the
    -- ARRAY cast), then `)` (closing the ANY arg list), then `)`
    -- (closing the outer expression). We splice new values right
    -- before the ARRAY's closing `]` so they get the same
    -- `::character varying` cast as the existing entries.
    IF position('legacy_password_rotation_flagged' in cur_def) = 0
       OR position('admin_password_rotated' in cur_def) = 0 THEN
        ALTER TABLE admin_actions
            DROP CONSTRAINT admin_actions_action_type_check;
        EXECUTE format(
            'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
            regexp_replace(
                cur_def,
                '\]\)::text\[\]\)\)\)$',
                ', ''legacy_password_rotation_flagged''::character varying, ''admin_password_rotated''::character varying])::text[])))'
            )
        );
    END IF;
END$$;

-- ── Backfill: NO automatic flagging at migration time ───────────────
-- The mig is intentionally non-destructive — flipping must_rotate_password
-- on every legacy-hash account at apply time would hard-block them
-- without warning. Operator runs the new admin endpoint
-- POST /admin/security/flag-legacy-hashes from the Settings UI when
-- they're ready to begin the rotation campaign.
