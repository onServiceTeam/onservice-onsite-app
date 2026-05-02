# Phase 16 — Findings (live, 2026-05-03)

Real findings from actually running the runtime bring-up against a
real Postgres + Redis + MinIO. Each finding tagged with severity
and root cause.

## CRIT-PHASE16-01 — 62 of 105 migrations fail on fresh Postgres

**Severity:** CRITICAL — production launch blocker.

**Where:** `packages/api/migrations/008` and onward, every migration
that uses `uuidv7()` for the PRIMARY KEY DEFAULT. Cascading failures
on later migrations whose CREATE TABLE depends on tables that were
never created.

**Root cause:** `uuidv7()` is a Postgres 18 built-in function. It
does not exist in Postgres 17 or earlier. The compose file pinned
`postgis/postgis:18-3.5` but **that image is not published on
Docker Hub** (verified 2026-05-03 via `docker pull` — "not found").
The team apparently developed against a hypothetical PG18 image
that doesn't exist yet.

**Why prior sessions didn't catch this:**
- All "tests pass" runs used `jest.mock('../src/models/db')` —
  zero SQL was ever executed against a real Postgres.
- The dev-stack `scripts/dev/up.sh` pipeline was never run end-to-end
  in any session that wrote a migration after the change to PG18.
- node-pg-migrate runner was the documented path; it would have
  failed too, just at a different layer (the node-pg-migrate
  metadata table doesn't exist either).

**Numbers:**
- Applied successfully: 43 migrations (the early ones using
  `uuid_generate_v4()` from uuid-ossp extension).
- Failed: 62 migrations.
- Cascading failures: 22 of those 62 are because their dependency
  table was created by an earlier failed migration. The "real"
  count is ~40 distinct migrations using `uuidv7()`.

**Fix path A (chosen):** Add a `uuidv7()` SQL shim in
`infra/docker/postgres-init/02-uuidv7-shim.sql` that generates a
v7-shape UUID using the random + timestamp pattern. Compatible
output for app code that just consumes the UUID.

**Fix path B (rejected for now):** Use a Postgres 18 alpha/beta
image (e.g., `postgres:18beta1`). Risk: dev/prod parity drift,
unknown PostGIS-with-PG18 status.

**Fix path C (rejected):** Rewrite all migrations to use
`uuid_generate_v4()` instead of `uuidv7()`. Risk: huge churn,
loses the time-ordered property the team chose v7 for.

**Fix to be applied this session:** Path A.

**Verification after fix:**
- Recreate the postgres container so `postgres-init/` re-runs.
- Re-apply migrations — expect 105/105 success or a smaller list
  of pre-existing genuine bugs.
- Document any remaining genuine bugs as separate CRITs.

## CRIT-PHASE16-02 — 9 production migrations have real bugs (not PG-version-related)

After uuidv7 shim, applied 96/105. These 9 still fail with bugs
that exist regardless of Postgres version:

### MED-PHASE16-02a — 078_d07_checklist_templates seed depends on data not yet present
- File: `packages/api/migrations/078_d07_checklist_templates.sql:107-122`
- Error: `null value in column "category_id"` because the seed
  INSERT does `(SELECT id FROM service_categories WHERE slug = 'cleaning-residential')`
  but at migration time service_categories has no rows. The
  category seed lives in `packages/api/seeds/001_categories.sql`
  which is applied AFTER all migrations.
- Impact: blocks 079 (booking_photos_signatures depends on
  `booking_checklist_items` table from 078).
- Fix: either gate the seed inserts on row existence
  (`SELECT id FROM ... WHERE slug = 'X'` returning NULL ->
  skip the row), or split the schema migration from the data seed
  and put the data seed in `seeds/` instead.

### MED-PHASE16-02b — 079 cascading from 078
- File: `packages/api/migrations/079_d07_booking_photos_signatures.sql:59`
- Error: `relation "booking_checklist_items" does not exist`
- Impact: 079 creates booking_photos + booking_signatures (both
  used by SignaturePad / photo upload). When 078 fails, 079
  fails. Both blocked together.
- Fix: fix 078 first.

### MED-PHASE16-02c — 083_d08_admin_user_preferences uses COALESCE in UNIQUE
- File: `packages/api/migrations/083_d08_admin_user_preferences.sql:25`
- Code: `UNIQUE (admin_user_id, page_key, COALESCE(saved_filters_name, ''))`
- Error: `syntax error at or near "("` — Postgres does not allow
  function calls in plain UNIQUE constraints. Must use a
  separate `CREATE UNIQUE INDEX` with the expression.
- Impact: admin_user_preferences table never created. Saved
  filters in admin pages will fail with "relation does not exist".
- Fix: replace the inline UNIQUE with:
  ```sql
  CREATE UNIQUE INDEX idx_admin_user_prefs_named
      ON admin_user_preferences (admin_user_id, page_key, COALESCE(saved_filters_name, ''));
  ```

### MED-PHASE16-02d — 090 bir_filer_identity uses '__UNSET__' placeholder
- File: `packages/api/migrations/090_bir_filer_identity.sql:67`
- Error: `value '__UNSET__' violates platform_settings_value_type_check`
  — wait, re-reading: the `value_type_check` only restricts the
  `value_type` column, not `value`. The actual issue is the row
  has `value_type='text'` but `text` isn't in the CHECK list
  (which is number/percent/currency/integer/boolean/string/json).
  `text` should probably be `string`.
- Impact: BIR filer identity settings never seeded. OR/2307/VAT
  PDFs will continue to use placeholder TIN until manually
  inserted via the Settings UI.
- Fix: change `value_type='text'` to `value_type='string'` (5
  occurrences). Also fix `'__UNSET__'` placeholder — pick a real
  default or leave NULL (column is NOT NULL though, so an empty
  string `''` is fine).

### MED-PHASE16-02e through 02i — 107 + 108 + 109 + 110 + 112 omit `category`
- Files:
  - 107_recurring_auto_charge_e02.sql:92
  - 108_n119_reconciliation_alert_threshold.sql:15
  - 109_n126_n127_suki_admin_tunable.sql:28
  - 110_n144_upload_allowed_mime.sql:16
  - 112_n70_change_order_expiry_settings.sql:28
- Error: all the same — `null value in column "category"`. Each
  of these migrations INSERTs a row into platform_settings without
  the `category` (NOT NULL) and without `label`, `value_type`,
  `default_value` (all NOT NULL). These migrations were written
  assuming an OLDER platform_settings schema (the one that existed
  pre-migration-050 which did the rich-schema rewrite).
- Impact: the platform-setting these migrations were trying to
  expose to admin Settings UI never lands. Examples:
  - recurring_auto_charge_max_consecutive_failures: hardcoded
    in the code as 3, never tunable.
  - reconciliation_alert_threshold_centavos: never tunable.
  - suki_tiers: hardcoded JSON, never tunable from admin.
  - allowed_image_mime_types: hardcoded, never tunable.
  - change_order_approval_expiry_hours: hardcoded 24h.
- Fix: each INSERT needs to specify category, subcategory,
  label, value_type, value, default_value. Pattern from a working
  example: see migration 050 inserts.

## Status of Phase 16 (live)

- [x] Docker Desktop running
- [x] postgres + redis + minio containers up + healthy
- [x] uuidv7 shim added (CRIT-PHASE16-01 fixed)
- [x] 96 of 105 migrations apply — including my LL#12 116
- [ ] 9 migrations still failing (CRIT-PHASE16-02 — 9 distinct bugs)
- [ ] Seed data
- [ ] API server up
- [ ] Admin web up + reachable from Chrome MCP

**Decision:** continue Phase 16 with the 96 working migrations.
The 9 broken migrations only affect specific isolated features
(checklist templates, admin saved filters, BIR PDF identity, 5
admin-tunable settings). Document each as a follow-up CRIT/MED.
The API can start without them; we just lose those features
during runtime testing. Each can be fixed in its own commit.
