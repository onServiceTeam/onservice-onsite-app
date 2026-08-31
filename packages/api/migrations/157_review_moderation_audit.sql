-- Provider360 review moderation must be attributable and reconstructable.
-- Adds explicit verbs for visibility and public-response changes, plus a
-- first-class review target. It also registers certification review auditing
-- and repairs provider-staff verbs/target introduced in application code
-- without a matching constraint migration.
--
-- IMPORTANT: append to the live definitions. Earlier explicit DROP+ADD
-- migrations accidentally removed newer verbs. The splice pattern preserves
-- every value present after migrations 119, 120, 121, 138 and 149.

DO $migration_157_action$
DECLARE
  current_def TEXT;
  appendage TEXT;
  missing_verbs TEXT[] := ARRAY[
    'provider_staff_approved',
    'provider_staff_rejected',
    'provider_staff_sent_back',
    'provider_staff_suspended',
    'provider_staff_reactivated',
    'provider_certification_verified',
    'provider_certification_unverified',
    'review_visibility_changed',
    'review_response_updated'
  ];
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

  IF appendage IS NULL THEN
    RAISE NOTICE 'Migration 157 — all review/provider-staff action verbs already allowed.';
  ELSE
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    EXECUTE format(
      'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
      regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))')
    );
  END IF;
END
$migration_157_action$;

DO $migration_157_target$
DECLARE
  current_def TEXT;
  appendage TEXT;
  missing_targets TEXT[] := ARRAY['provider_staff', 'provider_certification', 'review'];
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
    RAISE NOTICE 'Migration 157 — provider staff, certification, and review targets already allowed.';
  ELSE
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_target_type_check;
    IF current_def ~ '\]\)::text\[\]\)\)\)$' THEN
      -- PostgreSQL may preserve the older whole-array cast shape:
      --   ANY ((ARRAY['a'::varchar, ...])::text[])
      -- Insert before that array's closing bracket. Anchoring only on the
      -- final `])))` would match the bracket in `text[]` and produce the
      -- invalid token `text[, ...]` on a fresh database.
      EXECUTE format(
        'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check %s',
        regexp_replace(
          current_def,
          '\]\)::text\[\]\)\)\)$',
          ', ' || appendage || '])::text[])))'
        )
      );
    ELSE
      -- Newer constraints are normally deparsed in per-element-cast form.
      EXECUTE format(
        'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check %s',
        regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))')
      );
    END IF;
  END IF;
END
$migration_157_target$;

COMMENT ON COLUMN admin_actions.action_type IS
    'Audited admin verb. Review moderation and provider-staff verbs extended by migration 157.';
