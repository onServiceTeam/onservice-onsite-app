# Seeds

This directory contains test-data fixtures for development. **No production seed creates admin credentials.**

Per Phase 14 Dispatch 01 Bug 1235 fix, the previously-shipped `004_admin_passwords.sql` was removed because it carried a placeholder hash that invited a "well-meaning fix" — someone running `scrypt('admin123')` and pasting the real hash would create a working credential everyone knows.

## To bootstrap a production admin user

Use the CLI script:

```bash
ADMIN_BOOTSTRAP_PASSWORD='<strong-password>' \
ADMIN_BOOTSTRAP_ROLE='super_admin' \
npx tsx packages/api/scripts/bootstrap-admin.ts admin@onservice.ph
```

The script enforces:

- Password >= 16 chars
- Mixed case (upper + lower)
- At least one digit
- At least one special character
- Not matching banned dictionary patterns (`password`, `admin`, `onservice`, `qwerty`, `12345`)
- No 5+ repeated characters in a row

Login roles supported: `super_admin`, `admin`, `dpo`. There is no default; the
role must be explicit. `finance`, `support_agent`, and similar labels are staff
profiles attached to an `admin` account and do not replace route-level access.

After first login, the admin must enroll TOTP 2FA.

## Existing seed files

Each remaining seed file is dev-only test data. `scripts/server/02-deploy.sh`
runs none of them unless the protected server `.env` explicitly has
`ENABLE_TEST_FIXTURES=1`. The tracked production template and its verifier
require `0`.

- `001_categories.sql` — service categories
- `002_test_users.sql` — test customer accounts (no admin role)
- `003_test_bookings.sql` — test booking fixtures
- `003_demo_history.sql` — generated demo bookings and reviews
- `004_cebu_service_areas.sql`, `004_provider_services.sql`, and
  `005_cebu_catalog.sql` — development/demo launch-market fixtures

The CI gate `scripts/gates/c-constitution-no-admin-password-seeds.sh` (added in Dispatch 01) blocks any future seed that updates the `password_hash` column on the `users` table or any `*admin*` table.
