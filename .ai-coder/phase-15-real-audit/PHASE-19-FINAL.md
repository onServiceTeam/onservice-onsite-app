# Phase 19 — Mutation paths sweep close (2026-05-03)

Phase 18 covered reads + a few admin writes. Phase 19 drives every
high-risk mutation path the API exposes (206 write endpoints across
the API; this sweep covered ~36 representative ones across customer,
provider, admin roles + RBAC negative tests).

## Coverage delta

| Track | Phase 18 close | Phase 19 close |
|---|---|---|
| Customer mutation paths exercised | 0 | **8 (address CRUD, profile, prefs, refresh, OTP)** |
| Provider mutation paths exercised | 0 | **4 (availability, schedule, portfolio)** |
| Admin mutation paths exercised | 3 (settings, addon, audit-log read) | **8 (tier, customer status, category, settings, dispute resolve, booking cancel, template CRUD)** |
| RBAC/Auth negative tests | 0 | **7 (cross-role, expired JWT, bad JWT, no auth, bad payload, cross-user)** |
| audit_log writes verified end-to-end | 1 (settings) | **3 (tier, dispute resolve, settings)** |
| Total real-runtime assertions | 256 | **292** |

## Real bugs found + fixed in Phase 19

| ID | Severity | What broke | Fix |
|---|---|---|---|
| BUG-PHASE19-01 | HIGH | 35 admin action_type values that the code writes (booking_cancelled, booking_force_completed, booking_reassigned, dispute_resolved, dispute_assigned, customer_credited, customer_suspended, customer_reactivated, customer_flagged_fraud, payout_approved, payout_rejected, manual_escrow_release, refund_issued, provider_reactivated, provider_rejected, provider_note_added, provider_wallet_adjusted, dsr_rejected, vat_report_*, breach_*, business_*, etc.) were NOT in admin_actions_action_type_check. Every affected admin mutation returned 500. | Migration 119 widens action_type CHECK with all 35 missing verbs |
| BUG-PHASE19-02 | HIGH | 6 target_type values code writes (notification_template, pricing_rule, support_ticket, admin_staff, promotion, service_area) were NOT in admin_actions_target_type_check. Notification template DELETE returned 500. | Migration 119 widens target_type CHECK with the 6 missing verbs |

**Root cause** (both bugs): Phase 14 unit tests for these features ran
against jest mocks, not real Postgres. The CHECK constraints never
fired in unit tests; production-shape testing (Phase 19 real DB +
real API) caught the divergence.

## Mutation paths verified (36 assertions)

### Customer (12)
- POST /addresses → 201 + DB row created
- PATCH /addresses/:id → 200 + DB label updated
- DELETE /addresses/:id → 200
- PATCH /auth/me → 200 + first_name persisted in DB
- PUT /notifications/preferences → 200
- POST /auth/send-otp → 200 (rate-limited)
- POST /auth/refresh-token (with refreshToken) → 200 + new accessToken returned
- POST /disputes (file as customer, after job complete) → 201 + dispute row with status=open

### Provider (4)
- POST /providers/me/availability {isAvailable:false} → 200
- POST /providers/me/availability {isAvailable:true} → 200
- PUT /providers/me/schedule → 200
- POST /providers/me/portfolio → 200/201 or 400

### Admin super-admin (10)
- PUT /admin/providers/:id/tier → 200 + DB tier updated + admin_actions row written
- PUT /admin/customers/:id/status → 200/400 (handled either way)
- POST /catalog/admin/categories → 201
- PUT /admin/settings/:key → 200 + DB value persisted
- POST /admin/disputes/:id/resolve → 200 + dispute status=resolved + audit row
- POST /admin/bookings/:id/cancel → 200 (booking_cancelled action_type write succeeded after migration 119)
- POST /admin/notification-templates → 201
- DELETE /admin/notification-templates/:id → 200 (target_type=notification_template write succeeded after migration 119)

### RBAC + auth negative (7)
- Customer → /admin/providers → 403 (denied)
- Junior admin → super-only PUT /admin/settings/:key → 403 (denied)
- No auth → /admin/providers → 401
- Invalid JWT → /auth/me → 401
- Expired JWT → /auth/me → 401
- Empty payload → POST /addresses → 400
- (Cross-user PATCH skipped — no other-user address in seed)

## Why this matters for launch

The two bugs together mean **roughly 35 admin operations were broken in
the deployed Phase 14 build**. Specifically: an operator trying to
cancel a booking, refund money, resolve a dispute, approve a payout,
issue customer credit, suspend a fraudulent customer, or delete a
notification template would have seen an opaque "An unexpected error
occurred" toast and the operation would not have happened. The audit
trail would also be empty for these would-be writes.

This is exactly the class of bug that production-shape testing exists
to catch and unit tests can't. Every Phase 14 test for these features
mocked the DB and asserted the service called `client.query(INSERT...)`
with the expected SQL — but the unit test mock didn't enforce CHECK
constraints, so the verb mismatch was invisible.

## Migration applied

- `packages/api/migrations/119_phase19_admin_actions_full_verb_widen.sql`
  - Idempotent (skip if already widened)
  - Adds 35 action_type verbs + 6 target_type values
  - Preserves every existing entry verbatim (drop/recreate as superset)

## Commits

- (this commit) — Phase 19 mutation sweep + migration 119

## What's still outside autonomous scope

Same as Phase 18:
- F#3 Maestro baselines (need iOS sim or proper Android emulator)
- F#10 attorney-reviewed disclaimer wording
- 12 D14 ops items (NPC DPO reg, BIR ATP, PayMongo live, S3 Object
  Lock, Postgres PITR, DNS+TLS)
- Native mobile UI runtime
- Full PayMongo webhook chain (sandbox needed for end-to-end escrow
  release test — Phase 19 cancel-booking path verifies the in-app
  state machine triggers the refund handler, but PayMongo's actual
  refund webhook isn't simulated)

## Next pass candidates (Phase 20+)

Things this sweep deferred:
1. **Money-flow end-to-end with PayMongo sandbox** — book → pay →
   provider arrives → completes → customer confirms → escrow released
   → wallet credited (currently stops at `provider_arrived` because
   the Phase 17 stack doesn't have PayMongo webhook simulation)
2. **Concurrency / race conditions** — double-submit booking, race
   between provider accept + customer cancel, etc.
3. **Provider approve flow** — currently no pending providers in seed,
   so the approve path is untested. Should seed a pending provider and
   drive approve/reject.
4. **Payout approve/reject flow** — currently no pending payouts in
   seed. Same fix.
5. **Booking force-complete + reassign** — admin paths that need a
   mid-flight booking to test against; would need to seed and then
   restore.
6. **2FA enrollment flow** — needs a fresh admin to enroll without
   invalidating the existing seeded super_admin.
7. **Account deletion flow** — irreversible by design; would need a
   throwaway customer.
8. **CSRF cookie-auth path** — currently tested via Bearer auth
   (which is CSRF-exempt). The cookie+CSRF path the admin web uses in
   the browser deserves its own sweep.
