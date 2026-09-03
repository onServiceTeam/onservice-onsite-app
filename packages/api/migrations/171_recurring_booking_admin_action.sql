BEGIN;

-- Admin cancellation of a recurring series has written these values since
-- the recurring operations workspace was introduced. The action and target
-- were never appended to the admin_actions CHECK constraints, so Postgres
-- rejected the audit row and rolled the cancellation transaction back.
-- Append to the live definitions to preserve every value introduced by
-- earlier migrations.
DO $migration_171_action$
DECLARE
  current_def TEXT;
  appendage TEXT;
  missing_verbs TEXT[] := ARRAY['recurring_booking_cancelled'];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'admin_actions_action_type_check'
     AND conrelid = 'admin_actions'::regclass;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_action_type_check not found.';
  END IF;

  SELECT string_agg(format('(%L::character varying)::text', item.value), ', ')
    INTO appendage
    FROM unnest(missing_verbs) AS item(value)
   WHERE position('''' || item.value || '''::character varying' IN current_def) = 0;

  IF appendage IS NOT NULL THEN
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    IF current_def ~ '\]\)::text\[\]\)\)\)$' THEN
      EXECUTE format(
        'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
        regexp_replace(
          current_def,
          '\]\)::text\[\]\)\)\)$',
          ', ' || appendage || '])::text[])))'
        )
      );
    ELSE
      EXECUTE format(
        'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
        regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))')
      );
    END IF;
  END IF;
END
$migration_171_action$;

DO $migration_171_target$
DECLARE
  current_def TEXT;
  appendage TEXT;
  missing_targets TEXT[] := ARRAY['recurring_booking'];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'admin_actions_target_type_check'
     AND conrelid = 'admin_actions'::regclass;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_target_type_check not found.';
  END IF;

  SELECT string_agg(format('(%L::character varying)::text', item.value), ', ')
    INTO appendage
    FROM unnest(missing_targets) AS item(value)
   WHERE position('''' || item.value || '''::character varying' IN current_def) = 0;

  IF appendage IS NOT NULL THEN
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_target_type_check;
    IF current_def ~ '\]\)::text\[\]\)\)\)$' THEN
      EXECUTE format(
        'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check %s',
        regexp_replace(
          current_def,
          '\]\)::text\[\]\)\)\)$',
          ', ' || appendage || '])::text[])))'
        )
      );
    ELSE
      EXECUTE format(
        'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check %s',
        regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))')
      );
    END IF;
  END IF;
END
$migration_171_target$;

COMMIT;
