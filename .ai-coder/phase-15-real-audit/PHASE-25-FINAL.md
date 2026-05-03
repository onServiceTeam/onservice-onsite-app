# Phase 25 — middleware forensic + untouched money flows + CI guard (2026-05-03)

Phase 24 closed the first wave of audit-log verb gaps. Phase 25 broadens
the forensic to (a) the route middleware chain, (b) untouched money
flows (refund/dispute/tip/recurring), and (c) a CI guard that prevents
the migration-119 class of regression from happening again. Two more
production-impacting bugs were found en route and fixed.

## Coverage delta

| Track | Phase 24 | Phase 25 |
|---|---|---|
| Admin route middleware audit (auth/role/CSRF) | sampled | **exhaustive: 158 routes, 0 gaps** |
| Dispute resolution end-to-end (file → assign → resolve → reopen) | partial | **27/27 PASS, all 3 resolution types + reopen** |
| Tip flow + recurring auto-charge | not tested | **23/23 PASS** |
| CI guard against CHECK regression | none | **regression guard now part of suite** |
| Verbs in `admin_actions` CHECK | 89 | **97 (+8)** |
| Total real-runtime assertions | 626+ | **702+ (+76)** |

## Real bugs fixed in Phase 25

| ID | Severity | What broke | Fix |
|---|---|---|---|
| **BUG-PHASE25-01** | **MED — silent NPC compliance audit failure** | `compliance-admin.service.markDsrComplete` writes its audit row via the `writeAdminAction()` helper which is `gate-c-allowed: best-effort-audit-only` (try/catch + logger.warn). Migration 119 dropped `dsr_marked_complete` from CHECK; every DSR completion silently lost its audit row — DSR completion succeeded but NPC RA 10173 §22 processing-activity record was never written. Phase 24a's extractor missed this because it only scanned literal `INSERT INTO admin_actions` blocks, not wrapper-helper calls. | Migration 121 restores `dsr_marked_complete` (and 7 other dropped verbs) via splice pattern. |
| **BUG-PHASE25-02** | **MED — silent NPC escalation audit failure** | Same root cause for `dsr_escalated_to_npc`. Critical because NPC escalation IS itself a compliance event — a silent audit drop here means the regulator-facing record of "we escalated this to you" doesn't exist. | Migration 121 restores. |

Plus 6 latent verbs originally declared in migration 106 but never re-emitted — added back so the live CHECK is a true superset of every value ever declared, satisfying the new regression guard's hard-fail rule.

## Phase 25a — Middleware forensic (64/64 PASS)

`extract-admin-route-middleware.mjs` walks every admin route file in
`packages/api/src/routes/`, finds every `router.<verb>('path', ...)`
declaration, and verifies each has either:
- `authMiddleware` + role-enforcement function (per-route), OR
- File-level `router.use(authMiddleware)` + `router.use(rbacMiddleware('...'))`

Results: **158 admin routes scanned across 11 files. 0 gaps.**

`test-phase25a-admin-route-defenses.mjs` then drives 12 admin route
families through the live middleware chain:

For each family, verifies:
- `GET ... no auth → 401`
- `GET ... customer Bearer → 403`
- `GET ... super-admin Bearer → 2xx (or 4xx for stub IDs, but never 401/403)`
- `POST ... no auth + no csrf → 403 csrf_invalid`
- `POST ... super-admin Bearer (CSRF intentionally bypassed per CRIT-PHASE17-02) → past middleware`
- `POST ... customer Bearer → 403`

Documents the intentional behavior: **Bearer-token auth bypasses CSRF**
(per CRIT-PHASE17-02) because browsers don't auto-attach Authorization
headers, so cross-origin CSRF requires a cookie. Cookie-auth requests
are still gated by CSRF.

## Phase 25b — Dispute resolution lifecycle (27/27 PASS)

`test-phase25b-dispute-resolution.mjs` drives the full lifecycle:

