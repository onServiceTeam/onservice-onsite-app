-- Migration 149 — make payout completion a first-class audited admin action.
--
-- Payout completion moves a provider's reserved wallet balance after the
-- external transfer has been sent. The service now writes an atomic
-- admin_actions row with action_type='payout_completed'. Append the verb to the
-- current CHECK without replacing any verbs added by earlier migrations.

DO $migration_149$
DECLARE
  current_def TEXT;
  appendage TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'admin_actions_action_type_check'
     AND conrelid = 'admin_actions'::regclass;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_action_type_check not found.';
  END IF;

  IF position('''payout_completed''::character varying' IN current_def) > 0 THEN
    RAISE NOTICE 'Migration 149 — payout_completed is already allowed.';
    RETURN;
  END IF;

  appendage := '(''payout_completed''::character varying)::text';
  ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
  EXECUTE format(
    'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
    regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))')
  );

  RAISE NOTICE 'Migration 149 applied: payout_completed appended to admin action verbs.';
END
$migration_149$;
