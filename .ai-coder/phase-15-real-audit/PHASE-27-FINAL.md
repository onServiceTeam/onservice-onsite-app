# Phase 27 — wallet topup + reviews + sockets + multer fix (2026-05-03)

Phase 26 closed cancellation, cron, dispatch, and upload paths. Phase 27
went after the next four untouched flows. **One CRIT bug found + fixed
(wallet topup completely broken since the feature shipped).**

## Coverage delta

| Track | Phase 26 | Phase 27 |
|---|---|---|
| Wallet topup flow (intent → webhook → credit) | not tested | **20/20 PASS, CRIT bug fixed via mig 122** |
| Reviews + ratings flow (create, flag, respond, aggregate) | not tested | **25/25 PASS** |
| Socket / real-time event emission | not tested | **11/11 PASS** |
| Multer error code mapping (500 → 400) | open | **fixed** |
| Total real-runtime assertions | 829+ | **885+ (+56)** |

## Real bugs fixed in Phase 27

| ID | Severity | What broke | Fix |
|---|---|---|---|
| **BUG-PHASE27-01** | **CRIT — wallet topup completely broken since feature shipped** | `wallet.routes.ts:91` builds `topUpId = 'topup_<userId>_<timestamp>'` (string) and passes it to `paymentService.createPaymentIntent` as the `bookingId` arg. The function INSERTs that into `payment_intents.booking_id` which is `uuid NOT NULL`. Postgres rejects with `invalid input syntax for type uuid` → every customer attempt to top up wallet 500'd. Phase 24d's webhook test acknowledged the bug (test-phase24d:265-269 worked around it with a fake UUID `00000000-...`) but the actual production flow stayed broken. | **Migration 122**: makes `payment_intents.booking_id` nullable, adds `topup_id text` column with index + xor CHECK constraint. **`payment.service.createPaymentIntent`**: when `intentKind='top_up'`, INSERT with `booking_id=NULL` + `topup_id=<topUpId>`. **New `getTopupPaymentIntent(topupId)`**: webhook handler routes topup events through this instead of `getBookingPaymentIntent`. **`webhook.routes.ts`**: `payment.paid` and `payment.failed` cases pick the right lookup based on `isTopUp`. |

## Phase 27a — Wallet topup (20/20 PASS)

`test-phase27a-wallet-topup.mjs` drives the full topup pipeline:
1. POST /wallet/top-up creates payment_intent with `metadata.intent_kind='top_up'` + `topup_id` populated
2. amount < min → 400; amount > max → 400; invalid paymentMethod → 400
3. Webhook payment.paid for the topup intent → wallet `available_balance` credited (centavos exact)
4. Idempotent webhook re-delivery → no double-credit (intent.status=succeeded short-circuits)
5. No auth → 401
6. Two parallel topups → both credit (no race lost)

Plus DB-level checks confirming `payment_intents.topup_id` populated and `wallet_transactions` audit row written.

## Phase 27b — Reviews + ratings (25/25 PASS)

`test-phase27b-reviews-ratings.mjs` covers the full review lifecycle:
1. Customer creates 5-star review on confirmed booking → review row + provider rating updated to 5.00
2. Cannot review in_progress booking → 4xx (status guard)
3. Wrong customer cannot review someone else's booking → 403
4. Cannot create second review on same booking → 409
5. Aggregate recomputed: 5★ + 3★ → provider rating = 4.00
6. **Profanity (PH/EN list) → `is_flagged=TRUE`, `is_visible=FALSE`** → flagged review excluded from aggregate
7. **Phone number in comment → flagged** (off-platform contact attempt)
8. Tags allowlist enforced at validator (z.enum) — unknown tag → 400
9. Provider responds to review once → second response → 409
10. GET /reviews/provider/:id returns aggregate + paginated reviews
11. GET /reviews/booking/:id returns the right review
12. Comment > 2000 chars → 400 (defense-in-depth length cap)

## Phase 27c — Socket / real-time event emission (11/11 PASS)

