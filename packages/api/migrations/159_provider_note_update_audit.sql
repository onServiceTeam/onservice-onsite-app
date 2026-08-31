-- Provider 360 note edits must be attributable, including pin changes.
-- Append the verb to the live CHECK definition so no verb introduced by an
-- earlier migration is lost.

DO $migration_159_action$
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

  IF position('''provider_note_updated''::character varying' IN current_def) > 0 THEN
    RAISE NOTICE 'Migration 159 — provider_note_updated already allowed.';
  ELSE
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    EXECUTE format(
      'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
      regexp_replace(
        current_def,
        '\]\)\)\)$',
        ', (''provider_note_updated''::character varying)::text])))'
      )
    );
  END IF;
END
$migration_159_action$;

COMMENT ON COLUMN admin_actions.action_type IS
  'Audited admin verb. Provider-note edit auditing extended by migration 159.';
