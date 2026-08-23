-- Migration 147 — turn tester feedback into an owned admin workflow.
--
-- The public feedback form has been collecting useful customer/provider/admin
-- research since migration 135, but rows only had new/triaged/done and no
-- owner, note, or updated timestamp. All existing rows remain intact. This is
-- additive except for widening the status CHECK to permit an explicit
-- dismissed state for spam, stress tests, and non-actionable submissions.

ALTER TABLE feedback_submissions
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triage_note TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $migration_147$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'feedback_submissions_status_check'
       AND conrelid = 'feedback_submissions'::regclass
  ) THEN
    ALTER TABLE feedback_submissions
      DROP CONSTRAINT feedback_submissions_status_check;
  END IF;

  ALTER TABLE feedback_submissions
    ADD CONSTRAINT feedback_submissions_status_check
    CHECK (status IN ('new', 'triaged', 'done', 'dismissed'));
END
$migration_147$;

CREATE INDEX IF NOT EXISTS idx_feedback_assigned_admin
  ON feedback_submissions (assigned_admin_id, status, updated_at DESC);
