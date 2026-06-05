-- Fix: admin login 500 on every attempt. login_attempts.phone is VARCHAR(15)
-- (sized for a +63 phone), but admin login records the login identifier — the
-- admin EMAIL — in this column. An email longer than 15 chars (essentially all
-- of them) overflowed the column, so recordLoginAttempt threw
-- "value too long for type character varying(15)" and the whole login returned
-- 500 instead of a clean 401. Widen the column to hold an email (max 320 chars
-- per RFC 5321) or a phone. The column semantically holds the "login identifier"
-- now; renaming is avoided to not churn the (phone, created_at) index + queries.
-- (recordLoginAttempt was also made best-effort so an audit-write failure can
-- never break login again.)

ALTER TABLE login_attempts ALTER COLUMN phone TYPE VARCHAR(320);

COMMENT ON COLUMN login_attempts.phone IS
  'Login identifier: a +63 phone for OTP logins, or the admin email for admin_login. Widened from VARCHAR(15) in mig 134.';
