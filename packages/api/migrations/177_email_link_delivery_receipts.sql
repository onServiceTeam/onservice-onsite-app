-- Delivery receipts are not proof of ownership. No plaintext code/job payload.
-- Existing unpublished foundation rows remain explicitly not attempted.
ALTER TABLE email_link_challenges
  ADD COLUMN phone_delivery TEXT NOT NULL DEFAULT 'not_started'
    CHECK (phone_delivery IN ('not_started','attempting','accepted','unknown','unavailable')),
  ADD COLUMN email_delivery TEXT NOT NULL DEFAULT 'not_started'
    CHECK (email_delivery IN ('not_started','attempting','accepted','unknown','unavailable','rejected')),
  ADD COLUMN delivery_started_at TIMESTAMPTZ,
  ADD COLUMN delivery_finished_at TIMESTAMPTZ,
  ADD CONSTRAINT email_link_delivery_timestamps CHECK (
    (phone_delivery='not_started' AND email_delivery='not_started'
      AND delivery_started_at IS NULL AND delivery_finished_at IS NULL)
    OR (phone_delivery<>'not_started' AND email_delivery<>'not_started'
      AND delivery_started_at IS NOT NULL
      AND ((phone_delivery='attempting' AND email_delivery='attempting' AND delivery_finished_at IS NULL)
        OR (phone_delivery<>'attempting' AND email_delivery<>'attempting'
          AND delivery_finished_at IS NOT NULL AND delivery_finished_at>=delivery_started_at)))
  );

COMMENT ON TABLE email_link_challenges IS
  'Private two-factor account-link operations, not login credentials or provider approval. Opt-in authenticated delivery records acceptance separately from ownership. Codes are hashed and cleared at terminal state; bounded cleanup expires proofs and removes old request metadata.';
