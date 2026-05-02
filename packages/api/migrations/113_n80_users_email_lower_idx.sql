-- 113_n80_users_email_lower_idx.sql
--
-- MED-N80 fix — admin login + /me PATCH email update flows do
-- `WHERE email = $1` (with $1 already lowercased before query). Without
-- a functional index on LOWER(email), this is a sequential scan of the
-- users table on every admin login attempt. At low user counts (Boracay
-- launch) the scan is fast, but post-scale this becomes a DOS vector
-- under credential-stuffing.
--
-- Functional index on LOWER(email) matches the query shape exactly
-- since callers normalize input via .toLowerCase() at the route layer.
-- The index is partial (WHERE email IS NOT NULL) so anonymized rows
-- with NULL email don't bloat the index.
--
-- Defensive: CREATE INDEX IF NOT EXISTS so re-running the migration
-- against an already-deployed schema is a no-op. Use CONCURRENTLY in
-- production to avoid AccessExclusive lock during build (operator
-- runbook step).

CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

-- For deployments that prefer CITEXT semantics (case-insensitive at
-- the type level), uncomment the following and run separately. The
-- functional index above remains correct either way.
-- ALTER TABLE users ALTER COLUMN email TYPE CITEXT;
