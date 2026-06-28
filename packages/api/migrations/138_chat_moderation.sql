-- Migration 138 — Admin chat moderation surface (D26 step 1).
--
-- Adds moderation state to messages so admins can:
--   * redact (soft-hide) a message from the participants while keeping the
--     original content for the audit trail,
--   * record a user-initiated report on a message,
--   * mark an auto-flag (platform-bypass) or report as reviewed/handled.
--
-- Also appends the three admin_actions verbs the moderation endpoints emit,
-- using the same APPEND-ONLY splice pattern as migration 121 so the
-- constraint-regression guard keeps seeing a true superset.

-- ── Moderation columns on messages ──────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS redacted_at      TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS redacted_by      UUID REFERENCES users(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS redaction_reason TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reported_at      TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reported_by      UUID REFERENCES users(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS report_reason    TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS flag_reviewed_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS flag_reviewed_by UUID REFERENCES users(id);

-- Review-queue lookups: open reports, and flagged-but-not-yet-reviewed.
CREATE INDEX IF NOT EXISTS idx_messages_reported
  ON messages(reported_at) WHERE reported_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_flag_unreviewed
  ON messages(created_at) WHERE is_flagged = TRUE AND flag_reviewed_at IS NULL;

-- ── Append moderation admin_actions verbs (append-only splice) ───────────────
DO $migration_138$
DECLARE
  current_def TEXT;
  needs_widen BOOLEAN := FALSE;
  v TEXT;
  missing_verbs TEXT[] := ARRAY[
    'conversation_viewed',     -- admin opened a private conversation thread (PII access log)
    'message_redacted',        -- admin soft-hid a message from participants
    'message_flag_reviewed'    -- admin marked an auto-flag / user report as handled
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
    RAISE NOTICE 'Migration 138 — no widening needed; all 3 moderation verbs already present.';
    RETURN;
  END IF;

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

  RAISE NOTICE 'Migration 138 applied: 3 moderation admin_actions verbs appended via splice.';
END
$migration_138$;