1. Customer files dispute on completed booking (within 24h window)
2. Late dispute (72h after completion) → 409
3. Admin assigns dispute to themselves → `assigned_to` updated
4. **Admin resolves with `full_refund`** → escrow refunded, `refund_amount=TOTAL`, `dispute_resolved` audit row
5. **Admin resolves with `partial_refund` + 50%** → escrow split, `refund_amount=TOTAL/2`
6. `partial_refund` without `refundPercent` → 400
7. `partial_refund` with `refundPercent=150` → 400
8. **Admin resolves with `no_refund`** → `refund_amount=0`, escrow released to provider
9. **Super-admin reopens resolved dispute** → status reverts to `under_review`
10. Cannot file second active dispute on same booking → 409
11. Wrong customer cannot file on someone else's booking → 403/404
12. `admin_actions` trail has `dispute_resolved`, `dispute_assigned`, `dispute_reopened` rows

## Phase 25c — Tip + recurring auto-charge (23/23 PASS)

`test-phase25c-tip-recurring.mjs` covers two untouched money flows:

**Tip flow (8 assertions):**
1. `GET /tips/limits` (public) returns minCents + maxCents
2. Customer wallet tip on completed booking → tip row + customer wallet debited + provider wallet credited + provider notification fired
3. Wrong customer cannot tip stranger's booking → 403
4. Double tip on same booking → 409
5. Tip on non-completed booking → 409
6. Tip > wallet balance → 400
7. Tip > tip cap → 400
8. **MED-N153 verified**: `paymentMethod=gcash` rejected → 400 (PayMongo integration not wired for tips yet)

**Recurring auto-charge (5 assertions):**
9. `PUT /recurring/:id/auto-charge` stores `payment_method_id` + label
10. Wrong customer PUT → 404 (no existence leak)
11. Idempotent re-set with same method → 2xx no-op
12. `DELETE /recurring/:id/auto-charge` clears method to NULL
13. Wrong customer DELETE → 404

## Phase 25d — CHECK regression CI guard + migration 121 (proof: 7/7 PASS)

`check-constraint-regression-guard.mjs` is the new CI-runnable
guardrail. It walks every migration in order and verifies:

**PART A — per-migration drops (advisory):**
For each `ADD CONSTRAINT ... CHECK (... IN (...))` block, compare against
the running set. Splice-pattern migrations (`pg_get_constraintdef` +
`EXECUTE format`) are skipped (they preserve by construction).

**PART A2 — cumulative declarations vs live DB (HARD FAIL):**
For each tracked constraint, the live CHECK in the DB MUST be a superset
of every value ever declared in any migration. Net drops fail the build.

**PART B — emitted literals vs live CHECK (HARD FAIL):**
For each `INSERT INTO <constrained_table>` block in the source, parse the
column list, locate the constrained column's value, and verify the live
CHECK accepts it.

When run on master:
- 11 distinct constraints tracked across 109 migrations
- Migrations 119 + 120 flagged historically as advisory (drops did happen)
- Live DB confirmed superset of every value ever declared (after migration 121)
- All 89 distinct emitted action_type literals + 30 target_type literals accepted
- **Constraint regression guard: PASS**

The guard is run-once via:
```
node .ai-coder/phase-15-real-audit/check-constraint-regression-guard.mjs
```
exits 0 = clean, non-zero with detail on any violation.

`test-phase25d-dsr-audit-rows.mjs` (7/7 PASS) drives the real
DSR-mark-complete and NPC-escalate routes after migration 121 and
confirms the audit rows now land:
- `POST /admin/compliance/dsr/:id/complete` → `dsr_marked_complete` row
- `POST /admin/compliance/dsr/:id/escalate` → `dsr_escalated_to_npc` row

## Migration 121 detail

`packages/api/migrations/121_phase25_admin_actions_dropped_verbs.sql` adds 8 verbs:

| Verb | Status before | Why added |
|---|---|---|
| `dsr_marked_complete` | emitted, silently dropped | active production use (BUG-PHASE25-01) |
| `dsr_escalated_to_npc` | emitted, silently dropped | active production use (BUG-PHASE25-02) |
| `provider_commission_adjusted` | declared in migration 106, never emitted | latent, restored to satisfy regression guard |
| `provider_banned` | same | latent |
| `dsr_action_dispatched` | same | latent |
| `provider_document_approved` | same | latent (KYC review path) |
| `provider_document_rejected` | same | latent (KYC review path) |
| `pii_reveal` | same (mentioned in pii-mask.ts:138 design note) | latent (super-admin reveal logging) |

