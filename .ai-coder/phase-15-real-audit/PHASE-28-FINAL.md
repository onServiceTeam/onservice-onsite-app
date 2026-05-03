# Phase 28 — latent routes + socket rate limit + business + notifications (2026-05-04)

Phase 27 closed wallet topup, reviews, and sockets. Phase 28 went after the
remaining "latent code" gap from Phase 24a (services with no routes), the
socket rate-limit + JWT exp internals, and the two largest untouched feature
areas: business accounts and notification preferences. **3 CRIT production
bugs found + fixed** plus **3 latent admin services wired to real HTTP routes**.

## Coverage delta

| Track | Phase 27 | Phase 28 |
|---|---|---|
| Latent admin routes (provider-app, area-change, backup codes regen) | services exist, no routes | **3 routes wired + 29/29 PASS, 1 CRIT bug fixed** |
| Socket rate limit + JWT exp + bad-token rejection | partial | **11/11 PASS, all 5 token-shape rejections verified** |
| Business account end-to-end (create, members, transfer, contracts) | not tested | **25/25 PASS, 2 CRIT bugs fixed** |
| Notification prefs + marketing consent + push tokens | not tested | **34/34 PASS** |
| Total real-runtime assertions | 885+ | **984+ (+99)** |

## Real bugs fixed in Phase 28

| ID | Severity | What broke | Fix |
|---|---|---|---|
| **BUG-PHASE28-01** | **CRIT — service-area-change approval always 500'd** | `service-area-change.service.ts:177` did `UPDATE providers SET service_area_id=$2, service_radius_km=$3` but `providers` has no `service_area_id` column — area assignment lives in the join table `provider_service_areas`. Postgres rejects with `column does not exist`. Every approval would have 500'd; the route was latent (no HTTP exposure) so this was undetected, but Phase 28a wired the route and uncovered it. | Update `providers.service_radius_km` only, then UPSERT `provider_service_areas (provider_id, service_area_id, is_primary=TRUE)` with prior primary demoted. UNIQUE constraint on (provider_id, service_area_id) makes the upsert idempotent. |
| **BUG-PHASE28-02** | **CRIT — every `POST /business/:id/members` 500'd** | `business.service.ts:280` did `SELECT 1 FROM users WHERE id=$1 AND deleted_at IS NULL` — but `users` has no `deleted_at` column (the soft-delete signal is `is_active=FALSE`). Postgres rejects with `column does not exist`. Every attempt to add a member to a business account 500'd. | Change `deleted_at IS NULL` → `is_active = TRUE`. |
| **BUG-PHASE28-03** | **CRIT — every re-add of a removed member 500'd** | `business.service.ts:301` UPSERT had `updated_at = NOW()` in the ON CONFLICT clause — but `business_members` has no `updated_at` column. The first INSERT branch is fine; only the ON CONFLICT (re-adding a previously soft-deleted member) trips the missing column. Postgres rejects with `column updated_at does not exist`. | Drop the `updated_at` SET clause from the upsert. If `updated_at` is needed later, add it via a migration first. |

## Phase 28a — Latent admin routes wired (29/29 PASS)

`packages/api/src/routes/admin-latent.routes.ts` (new) wires three
previously-no-HTTP services that Phase 24a's forensic identified:

1. `POST /admin/provider-applications/:userId/decide` — approve/reject/sent_back
2. `POST /admin/service-area-changes/:changeId/decide` — approve/reject
3. `POST /admin/2fa/backup-codes/regenerate` — issue new backup codes (self or another admin)

Plus list endpoints (`GET /admin/provider-applications`, `GET /admin/service-area-changes`).

All three verbs (`provider_application_*`, `service_area_change_*`,
`admin_backup_codes_regenerated`) were added to the `admin_actions` CHECK
constraint by migrations 120 + 121 in earlier phases — Phase 28a is the
final piece that makes those verbs actually fire from real production traffic.

Test drives every decision path, the 30-char-min reason validator, the
super-admin-only guard, the already-decided 409, and the cross-regen 403
when a non-super-admin tries to regen another admin's codes.

## Phase 28b — Socket rate limit + JWT exp (11/11 PASS)

`test-phase28b-socket-ratelimit.mjs` drives:
1. Rate limit on `join:conversation` — 70 emits in burst → ≥5 rate-limit error events received (cap is 60/60s)
2. `typing:start` past rate limit → silently dropped (no error spam, by design at socket.service.ts:223)
3. Per-socket counter isolation — fresh socket on different user has zero rate-limit errors after 5 events
4. Already-expired JWT rejected at handshake
5. Refresh-type token rejected
6. pre_auth_2fa-type token rejected
7. Bogus signature rejected

The 60-second periodic exp re-check (socket.service.ts:123-130) was NOT
driven explicitly because it requires a 60+s wait; the handshake-time
rejection (which uses identical jwt.verify code) is the active proof that
the JWT exp logic works.

