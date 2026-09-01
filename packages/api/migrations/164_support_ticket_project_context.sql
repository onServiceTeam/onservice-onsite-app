-- Support cases may originate from a customer planning project without
-- turning that project into a booking or payment record. Existing rows remain
-- unchanged because project_id is nullable.

ALTER TABLE support_tickets
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE support_tickets
    ADD CONSTRAINT support_tickets_single_work_context_check
    CHECK (booking_id IS NULL OR project_id IS NULL);

CREATE INDEX idx_support_tickets_project_id
    ON support_tickets(project_id)
    WHERE project_id IS NOT NULL;

COMMENT ON COLUMN support_tickets.project_id IS
  'Optional customer planning-project context. Mutually exclusive with booking_id; this does not create a project-to-booking or money relationship.';
