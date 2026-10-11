-- D37 (Ken, 2026-10-11): email codes replace phone codes while SMS is
-- unavailable. Additive only: no column is dropped, renamed or narrowed, and
-- the dormant 2026-10-09 email tables (175-179) are untouched.

-- One row per emailed sign-in code. Neither the code nor the address is
-- stored: the code is recomputed from a server key and this id (so a resend
-- inside the window repeats the SAME code), and the address is kept only as
-- a SHA-256 digest of its lower-case form.
CREATE TABLE email_code_challenges (
  id UUID PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('sign_in', 'admin_sign_in')),
  recipient_hash TEXT NOT NULL CHECK (recipient_hash ~ '^[a-f0-9]{64}$'),
  -- Admin codes are bound to the admin account and its session generation
  -- when sent. Marketplace codes are not: the account is found (or created)
  -- only after the right code is typed.
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_version INTEGER CHECK (session_version > 0),
  request_ip INET NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  sends INTEGER NOT NULL DEFAULT 0 CHECK (sends BETWEEN 0 AND 10),
  last_sent_at TIMESTAMPTZ,
  last_delivery TEXT CHECK (last_delivery IN ('accepted', 'unknown', 'rejected', 'unavailable')),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'consumed', 'expired', 'invalidated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  -- Fixed when the code is created; a resend never moves it.
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '10 minutes'),
  CHECK (attempts <= max_attempts),
  CHECK ((purpose = 'admin_sign_in') = (user_id IS NOT NULL)),
  CHECK ((user_id IS NULL) = (session_version IS NULL)),
  CHECK ((state = 'pending') = (finished_at IS NULL)),
  CHECK (finished_at IS NULL OR finished_at >= created_at),
  CHECK ((sends = 0) = (last_sent_at IS NULL))
);
CREATE UNIQUE INDEX email_code_one_pending ON email_code_challenges (purpose, recipient_hash)
  WHERE state = 'pending';
CREATE INDEX email_code_recipient ON email_code_challenges (recipient_hash, created_at);
CREATE INDEX email_code_ip ON email_code_challenges (request_ip, created_at);
CREATE INDEX email_code_account ON email_code_challenges (user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX email_code_pending_expiry ON email_code_challenges (expires_at) WHERE state = 'pending';
CREATE INDEX email_code_retention ON email_code_challenges (created_at) WHERE state <> 'pending';

COMMENT ON TABLE email_code_challenges IS
  'D37 emailed sign-in codes (marketplace sign-in/sign-up and the admin second step). No code or address is stored; the code is derived from a server key and the id. expires_at is fixed at creation; resends repeat the same code until it.';

-- When an account's email was last proven by a code. NULL = never proven
-- (older contact emails were typed in, not verified).
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

-- When an account's phone number was proven by an SMS code. Existing accounts
-- were all created through phone codes (or by operators), so they take the
-- migration time. Accounts created by email sign-up while SMS is paused are
-- inserted with NULL: their number was typed, not proven, and phone sign-in
-- must never open such an account when SMS returns.
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ DEFAULT now();

-- One account per email regardless of letter case. The live database had no
-- case-insensitive duplicates when this was written (checked 2026-10-11).
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email)) WHERE email IS NOT NULL;