`test-phase27c-socket-events.mjs` connects a real Socket.IO client to the
running API and verifies event emission:
1. Admin connects with valid JWT → connected
2. Connect without token → rejected with `Authentication required`
3. Connect with expired JWT → rejected
4. PATCH /bookings/:id/status → admin receives `booking:status_changed` event with correct `id` + `newStatus`
5. Customer socket connected → does NOT receive admin:global events (room isolation)
6. Second status transition (provider_arrived) → admin gets it again, customer still doesn't

## Phase 27d — Multer error → 400 mapping (regression check)

`error.middleware.ts` extended to recognize `MulterError` and the
`LIMIT_*` codes (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE,
LIMIT_FILE_COUNT, etc.) — normalize to 400 with the multer message
preserved. `upload.routes.ts` `fileFilter` callback now uses
`createAppError(...)` so invalid-MIME rejections are 400'd directly.

Re-running `test-phase26d-upload-flow.mjs`:
- Test 4 (invalid MIME) was returning 500, now returns 400 ✓
- Test 6 (oversize file) now returns 400 ✓
- All other 17 assertions unchanged → 19/19 still pass

## Cumulative across Phase 17 → 27

- **48 real bugs** found + fixed (3+6+2+1+1+3+1+3+5+4+14+2+2+1 = 48)
- **6 migrations** (117/118/119/120/121/122)
- **885+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3585+ total assertions** verified

## Test files committed in Phase 27

- `test-phase27a-wallet-topup.mjs` — 20 assertions
- `test-phase27b-reviews-ratings.mjs` — 25 assertions
- `test-phase27c-socket-events.mjs` — 11 assertions

## Files changed in Phase 27

- `packages/api/migrations/122_phase27_payment_intents_topup_id.sql` — new
- `packages/api/src/services/payment.service.ts` — BUG-PHASE27-01: dual-key INSERT (booking_id XOR topup_id) + new `getTopupPaymentIntent`
- `packages/api/src/routes/webhook.routes.ts` — BUG-PHASE27-01: route topup lookups through `getTopupPaymentIntent`
- `packages/api/src/middleware/error.middleware.ts` — Multer error → 400 normalization
- `packages/api/src/routes/upload.routes.ts` — `fileFilter` uses `createAppError` for clean 400

## Operational items surfaced for Ken/ops

- **BUG-PHASE27-01 — every wallet topup ever attempted in prod has 500'd**. Customer never charged (PayMongo intent creation failed in dev too — see API log "PayMongo returned status 401"; in prod with valid keys the intent IS created but the local INSERT then 500s). On staging + prod after migration 122 + the code fix, monitor `payment_intents` for `topup_id IS NOT NULL` rows landing successfully. There's no historical backfill needed — the DB never had broken topup rows, the route just always 500'd before reaching the INSERT (either at PayMongo step or at the local INSERT step).
- **Profanity / phone-number / URL flagging proven correct** for the documented patterns. The list lives at `review.service.ts:332-341` and is admin-tunable in code (no DB setting). Adding new patterns requires a code deploy.
- **Socket admin:global isolation proven correct** — customer sockets never receive admin events. Per-socket rate limit (60 events/60s) and JWT exp re-check (60s interval) are wired but were not exhaustively driven this phase (would need long-running test).

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase27a-wallet-topup.mjs
- test-phase27b-reviews-ratings.mjs
- test-phase27c-socket-events.mjs

Phase 28+ candidates (deferred):
- Wire HTTP routes for `service-area-change.service.decide`, `provider-onboarding.service.adminDecide`, `admin-2fa.service.generateBackupCodes` (still latent — code from Phase 24a forensic, no routes)
- Per-socket rate limit + JWT exp re-check (long-running test, not driven this phase)
- BIR/VAT report PDF generation (route + status verified Phase 24c; PDF rendering not driven)
- Customer/provider mobile end-to-end via real Expo dev client (outside autonomous scope per CLAUDE.md hard-stops)
- Real-time admin dispatch dashboard with multiple connected admins (verify broadcast under load)
- Performance / load testing
