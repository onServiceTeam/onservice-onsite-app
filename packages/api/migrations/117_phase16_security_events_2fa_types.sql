-- CRIT-PHASE17-01 fix — security_events.event_type CHECK is missing
-- 4 values that auth.routes.ts emits.
--
-- Surfaced by Phase 17 first real admin login attempt:
--   POST /api/v1/auth/admin/login → 500 with
--   "new row for relation security_events violates check constraint
--    security_events_event_type_check"
--
-- The 4 missing event types (all admin 2FA flow telemetry):
--   admin_login_2fa_required        (auth.routes.ts:557)
--   admin_login_2fa_setup_required  (auth.routes.ts:589)
--   admin_login_2fa_verified        (auth.routes.ts:722)
--   admin_2fa_failed                (auth.routes.ts:699)
--
-- Pre-fix: any admin without a TOTP secret yet (the normal first-login
-- path) hit the 2fa_setup_required code path which threw 500. Admins
-- with TOTP couldn't pass through 2fa_required either. Effectively no
-- admin could log in at all once the auth.routes 2FA code paths landed.
--
-- This bug shipped because the existing tests use jest.mock for db.query
-- so the CHECK constraint was never exercised. This is exactly the
-- runtime-vs-unit-test gap that Phase 16+ is supposed to surface.

DO $$
DECLARE
    cur_def TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO cur_def
      FROM pg_constraint
     WHERE conname = 'security_events_event_type_check';

    IF cur_def IS NULL THEN
        RAISE NOTICE 'security_events_event_type_check missing; skipping';
        RETURN;
    END IF;

    -- Already widened?
    IF position('admin_login_2fa_required' in cur_def) > 0
       AND position('admin_login_2fa_setup_required' in cur_def) > 0
       AND position('admin_login_2fa_verified' in cur_def) > 0
       AND position('admin_2fa_failed' in cur_def) > 0 THEN
        RETURN;
    END IF;

    ALTER TABLE security_events
        DROP CONSTRAINT security_events_event_type_check;

    -- Splice the 4 new values in before the closing `])::text[])))`.
    EXECUTE format(
        'ALTER TABLE security_events ADD CONSTRAINT security_events_event_type_check %s',
        regexp_replace(
            cur_def,
            '\]\)::text\[\]\)\)\)$',
            ', ''admin_login_2fa_required''::character varying, ''admin_login_2fa_setup_required''::character varying, ''admin_login_2fa_verified''::character varying, ''admin_2fa_failed''::character varying])::text[])))'
        )
    );
END$$;