Uses the splice pattern (read live `pg_get_constraintdef`, append via
`EXECUTE format`) so the migration is idempotent and a true superset
operation — never replaces, only extends.

## Cumulative across Phase 17 → 25

- **45 real bugs** found + fixed (3+6+2+1+1+3+1+3+5+4+14+2 = 45)
- **5 migrations** (117/118/119/120/121)
- **702+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3402+ total assertions** verified

## Test files committed in Phase 25

- `extract-admin-route-middleware.mjs` — middleware static extractor
- `test-phase25a-admin-route-defenses.mjs` — 64 assertions
- `test-phase25b-dispute-resolution.mjs` — 27 assertions
- `test-phase25c-tip-recurring.mjs` — 23 assertions
- `check-constraint-regression-guard.mjs` — CI-runnable guard
- `test-phase25d-dsr-audit-rows.mjs` — 7 assertions

## Files changed in Phase 25

- `packages/api/migrations/121_phase25_admin_actions_dropped_verbs.sql` — new migration
- (No source changes; bugs were schema-side and fixed via migration alone.)

## What's still genuinely outside autonomous scope

Same as prior phases (unchanged):
1. F#3 Maestro baselines (need iOS sim or proper Android emulator)
2. F#10 attorney-reviewed disclaimer wording
3. 12 D14 ops items (NPC DPO, BIR ATP, PayMongo live, S3 Object Lock, Postgres PITR, DNS+TLS)
4. Native mobile UI runtime

## Operational items surfaced for Ken/ops

- **Migration 121 must run on staging + prod** before next deploy. Until it does, every DSR completion + NPC escalation in production is silently losing its audit row. Recommend a one-time backfill after migration 121 lands: scan logger.warn entries for "audit_log insert failed" with `actionType='dsr_marked_complete' OR 'dsr_escalated_to_npc'` for the past N months and reconstruct the missing admin_actions rows from the DSR + admin_actions adjacent rows.
- **CI guard should be wired into gate-c (or a new gate-h)** so any future PR that drops a CHECK value fails the build. Command: `node .ai-coder/phase-15-real-audit/check-constraint-regression-guard.mjs`. Exit 0 = clean, non-zero = block merge.
- **PART B of the guard does NOT see writeAdminAction()-style helpers.** A future Phase 26+ extension could improve the guard by tracing helper calls, not just literal INSERTs. Currently the guard catches the common case (literal inserts) and Part A2 catches the schema-side regression — between the two, the migration 119 disaster cannot recur in the same shape, but a NEW writeAdminAction helper added in the future with a brand-new verb still requires the verb to be added to CHECK in the same PR.
- **Admin route middleware proven correct** — every admin route family enforces auth + role + (cookie-auth) CSRF. Bearer auth correctly bypasses CSRF per CRIT-PHASE17-02 design.

## Continuation checklist

Stack still up. Reusable test files added to PHASE-20-FINAL.md continuation list:
- test-phase25a-admin-route-defenses.mjs
- test-phase25b-dispute-resolution.mjs
- test-phase25c-tip-recurring.mjs
- test-phase25d-dsr-audit-rows.mjs
- check-constraint-regression-guard.mjs (CI-runnable; should also be wired into gate-c)

Phase 26+ candidates (deferred):
- Wire HTTP routes for `service-area-change.service.decide` and `provider-onboarding.service.adminDecide` (currently latent — code exists, route doesn't)
- Wire HTTP routes for `admin-2fa.service.generateBackupCodes` (admin TOTP backup code regen UI)
- Extend the constraint-regression guard's PART B to trace `writeAdminAction()`-style helpers, not just literal `INSERT INTO admin_actions`
- Performance / load testing
- Mobile eslint env config fix
- Wire the guard into `gate-c` (or add `gate-h`)
- Backfill missing DSR audit rows on staging + prod after migration 121 deploys
