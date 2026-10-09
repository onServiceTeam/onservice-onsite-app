-- Additive indexes for bounded verification-secret expiry and request cleanup.
-- No record deletion, cutoff/backfill or change to identity ownership occurs.
CREATE INDEX email_link_challenges_pending_expiry
  ON email_link_challenges(expires_at, id) WHERE state = 'pending';
CREATE INDEX email_link_challenges_terminal_retention
  ON email_link_challenges(created_at, id) WHERE state <> 'pending';
