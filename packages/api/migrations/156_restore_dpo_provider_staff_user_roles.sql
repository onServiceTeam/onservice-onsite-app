-- Migration 156: restore the complete composed user-role constraint.
--
-- Migration 106 added the legally segregated `dpo` role. Migration 131 later
-- replaced users_role_check while adding `provider_staff`, but accidentally
-- omitted `dpo`. That made every DPO promotion fail at the database even
-- though the API, middleware, and admin UI all supported the role.
--
-- Keep this list composed: both additive roles must remain accepted.

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN (
        'customer',
        'provider',
        'admin',
        'super_admin',
        'dpo',
        'provider_staff'
    ));

COMMENT ON CONSTRAINT users_role_check ON users IS
    'Canonical login roles. Migration 156 restores dpo + provider_staff composition after migration 131 omitted dpo.';

COMMIT;
