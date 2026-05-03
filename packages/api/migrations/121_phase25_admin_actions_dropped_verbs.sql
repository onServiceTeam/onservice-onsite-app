-- Migration 121 — Phase 25d second-order audit-verb fix.
--
-- The Phase 25d constraint-regression guard discovered that migration 119
-- (Phase 19) dropped 19 verbs from migration 106's original CHECK. Phase 24a
-- found 11 of those (the ones the code emits via direct INSERT). Phase 25d's
-- forensic also looked at writeAdminAction() wrapper calls and found TWO
-- MORE verbs the code actively emits that the live CHECK still rejects:
--
--   1. dsr_marked_complete    — emitted by compliance-admin.service.ts:146
--                                via writeAdminAction(). The wrapper has a
--                                try/catch that silently warn-logs the
--                                check_violation, so the DSR completion
--                                request succeeds but the audit row never
--                                lands. NPC RA 10173 §22 violation:
--                                processing-activity records are required.
--                                MED severity (silent failure, not 500).
--
--   2. dsr_escalated_to_npc   — emitted by compliance-admin.service.ts:345.
--                                Same wrapper, same silent failure pattern.
--                                Critical for regulator-facing trail since
--                                NPC escalation is itself a compliance event.
--
-- This migration also adds back the 6 verbs that migration 106 originally
-- declared but the code never emits. These are dead today, but adding them
-- back makes the live CHECK a true superset of every historical declaration,
-- which is what the regression guard (PART A) requires. Wiring future
-- features that emit these verbs will Just Work without yet another splice.
--
--   3. provider_commission_adjusted   — anticipated (admin tier-change UI)
--   4. provider_banned                — anticipated (admin permanent ban)
--   5. dsr_action_dispatched          — anticipated (DSR routing audit)
--   6. provider_document_approved     — anticipated (KYC review path)
--   7. provider_document_rejected     — anticipated (KYC review path)
--   8. pii_reveal                     — anticipated (super-admin reveal logging,
--                                        per pii-mask.ts:138 design note)

DO $migration_121$
DECLARE
  current_def TEXT;
  needs_widen BOOLEAN := FALSE;
  v TEXT;
  missing_verbs TEXT[] := ARRAY[
    'dsr_marked_complete',
    'dsr_escalated_to_npc',
    'provider_commission_adjusted',
    'provider_banned',
    'dsr_action_dispatched',
    'provider_document_approved',
    'provider_document_rejected',
    'pii_reveal'
  ];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'admin_actions_action_type_check'
     AND conrelid = 'admin_actions'::regclass;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_action_type_check not found.';
  END IF;

  FOREACH v IN ARRAY missing_verbs LOOP
    IF position('''' || v || '''::character varying' IN current_def) = 0 THEN
      needs_widen := TRUE;
      EXIT;
    END IF;
  END LOOP;

  IF NOT needs_widen THEN
    RAISE NOTICE 'Migration 121 — no widening needed; all 8 verbs already present.';
    RETURN;
  END IF;

  -- Use the splice pattern (same as migration 116) so we never replace
  -- the existing list — we only APPEND. This makes the migration a true
  -- superset operation that the constraint-regression guard accepts.
  --
  -- Build the appendage in a separate variable to dodge the PL/pgSQL
  -- vs. SQL column-name ambiguity that bites unnest(...) AS t(v) when
  -- a parameter named `v` is in scope.
  DECLARE
    appendage TEXT;
  BEGIN
    SELECT string_agg(format('%L::character varying', m.verb), ', ')
      INTO appendage
      FROM unnest(missing_verbs) AS m(verb)
     WHERE position('''' || m.verb || '''::character varying' IN current_def) = 0;

    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    EXECUTE format(
      'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
      regexp_replace(
        current_def,
        '\]\)::text\[\]\)\)\)$',
        ', ' || appendage || '])::text[])))'
      )
    );
  END;

  RAISE NOTICE 'Migration 121 applied: 8 dropped admin_actions verbs restored via splice.';
END
$migration_121$;
