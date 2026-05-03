# Phase 24 — Audit-log forensic + push queue + BIR/VAT + PayMongo webhook (2026-05-03)

Phase 23 closed prior production blockers. Phase 24 went after the four
biggest remaining audit gaps from the deferred list.

## Coverage delta

| Track | Phase 23 | Phase 24 |
|---|---|---|
| admin_actions verb forensic | sampled | **exhaustive: 78 call sites, 11 broken verbs found + fixed** |
| Push notification queue lifecycle | not tested | **22/22 PASS** |
| BIR/VAT report generation | not tested | **27/27 PASS, 1 fail-closed bug fixed** |
| PayMongo webhook chain (sig + replay + amount) | not tested | **19/19 PASS** |
| Migrations | 119 | **120 (admin_actions widened by 11 verbs)** |
| Total real-runtime assertions | 539+ | **626+ (+87)** |

## Real bugs fixed in Phase 24

| ID | Severity | What broke | Fix |
|---|---|---|---|
| **BUG-PHASE24-01** | **CRIT — DPO consent search 500'd** | `INSERT INTO admin_actions ... 'consent_search'` — verb missing from CHECK constraint. Migration 119 (Phase 19) replaced the constraint and silently dropped this verb (it was added later in routes/compliance-admin.routes.ts but never re-added to a CHECK migration). Every DPO consent search 500'd. | Migration 120 widens CHECK to include `consent_search`. |
| **BUG-PHASE24-02** | **CRIT — audit log CSV export 500'd** | Same root cause — `audit_log_exported` verb missing from CHECK. Every admin's compliance audit export 500'd. | Migration 120 adds verb. |
| **BUG-PHASE24-03..09** | **LATENT — would crash on use** | 7 more verbs (`service_area_change_approved/rejected`, `provider_application_approved/rejected/sent_back`, `admin_backup_codes_generated/regenerated`) emitted by services but rejected by CHECK. No HTTP route currently invokes these services, so the bugs were latent — when wired, they would crash. | Migration 120 adds all 7. |
| **BUG-PHASE24-10..11** | **MED — silent audit row loss** | `bir_2307_batch_generated` / `bir_2307_regenerated` emitted by bir-2307.service in try/catch wrappers — the route succeeded but the audit row silently dropped. BIR doc generation invisible in admin_actions trail. | Migration 120 adds verbs; future generations will write rows. |
| **BUG-PHASE24-12** | **CRIT — second consent_search bug** | Even after migration 120, the consent search route 500'd when the userId query param was omitted. Root cause: the audit row passes `parseString(req.query.userId) ?? null` for `target_id`, but `admin_actions.target_id` is NOT NULL. When userId omitted → null → constraint violation → 500. | Fall back to `req.user.userId` (admin self-target) when no specific subject. |
| **BUG-PHASE24-13** | **CRIT — audit_log_exported NULL violation** | `INSERT ... VALUES ($1, 'audit_log_exported', 'system', NULL, ...)` — target_id hardcoded NULL. Every audit log export still 500'd after the verb fix. | Use admin's own userId, target_type='user'. |
| **BUG-PHASE24-14** | **MED — VAT fail-closed promise broken** | `vat-report.service.generateMonthlyVatReport` claimed in comments to "fail closed" when filer identity unset, but the upsert into `vat_monthly_reports` ran INSIDE the transaction and the filer identity check ran AFTER the trx committed. So an unconfigured launch left phantom rows in the DB even though the route returned 500. | Move `getBirFilerIdentity()` to BEFORE the trx so the throw aborts before any DB mutation. |

## Phase 24a — Audit-log forensic (19/19 PASS)

Built an extractor (`extract-admin-action-verbs.mjs`) that scans every `INSERT INTO admin_actions` literal across `packages/api/src/`, traces dynamic `actionType` variables, and cross-checks against the live DB CHECK constraint.

**Results:**
- 168 source files scanned
- 78 call sites found
- 64 distinct verbs emitted in code
- 78 verbs allowed by CHECK
- **11 verbs emitted but rejected** → fixed via migration 120
- **2 routes had additional NOT-NULL bug on target_id** → fixed in compliance-admin.routes.ts

Test (`test-phase24a-audit-verbs.mjs`) drives each viable verb through its real HTTP route and verifies a row lands in admin_actions. Verbs without current routes get a direct DB CHECK probe to prove migration 120 covers them.

## Phase 24b — Push notification queue (22/22 PASS)

`test-phase24b-push-queue.mjs` exercises every state transition in `push_retry_queue`:

1. `enqueuePushRetry` inserts pending row (status, attempts, max_attempts, last_error)
2. `processPushRetries` with succeeding deliver → status=succeeded, succeeded_at, attempts=1
3. `processPushRetries` with failing deliver → status returns to pending, attempts=1, backoff
4. After 5 failures → status=failed_permanent, failed_permanent_at set
5. `listFailedPermanentPushes` surfaces row to admin
6. **FOR UPDATE SKIP LOCKED concurrency** — 5 rows × 2 parallel workers = exactly 5 succeeded (not 10)

