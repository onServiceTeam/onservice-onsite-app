-- Migration 170: explicit Business Account context for support cases.
--
-- The case remains owned by one user account. The optional company link is an
-- additional support dimension and may accompany a booking only when service
-- validation proves that booking belongs to the same company. Planning
-- projects are still personal/customer context and cannot be relabelled as a
-- Business Account case. Existing rows remain unchanged.

ALTER TABLE support_tickets
  ADD COLUMN business_account_id UUID
    REFERENCES business_accounts(id) ON DELETE SET NULL;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_project_business_context_check
    CHECK (project_id IS NULL OR business_account_id IS NULL);

CREATE INDEX support_tickets_business_account_lookup
  ON support_tickets (business_account_id, updated_at DESC)
  WHERE business_account_id IS NOT NULL;

COMMENT ON COLUMN support_tickets.business_account_id IS
  'Optional Business Account support context. May accompany a matching booking; mutually exclusive with personal planning-project context.';
