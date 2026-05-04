# Phase 32 — notification templates + settings + checklist + catalog (2026-05-04)

Phase 31 closed referrals + support + addresses + customer-admin/breach
with zero new CRIT bugs. Phase 32 hit four more untouched route surfaces
from PHASE-31-FINAL's continuation list. **One real CRIT bug found and
fixed** in Phase 32b — the bulk settings audit INSERT had been
500-erroring because two columns were wrong (missing NOT NULL FK +
mistyped column name).

## Coverage delta

| Track | Phase 31 | Phase 32 |
|---|---|---|
| Notification templates (admin CRUD + dual-mount) | not tested | **28/28 PASS** |
| Platform settings (super_admin gate, audit, bulk update) | not tested | **26/26 PASS** |
| Booking checklist (provider-driven, photo enforcement) | not tested | **24/24 PASS** |
| Service catalog (public reads + admin CRUD) | not tested | **42/42 PASS** |
| Total real-runtime assertions | 1264+ | **1384+ (+120)** |

## Real bugs fixed in Phase 32

**1 new CRIT bug fixed:**

### CRIT-PHASE32-01 — `bulkUpdateSettings` audit INSERT shape mismatch

`packages/api/src/services/settings.service.ts:499-504` — the bulk
audit INSERT referenced column `reason` (real column is
`change_reason`) AND omitted the NOT NULL `setting_id` FK. Every PUT
to `/api/v1/admin/settings` (bulk endpoint) 500-errored.

The single-key `updateSetting` at line 428 had the correct shape (with
`setting_id` and `change_reason`). The bulk path was just stale —
likely diverged when the schema was tightened in mig 051 and the
single-key path was updated, but the bulk loop wasn't.

**Fix:** Added `setting_id` to both the column list and values; renamed
`reason` → `change_reason`. Test verifies the round-trip (200 +
DB-state assertion on new_value=48).

**Severity:** CRIT — admin "Save All" (bulk) silently 500-errored. The
admin UI would display "An unexpected error occurred" with no actionable
message. Per-key `PUT /:key` worked fine, masking how broken bulk was.
Real exposure: any admin trying to update multiple money knobs (commission
rates, fees, refund tiers) at once would be blocked.

## Phase 32a — Notification templates (28/28 PASS)

`test-phase32a-notification-templates.mjs` covers:

1. POST creates template (admin + super_admin)
2. Duplicate slug → 409
3. Invalid slug (uppercase/dashes) → 400 (Zod regex `^[a-z0-9_]+$`)
4. Short body (<10 chars) → 400
5. Bogus type → 400
6. GET / lists with pagination
7. ?type=system filter works (every row matches)
8. GET /:id reads single
9. Bogus id → 404
10. PUT /:id partial update (title)
11. PUT /:id flip is_active (DB confirmed)
12. **DELETE — admin → 403 (MED-N167)** — junior admin can't nuke
    customer-facing copy
13. DELETE — super_admin → 200, row gone
14. customer → 403 on read+write
15. No auth → 401
16. **Dual-mount works** — `/api/v1/notification-templates` AND
    `/api/v1/admin/notification-templates` both resolve to same handler

## Phase 32b — Platform settings (26/26 PASS, 1 CRIT fix)

`test-phase32b-settings.mjs` covers:

1. GET / returns settings grouped by category
2. GET /:category returns single category rows
3. GET /:key/history returns audit rows
4. PUT /:key — super_admin updates (writes audit row, change_reason
   persisted)
5. PUT /:key — admin (not super) → 403 (CRIT-N16)
6. **PUT / bulk update** — verified after CRIT-PHASE32-01 fix
7. Bulk >50 keys → 400
8. Empty array → 400
9. POST /:key/reset → value reverts to default_value
10. POST /cache/flush — super_admin → 200
11. POST /cache/flush — admin → 403
12. customer → 403
13. No auth → 401
14. Out-of-bounds value (99999 vs 1..168) → 400 (server-side validation)

## Phase 32c — Booking checklist (24/24 PASS)

`test-phase32c-checklist.mjs` covers:

1. GET — provider opens, lazy-creates from template
2. GET — second call returns same checklist (idempotent + UNIQUE on
   booking_id)
3. Customer GET (after provider opened) → 200
4. Stranger provider → 403
5. PATCH non-photo item → 200, isCompleted=true, completedAt set
6. **PATCH photo_required item without photoId → 400 (Bug 463)**
7. PATCH photo_required item WITH valid photoId → 200, photoId stored
8. PATCH with photoId from a different booking → 400 (cross-booking
   defense)
9. Bogus itemId → 404
10. completed=string → 400
11. **Documented design:** customer who owns booking CAN toggle items
    (role guard only blocks strangers, not the booking owner)