The test runs the actual service code in subshells via tsx so the worker hits real DB writes — no mocks for the queue logic itself.

## Phase 24c — BIR/VAT report generation (27/27 PASS)

`test-phase24c-bir-vat-flow.mjs` drives:

1. **VAT generate fails closed** when filer identity unset (`__UNSET__`) — fixed phantom row bug (BUG-PHASE24-14)
2. **VAT generate succeeds** after filer identity set in `platform_settings`
3. Re-generate is idempotent (ON CONFLICT DO UPDATE)
4. **Finalize** locks the row (`finalized_at`, `finalized_by`)
5. Re-generate after finalize → 409 (immutable)
6. GET / list / annual summary / overview endpoints all 200
7. **Concurrent regenerate is race-safe** — 3 parallel POSTs leave exactly 1 row (FOR UPDATE serialization)
8. Future-month rejected → 400
9. BIR 2307 quarterly batches list

Cleanup restores filer identity to original `__UNSET__` so future runs continue to test fail-closed.

## Phase 24d — PayMongo webhook chain (19/19 PASS)

`test-phase24d-paymongo-webhook.mjs` drives the live `/api/v1/webhooks/paymongo` endpoint with real HMAC-SHA256 signatures:

1. **Missing signature header → 401**
2. **Invalid signature** (correct format, wrong digest) → 401
3. **Replay window expired** (timestamp 10min old, window=5min) → 401
4. **Tampered body** (signature for original, body modified) → 401
5. **Valid payment.paid** → booking flips `payment_pending → paid`, escrow_status `pending → held`, intent `awaiting_payment → succeeded`, escrow wallet `pending_balance` credited
6. **Idempotent re-delivery** → 200, no double-credit (escrow pending unchanged on second hit)
7. **Amount mismatch** (webhook claims 2× the intent amount) → 200 (don't trigger PayMongo retry storm), but booking NOT updated AND `security_events` row written for `payment_amount_mismatch`
8. **Wallet top-up** with `metadata.intent_kind='top_up'` → 200
9. **payment.failed** event → intent flipped to `failed`
10. **Unknown event type** → 200 + no-op

## Cumulative across Phase 17 → 24

- **43 real bugs** found + fixed (3+6+2+1+1+3+1+3+5+4+14 = 43)
- **4 migrations** (117/118/119/120)
- **626+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3326+ total assertions** verified

## Test files committed in Phase 24

- `extract-admin-action-verbs.mjs` — extractor + CHECK probe (run-once)
- `test-phase24a-audit-verbs.mjs` — 19 assertions
- `test-phase24b-push-queue.mjs` — 22 assertions
- `test-phase24c-bir-vat-flow.mjs` — 27 assertions
- `test-phase24d-paymongo-webhook.mjs` — 19 assertions

## What's still genuinely outside autonomous scope

Same as prior phases (unchanged):
1. F#3 Maestro baselines (need iOS sim or proper Android emulator)
2. F#10 attorney-reviewed disclaimer wording
3. 12 D14 ops items (NPC DPO, BIR ATP, PayMongo live, S3 Object Lock, Postgres PITR, DNS+TLS)
4. Native mobile UI runtime

## Operational items surfaced for Ken/ops

- **Migration 120 must run on staging + prod** before next deploy. Without it, DPO consent search and admin audit-log export will continue to 500.
- **Latent verbs (`service_area_change_*`, `provider_application_*`)** mean those features were partially built — services exist, no HTTP routes wire them yet. Future Phase 25+ work could surface them, and migration 120 ensures they won't crash on first use.
- **VAT fail-closed bug (BUG-PHASE24-14) was real** — any cron job or manual VAT generate while filer identity was unset would have left orphan rows. Recommend a one-time cleanup query on prod: `DELETE FROM vat_monthly_reports WHERE pdf_url IS NULL AND finalized_at IS NULL` — those are the phantom rows.
- **Push retry queue confirmed working under concurrency** — production worker can safely run on multiple replicas without double-delivery.

## Continuation checklist

Stack still up. Reusable test files added to PHASE-20-FINAL.md continuation list:
- test-phase24a-audit-verbs.mjs
- test-phase24b-push-queue.mjs
- test-phase24c-bir-vat-flow.mjs
- test-phase24d-paymongo-webhook.mjs

Phase 25+ candidates (deferred):
- Wire HTTP routes for `service-area-change.service.decide` and `provider-onboarding.service.adminDecide` (currently latent — code exists, route doesn't)
- Wire HTTP routes for `admin-2fa.service.generateBackupCodes` (admin TOTP backup code regen UI)
- Audit `migration 119` style regression — a CI guard that fails any PR replacing a CHECK constraint with an explicit list that drops previously-allowed values
- Monitor `audit_log_exported` row count on prod after migration 120 to detect if any tooling was relying on the 500 (unlikely but possible)
- Performance/load testing
- Mobile eslint env config fix
