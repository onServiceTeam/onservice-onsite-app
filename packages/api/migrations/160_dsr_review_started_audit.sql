-- A received privacy request needs an explicit claim/start-review action.
-- Append the audit verb without replacing any prior verb in the live CHECK.

DO $migration_160_action$
DECLARE
  current_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'admin_actions_action_type_check'
     AND conrelid = 'admin_actions'::regclass;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_action_type_check not found.';
  END IF;

  IF position('''dsr_review_started''::character varying' IN current_def) > 0 THEN
    RAISE NOTICE 'Migration 160 — dsr_review_started already allowed.';
  ELSE
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    EXECUTE format(
      'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
      regexp_replace(
        current_def,
        '\]\)\)\)$',
        ', (''dsr_review_started''::character varying)::text])))'
      )
    );
  END IF;
END
$migration_160_action$;

COMMENT ON COLUMN admin_actions.action_type IS
  'Audited admin verb. DSR review-claim auditing extended by migration 160.';
