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

The check `scripts/gates/c-constitution-no-admin-password-seeds.sh` (added in Dispatch 01) fails when a file in this folder sets the `password_hash` column of the `users` table, where admin passwords live. It catches an UPDATE or an INSERT that names the column on any line of a `.sql` seed (SQL comment lines are skipped), plus the original Dispatch 01 patterns in any file here. The exact rules and limits are in the script header.

> **Correction (2026-10-17, D40):** until 2026-10-17 nothing ran that script. No workflow and no gate runner called it, so the sentence above used to describe a check that did not happen. It is now a BLOCKING article of Gate C (`scripts/gates/c-constitution.sh`, `MODES.json` entry `no-admin-password-seeds`), with a self-test in `scripts/gates/__tests__/gate-c-no-admin-password-seeds.test.sh`. The earlier wording also said it covered "any `*admin*` table"; it only ever named `users` and `admin_users`, and only `users` has a `password_hash` column. Gate C runs in CI after each push. GitHub branch protection is off (Ken's choice, D40), so a red Gate C does not stop a push.