12. No auth → 401
13. **getChecklistCompletionStatus reflects DB state** — totalRequired=3,
    completedRequired=3, isFullyComplete=true, checklistShown=true
    (Bug 463: provider can't mark booking complete unless this returns true)

**Soft observation:** PATCH allows the customer-owner to toggle items.
Pragmatically benign (the customer can already see progress; toggling
just affects their own view of completion), but in some product designs
the checklist is treated as the provider's record, not the customer's.
Documented; defer until product gives explicit guidance.

## Phase 32d — Service catalog (42/42 PASS)

`test-phase32d-catalog.mjs` covers:

**Public reads (no auth):**
1. GET / categories
2. GET /full nested (categories + subcategories)
3. /search ?q=a → 400 (2-char minimum)
4. /search ?q=clean → 200 with services + providers
5. GET /:slug → category with subcategories
6. GET /:slug bogus → 404
7. GET /subcategories/:id/bounds → minCents/maxCents/baseCents
8. /bounds bogus id → 404
9. GET /subcategory/:id/addons → active addon list

**Admin mutations (super_admin only — MED-N161):**
10. POST /admin/categories — admin (not super) → 403
11. POST /admin/categories — super_admin → 201
12. POST without name → 400
13. PUT /admin/categories/:id updates description
14. POST /admin/subcategories with full pricing
15. PUT /admin/subcategories/:id updates basePrice
16. POST /admin/addons — super_admin creates
17. POST /admin/addons price > 5_000_000 → 400 (Zod cap, Bug 266)
18. PUT /admin/addons/:id updates price
19. **DELETE /admin/addons/:id — soft-deactivates (is_active=false)**
20. **DELETE /admin/subcategories/:id — soft-deactivates + writes
    `service_subcategory_deleted` admin_actions row** (MED-N162 audit
    integrity)
21. PUT category admin → 403

## Cumulative across Phase 17 → 32

- **54 real bugs** found + fixed (+1 from Phase 31's 53 — new bulk
  audit shape mismatch)
- **2 soft bugs** documented
- **7 migrations** (117/118/119/120/121/122/123)
- **1384+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 4084+ total assertions** verified
- **+1 latent route wired** (PII reveal — Phase 30b)

## Test files committed in Phase 32

- `test-phase32a-notification-templates.mjs` — 28 assertions
- `test-phase32b-settings.mjs` — 26 assertions
- `test-phase32c-checklist.mjs` — 24 assertions
- `test-phase32d-catalog.mjs` — 42 assertions

## Files changed in Phase 32

- `packages/api/src/services/settings.service.ts` — CRIT-PHASE32-01:
  fixed `bulkUpdateSettings` audit INSERT (added `setting_id`, renamed
  `reason` → `change_reason`)

## Operational items surfaced for Ken/ops

- **Bulk settings update was silently 500-broken**: Every admin "Save
  All" against `/api/v1/admin/settings` (PUT /) errored with the generic
  "unexpected error" message. Per-key PUT worked fine, so the bug was
  invisible until anyone tried bulk. Now fixed and verified by Phase 32b
  test 6 (changes value to 48 and asserts 200 + correct DB state).
- **Notification template DELETE is super-admin only (MED-N167)**:
  Junior admin can create + edit + flip is_active, but cannot delete.
  Verified working as designed.
- **Settings cache flush is super-admin only**: Cache-bust amplifies a
  settings change for every reader, so even though "flush" sounds
  benign, it's gated to super_admin like the mutations are.
- **Catalog admin mutations all super_admin (MED-N161)**: Categories,
  subcategories, addons — every create/update/delete is super_admin.
  Soft-deletes write admin_actions audit rows (verified via
  `service_subcategory_deleted` verb on actual DELETE).
- **Checklist customer-owner toggle is intentional**: Customer who
  owns the booking can PATCH items. Documented; not exploitable today
  (customer would only be cheating themselves out of completion-gate
  status), but worth a product decision when the customer-side UI ships.
- **Lazy template creation works**: When a category has no checklist
  template, `getChecklistForBooking` lazy-creates an empty placeholder
  (BUG-PHASE21-02 fix). Verified by the test using a fresh test
  category — provider opens job, server creates template + booking
  checklist atomically.

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase32a-notification-templates.mjs
- test-phase32b-settings.mjs
- test-phase32c-checklist.mjs
- test-phase32d-catalog.mjs

Phase 33+ candidates (deferred):
- **Newly-tracked soft bug from this phase:**
  - Customer-owner can toggle checklist items — confirm with product
    intent, then either tighten role guard or formalize the behavior
- **Soft bugs still open from prior phases:**
  - Re-SELECT in `redeemReferralCode` so the API response matches DB state
  - Widen GET /support-tickets/:id to allow ticket owner
- **Untouched routes still on the list:**
  - account.routes.ts — user profile + email/phone update
  - cancellation-policy-public.routes.ts (Phase 26a partial — public
    side not exhaustively tested)
  - cancellation-policy-admin.routes.ts (Phase 26a partial)
  - test-fixtures.routes.ts (dev-only fixtures — likely off in prod)
- **Real product work (deferred per CLAUDE.md hard-stops):**
  - Implement actual 45s round-robin offer cycle
  - Quiet hours feature
  - BIR/VAT report PDF generation runtime
- **Outside autonomous scope:**
  - F#3 Maestro baselines, F#10 attorney wording, 12 D14 ops items
- **Performance / load testing** still deferred
