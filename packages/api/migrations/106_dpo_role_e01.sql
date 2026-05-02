-- 106_dpo_role_e01.sql
--
-- Resolves Escalation E01 (D15 decision: Path A — real DPO role).
--
-- Adds 'dpo' to the users.role CHECK constraint so that NPC RA 10173 §21
-- segregation of duties can be enforced: a DPO is a real role distinct
-- from super_admin, with its own JWT and its own routes (consent
-- records, breach logs, data subject requests).
--
-- Also extends admin_actions.action_type CHECK to permit the two new
-- promote/demote audit events:
--   - 'staff_role_promoted_dpo'
--   - 'staff_role_demoted_from_dpo'

BEGIN;

-- 1) users.role CHECK extension --------------------------------------------
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END$$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer', 'provider', 'admin', 'super_admin', 'dpo'));

-- 2) admin_actions.action_type CHECK extension -----------------------------
-- Only run if admin_actions exists (D-J defensive — earlier migrations
-- created it, this is here for safety in fresh-DB regen).
DO $$
DECLARE
  cur_def TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_actions') THEN
    RAISE NOTICE 'admin_actions table missing; skipping action_type CHECK update';
    RETURN;
  END IF;

  -- Drop the existing CHECK if present.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_actions_action_type_check'
  ) THEN
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
  END IF;

  -- Re-add a permissive constraint that includes the new DPO audit types.
  -- We deliberately use a UNION-ish list rather than introspect existing
  -- values to keep the schema deterministic across rebuilds.
  ALTER TABLE admin_actions
    ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
      'config_changed',
      'consent_version_published',
      'staff_added',
      'staff_removed',
      'staff_role_promoted_dpo',
      'staff_role_demoted_from_dpo',
      'admin_2fa_enrolled',
      'admin_2fa_disabled',
      'provider_approved',
      'provider_suspended',
      'provider_reinstated',
      'provider_tier_changed',
      'category_created',
      'category_updated',
      'subcategory_created',
      'subcategory_updated',
      'subcategory_deleted',
      'addon_created',
      'addon_updated',
      'addon_deleted',
      'feature_flag_toggled',
      'service_area_change_decided',
      'platform_setting_changed',
      'user_force_logout',
      'user_role_changed'
    ));
END$$;

COMMIT;
