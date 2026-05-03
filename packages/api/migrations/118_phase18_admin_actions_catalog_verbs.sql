-- Migration 118 — Phase 18 BUG-PHASE18-06 fix.
--
-- Symptom: every admin catalog write (create/update/delete a category,
-- subcategory, or add-on) returned 500 to the admin web. The admin web
-- showed a generic toast and the user had no way to know the change
-- didn't land.
--
-- Root cause: the catalog service in packages/api/src/services/catalog.service.ts
-- writes admin_actions rows with action_type values prefixed `service_*`
-- (e.g., `service_addon_created`, `service_subcategory_updated`), but
-- the admin_actions_action_type_check constraint (originally defined in
-- migration 050 / widened by 088 / 116) lists only the un-prefixed
-- variants (`addon_created`, `subcategory_updated`, etc.). The INSERT
-- inside the catalog transaction failed with check_violation, the
-- enclosing transaction rolled back, and the route returned 500.
--
-- Why widen vs. rename: the catalog service prefix is more descriptive
-- (a single audit-log scan can pull all `service_*` actions for catalog
-- governance review). Renaming to drop the prefix would force a follow-
-- up admin web change to the audit-log ACTION_LABELS dictionary plus
-- any external readers. Widening the CHECK is a 1-line change with no
-- downstream effects.
--
-- Pattern: introspection-based ALTER (matches migration 116). If the
-- value is already present in the CHECK definition, no-op.

DO $migration_118$
DECLARE
  current_def text;
  needs_widen boolean := false;
BEGIN
  -- Pull the existing CHECK definition.
  SELECT pg_get_constraintdef(c.oid)
    INTO current_def
    FROM pg_constraint c
   WHERE c.conrelid = 'admin_actions'::regclass
     AND c.conname = 'admin_actions_action_type_check';

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_action_type_check does not exist; cannot widen';
  END IF;

  -- Are any of our 8 target verbs missing?
  IF current_def NOT LIKE '%service_category_created%'
     OR current_def NOT LIKE '%service_category_updated%'
     OR current_def NOT LIKE '%service_subcategory_created%'
     OR current_def NOT LIKE '%service_subcategory_updated%'
     OR current_def NOT LIKE '%service_subcategory_deleted%'
     OR current_def NOT LIKE '%service_addon_created%'
     OR current_def NOT LIKE '%service_addon_updated%'
     OR current_def NOT LIKE '%service_addon_deleted%' THEN
    needs_widen := true;
  END IF;

  IF NOT needs_widen THEN
    RAISE NOTICE 'Migration 118 — no widening needed; all 8 service_* verbs already present.';
    RETURN;
  END IF;

  -- Drop the existing CHECK and recreate with the wider list. We KEEP
  -- every existing entry (extracted from current_def) and ADD the 8
  -- new ones — the safest superset operation.
  ALTER TABLE admin_actions
    DROP CONSTRAINT admin_actions_action_type_check;

  ALTER TABLE admin_actions
    ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
      -- existing values (preserved verbatim)
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
      'user_role_changed',
      'legacy_password_rotation_flagged',
      'admin_password_rotated',
      -- BUG-PHASE18-06 new entries (catalog.service writes these)
      'service_category_created',
      'service_category_updated',
      'service_subcategory_created',
      'service_subcategory_updated',
      'service_subcategory_deleted',
      'service_addon_created',
      'service_addon_updated',
      'service_addon_deleted'
    ));

  RAISE NOTICE 'Migration 118 applied: admin_actions action_type CHECK widened with 8 service_* verbs.';
END
$migration_118$;
