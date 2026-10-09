-- Additive foundation only. A legacy contact email is NOT an authenticated
-- identity. No users are backfilled, merged, promoted or made phone-less.
CREATE TABLE sign_in_email_identities (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = btrim(email)),
  email_key TEXT COLLATE "C" NOT NULL UNIQUE CHECK (email_key = lower(email COLLATE "C")),
  proof_id UUID NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE email_link_challenges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose = 'link_email'),
  role TEXT NOT NULL CHECK (role IN ('customer', 'provider', 'provider_staff')),
  session_version INTEGER NOT NULL CHECK (session_version > 0),
  phone TEXT NOT NULL CHECK (phone ~ '^\+63[0-9]{10}$'),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = btrim(email)),
  email_key TEXT COLLATE "C" NOT NULL CHECK (email_key = lower(email COLLATE "C")),
  request_ip INET NOT NULL,
  phone_code_hash TEXT,
  email_code_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed', 'invalidated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '10 minutes'),
  CHECK (attempts <= max_attempts),
  CHECK ((state = 'pending' AND phone_code_hash IS NOT NULL AND email_code_hash IS NOT NULL
            AND finished_at IS NULL)
      OR (state <> 'pending' AND phone_code_hash IS NULL AND email_code_hash IS NULL
            AND finished_at IS NOT NULL))
);
CREATE INDEX email_link_challenges_account ON email_link_challenges(user_id, created_at);
CREATE INDEX email_link_challenges_recipient ON email_link_challenges(email_key, created_at);
CREATE INDEX email_link_challenges_ip ON email_link_challenges(request_ip, created_at);
CREATE UNIQUE INDEX email_link_challenges_one_pending ON email_link_challenges(user_id) WHERE state = 'pending';

COMMENT ON TABLE sign_in_email_identities IS
  'Verified sign-in ownership only; never populated from users.email. Delivery uses preserved email, not caller spelling. Soft anonymization must explicitly erase these rows.';
COMMENT ON TABLE email_link_challenges IS
  'Private two-factor account-link operations, not login credentials or provider approval. No public route in this foundation. Codes are hashed and cleared at terminal state. Expiry is not deletion; retention integration is required before enabling delivery.';
