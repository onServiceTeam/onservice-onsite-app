-- Separate sign-in purpose. Neither a contact email nor a completed linking
-- response is a login proof. No backfill, account creation or public enablement.
CREATE TABLE email_sign_in_challenges (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose='sign_in'),
  recipient_hash TEXT NOT NULL CHECK (recipient_hash ~ '^[a-f0-9]{64}$'),
  identity_proof_id UUID,
  role TEXT CHECK (role IN ('customer','provider','provider_staff')),
  session_version INTEGER CHECK (session_version > 0),
  phone TEXT CHECK (phone ~ '^\+63[0-9]{10}$'),
  request_ip INET NOT NULL,
  code_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','consumed','invalidated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  CHECK ((user_id IS NULL AND identity_proof_id IS NULL AND role IS NULL
            AND session_version IS NULL AND phone IS NULL)
    OR (user_id IS NOT NULL AND identity_proof_id IS NOT NULL AND role IS NOT NULL
            AND session_version IS NOT NULL AND phone IS NOT NULL)),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '10 minutes'),
  CHECK (attempts <= max_attempts),
  CHECK ((state='pending' AND code_hash IS NOT NULL AND finished_at IS NULL)
      OR (state<>'pending' AND code_hash IS NULL AND finished_at IS NOT NULL))
);
CREATE INDEX email_sign_in_recipient ON email_sign_in_challenges(recipient_hash,created_at);
CREATE INDEX email_sign_in_ip ON email_sign_in_challenges(request_ip,created_at);
CREATE INDEX email_sign_in_account ON email_sign_in_challenges(user_id,created_at);
CREATE UNIQUE INDEX email_sign_in_one_pending ON email_sign_in_challenges(recipient_hash) WHERE state='pending';
CREATE INDEX email_sign_in_expiry ON email_sign_in_challenges(expires_at,id) WHERE state='pending';
CREATE INDEX email_sign_in_retention ON email_sign_in_challenges(created_at,id) WHERE state<>'pending';

COMMENT ON TABLE email_sign_in_challenges IS
  'Internal single-use email sign-in proofs, not linking/recovery authority. Unknown/ineligible recipients have an unowned decoy. Recipient digests remain private metadata, not anonymization. No plaintext code/email or reusable session is retained here. Public delivery, neutral HTTP and lifecycle acceptance are separate enablement requirements.';
