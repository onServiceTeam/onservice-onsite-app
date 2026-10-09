-- Additive private delivery metadata, never a proof of email ownership.
-- There is no plaintext code/address queue or automatic retry after uncertainty.
ALTER TABLE email_sign_in_challenges
  ADD COLUMN delivery_state TEXT NOT NULL DEFAULT 'not_started'
    CHECK (delivery_state IN ('not_started','attempting','accepted','unknown','unavailable','rejected')),
  ADD COLUMN delivery_started_at TIMESTAMPTZ,
  ADD COLUMN delivery_finished_at TIMESTAMPTZ,
  ADD CONSTRAINT email_sign_in_delivery_timestamps CHECK (
    (delivery_state='not_started' AND delivery_started_at IS NULL AND delivery_finished_at IS NULL)
    OR (delivery_state='attempting' AND delivery_started_at IS NOT NULL AND delivery_finished_at IS NULL)
    OR (delivery_state IN ('accepted','unknown','unavailable','rejected')
      AND delivery_started_at IS NOT NULL AND delivery_finished_at IS NOT NULL
      AND delivery_finished_at>=delivery_started_at)
  );

COMMENT ON COLUMN email_sign_in_challenges.delivery_state IS
  'Private one-attempt delivery receipt. attempting after interruption is uncertain, not permission to resend. Public request receipts never disclose this state. Proof consumption and delivery acknowledgement are independent.';