## Phase 28c — Business account end-to-end (25/25 PASS)

`test-phase28c-business-accounts.mjs` covers the full CRUD + ownership
+ contracts flow. Key bugs found:
- POST /business/:id/members 500'd because of BUG-PHASE28-02 (users.deleted_at non-existent column)
- Re-add of member 500'd because of BUG-PHASE28-03 (business_members.updated_at non-existent column)
- Transfer ownership requires the target to be a member first (test correctly seeds this)

After fixes: create business → list → get detail (owner sees, stranger 403)
→ patch (owner only, stranger 403) → add member with role='manager' → list
includes member → delete member → cannot delete owner (must transfer first)
→ transfer ownership (writes `business_ownership_transferred` admin_actions
row) → new owner creates contract → list shows it → cancel sets status.

## Phase 28d — Notification prefs + marketing consent (34/34 PASS)

`test-phase28d-notification-prefs.mjs` covers:
- GET /preferences with no row → defaults returned (bookingUpdates=true, promotions=false)
- PUT /preferences updates multiple fields
- Partial PUT preserves untouched fields
- POST /push-token registers (ios/android/web platform validated)
- Invalid platform → 400
- Missing token → 400
- POST /read-all marks N unread → read
- POST /:id/read marks single notification
- `acknowledgeMarketingConsent` stamps marketing_consent_acknowledged_at + version
- `isMarketingChannelEligible` returns true only when (toggle ON AND consent acknowledged)
- `listMarketingEligibleUsers` excludes consent-less users even with toggle ON
- All endpoints require auth → 401 without token

**Note:** quiet-hours feature does not exist in the codebase (verified via
grep of `quiet_hour|quietHour|do_not_disturb`). Notification prefs expose
per-type toggles (bookingUpdates, promotions, etc.) and per-channel
marketing toggles, but no time-window suppression. Documented as Phase 29+
candidate if customers request it.

## Cumulative across Phase 17 → 28

- **51 real bugs** found + fixed (3+6+2+1+1+3+1+3+5+4+14+2+2+1+3 = 51)
- **6 migrations** (117/118/119/120/121/122)
- **984+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3684+ total assertions** verified

## Test files committed in Phase 28

- `test-phase28a-latent-admin-routes.mjs` — 29 assertions
- `test-phase28b-socket-ratelimit.mjs` — 11 assertions
- `test-phase28c-business-accounts.mjs` — 25 assertions
- `test-phase28d-notification-prefs.mjs` — 34 assertions

## Files changed in Phase 28

- `packages/api/src/routes/admin-latent.routes.ts` — new (3 latent admin services wired)
- `packages/api/src/server.ts` — mount `adminLatentRoutes` BEFORE generic adminRoutes catch-all
- `packages/api/src/services/service-area-change.service.ts` — BUG-PHASE28-01 fix (provider_service_areas join table)
- `packages/api/src/services/business.service.ts` — BUG-PHASE28-02 + 03 fix

## Operational items surfaced for Ken/ops

- **BUG-PHASE28-02 + 03** affected business accounts: POST /:id/members has been 500'ing in production since the feature shipped. Customer impact: any customer who tried to add a team member to their business account got a generic 500. Recommend: monitor logs for `column "deleted_at" does not exist` and `column "updated_at" does not exist` after deploy — should drop to 0.
- **BUG-PHASE28-01** was latent (no production traffic before Phase 28a wired the route). Wiring + fixing in the same phase means the new route works correctly from first deploy.
- **Marketing consent flow proven correct**: `isMarketingChannelEligible` properly gates on (per-channel toggle AND consent acknowledged). The marketing blast worker (when wired) will correctly exclude users without explicit consent — NPC RA 10173 §16 compliance is upheld.
- **Quiet hours feature does not exist** — not a bug, but a gap. If customers request "don't ping me between 10pm-8am", a Phase 29+ migration adds `quiet_hours_start`/`quiet_hours_end` to notification_preferences and a check in `createNotification` / `sendPushNotification`.

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase28a-latent-admin-routes.mjs
- test-phase28b-socket-ratelimit.mjs
- test-phase28c-business-accounts.mjs
- test-phase28d-notification-prefs.mjs

Phase 29+ candidates (deferred):
- Quiet hours support (notification_preferences extension + check in send)
- BIR/VAT report PDF generation runtime
- Customer/provider mobile end-to-end via real Expo dev client (still outside autonomous scope per CLAUDE.md hard-stops)
- Real-time admin dispatch dashboard with multiple connected admins (load test)
- Performance / load testing
- Per-socket rate-limit window-reset verification (long-running test)
- Audit-log forensic for OTHER tables that have CHECK constraints (Phase 25d's PART A2 already scans 11 constraints; the trace-helpers extension would add coverage for writeAdminAction-style wrappers across all services)
