BEGIN;

-- E55 business controls use first-class account, contract, and statement
-- targets so each audited decision can retain the exact record it changed.
-- Migration 166 added the matching action verbs but did not add these target
-- names to the existing CHECK constraint. Append to the live definition so
-- target values introduced by every earlier migration remain valid.
DO $migration_169_target$
DECLARE
  current_def TEXT;
  appendage TEXT;
  missing_targets TEXT[] := ARRAY[
    'business_account',
    'business_contract',
    'business_invoice'
  ];
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

  IF appendage IS NULL THEN
    RAISE NOTICE 'Migration 169 - all B2B audit target types already allowed.';
  ELSE
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
$migration_169_target$;

COMMIT;
