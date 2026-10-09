-- E35/E74: one immutable decision on an exact preserved submission. No legacy
-- reconstruction, resubmission, backfill or account-role change is performed.
CREATE TABLE provider_application_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  revision_id UUID NOT NULL UNIQUE,
  decided_by UUID NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  checklist_summary TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (provider_id, revision_id) REFERENCES provider_application_revisions(provider_id, id),
  CHECK ((decision = 'approved' AND checklist_summary IS NOT NULL
          AND char_length(btrim(checklist_summary)) BETWEEN 20 AND 5000)
    OR (decision = 'rejected' AND checklist_summary IS NULL AND char_length(reason) <= 1000))
);
CREATE INDEX provider_application_decisions_provider
  ON provider_application_decisions(provider_id, decided_at, id);
CREATE FUNCTION reject_provider_application_decision_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Application decisions cannot be overwritten or routinely deleted'
    USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER provider_application_decisions_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON provider_application_decisions
FOR EACH STATEMENT EXECUTE FUNCTION reject_provider_application_decision_mutation();
COMMENT ON TABLE provider_application_decisions IS
  'Private exact-submission review history. Provider status remains operational authority. No legacy reconstruction. Mutation protection is not an indefinite-retention policy; governed E21 erasure and backups remain required.';
