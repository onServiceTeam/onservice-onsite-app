# Phase 29 — suki + promo + waitlist + messaging (2026-05-04)

Phase 28 closed business accounts + notifications + 3 latent admin
routes. Phase 29 went after the next four untouched user-visible flows.
**2 CRIT production bugs found + fixed.** Both crashed every first-time
attempt at the feature; the work-arounds for daily ops would have been
manual ticket triage.

## Coverage delta

| Track | Phase 28 | Phase 29 |
|---|---|---|
| Suki rewards / loyalty discount + tier transitions | not tested | **27/27 PASS** |
| Promotion code redemption (full flow + edge cases) | not tested | **18/18 PASS** |
| Slot waitlist (join, notify, cancel, expire) | not tested | **19/19 PASS, 1 CRIT bug fixed** |
| Conversation messaging (create, send, read, unread) | not tested | **21/21 PASS, 1 CRIT bug fixed** |
| Total real-runtime assertions | 984+ | **1069+ (+85)** |

## Real bugs fixed in Phase 29

| ID | Severity | What broke | Fix |
|---|---|---|---|
| **BUG-PHASE29-01** | **CRIT — every slot-waitlist join 500'd** | `slot-waitlist.service.joinSlotWaitlist` did `SELECT COUNT(*) FROM booking_slot_waitlist ... FOR UPDATE` for race-safe dedup (MED-N134). Postgres rejects this combination: "FOR UPDATE is not allowed with aggregate functions". The MED-N134 fix was never exercised against a real DB so the parser error was undetected. Every customer attempt to join the slot waitlist 500'd. | Replace with `SELECT id ... LIMIT 1 FOR UPDATE`. Same TOCTOU protection (row-level lock on any matching row), no aggregate. ON CONFLICT DO NOTHING + 23505 catch on the INSERT below remains the defense-in-depth. |
| **BUG-PHASE29-02** | **CRIT — every first-time chat conversation 500'd** | `messaging.service.getOrCreateConversation` does `INSERT INTO conversations ... ON CONFLICT (booking_id) DO UPDATE`, but `conversations` table only had a non-unique btree index `idx_conversations_booking` — no UNIQUE constraint. Postgres parses ON CONFLICT and rejects with "no unique or exclusion constraint matching". Existing conversations work via the SELECT pre-check; first-time chat creation is 100% broken. | **Migration 123**: drop the non-unique index, add `UNIQUE (booking_id)` constraint. Defense: if duplicates exist (shouldn't), collapse to oldest + re-point messages before adding the constraint. |

## Phase 29a — Suki rewards (27/27 PASS)

`test-phase29a-suki-rewards.mjs` covers the full loyalty-tier flow:
1. `recordBookingForSuki` creates membership at tier=new with correct points
2. Tier transitions: 3 bookings → regular, 10 → suki, 25 → super_suki
3. Each tier-up writes a bonus reward + 'Suki Tier Up!' notification
4. `calculateSukiDiscountForBooking` returns correct discountPercent + discountAmount per tier
5. **`redeemPoints` uses CRIT-N127 conversion (points / 100)** — 200 points → ₱2 wallet credit
6. Insufficient balance throws
7. Non-multiple-of-100 throws
8. **Concurrent redemption is race-safe** — 5 parallel 100pt redeems on a 100pt balance leave exactly 1 success + 4 rejected + final balance 0 (Phase B CRIT-11 verified)
9. GET /suki/memberships
10. GET /suki/memberships/:id/rewards
11. POST /suki/redeem (HTTP path)
12. Wrong customer GET rewards → 403

## Phase 29b — Promotion code redemption (18/18 PASS)

`test-phase29b-promo-codes.mjs` drives `resolvePromo` via direct
service import + `recordPromoRedemption` against the live DB:
1. Admin creates promo (10% off, ₱500 min, ₱200 cap, per-customer 1, total 5)
2. Percentage discount: 10% of ₱1000 = ₱100
3. Fixed-amount: literal ₱150
4. max_discount_centavos cap honored (10% of ₱5000 capped at ₱200)
5. minimum_order_centavos floor → promo_min_order_not_met
6. Inactive promo → promo_invalid
7. Expired (valid_until past) → promo_invalid
8. Future-dated (valid_from future) → promo_invalid
9. usage_limit_total exhausted → promo_exhausted
10. **MED-N154 verified**: per-customer limit enforced via promo_redemptions count
11. recordPromoRedemption inserts + idempotent on duplicate (booking_id, promo_code_id)
12. Discount capped at subtotal (fixed promo > order)
13. Bogus / empty code / negative subtotal all → promo_invalid

## Phase 29c — Slot waitlist (19/19 PASS)

`test-phase29c-slot-waitlist.mjs` drives the full waitlist lifecycle:
1. POST /slot-waitlist creates entry
2. Past date → 400
3. Missing fields → 400
4. Duplicate (same customer + date + category) → 409 (BUG-PHASE29-01 fix)
5. GET /slot-waitlist returns customer's entries; isolation across users
6. Wrong customer DELETE → 404
7. DELETE flips status to cancelled; re-cancel → 404
8. **`processSlotAvailability` flips waiting→notified** + creates 'area_launch' notifications (MED-N133 dispatch verified)
9. Notifications received by customer
10. **`expireOldWaitlistEntries`** flips past-expires waiting → expired

## Phase 29d — Conversation messaging (21/21 PASS)

`test-phase29d-messaging.mjs` covers full chat lifecycle:
1. POST /messaging creates conversation for booking (BUG-PHASE29-02 fix)
2. Idempotent — POST again returns the same conversation
3. Wrong user (not customer or provider) → 403
4. POST /:id/messages sends message + notification fires to recipient
5. GET /:id/messages returns paginated messages
6. POST /:id/read marks unread → read with count
7. GET /unread/count returns number
8. Send > 2000 chars → 400
9. Empty content → 400
10. Wrong user GET messages → 403/404
11. Auth required on every endpoint → 401

## Cumulative across Phase 17 → 29

- **53 real bugs** found + fixed (3+6+2+1+1+3+1+3+5+4+14+2+2+1+3+2 = 53)
- **7 migrations** (117/118/119/120/121/122/123)
- **1069+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3769+ total assertions** verified

## Test files committed in Phase 29

- `test-phase29a-suki-rewards.mjs` — 27 assertions
- `test-phase29b-promo-codes.mjs` — 18 assertions
- `test-phase29c-slot-waitlist.mjs` — 19 assertions
- `test-phase29d-messaging.mjs` — 21 assertions

## Files changed in Phase 29

- `packages/api/migrations/123_phase29_conversations_booking_unique.sql` — new
- `packages/api/src/services/slot-waitlist.service.ts` — BUG-PHASE29-01 fix

## Operational items surfaced for Ken/ops

- **BUG-PHASE29-01** (slot waitlist 500): every customer who tried to join the waitlist (after a no-providers-available message) got a generic 500. The "you've joined the waitlist for this slot" UX has been broken since the MED-N134 race-safe dedup landed. Customer impact: zero waitlist activity in the DB even when the UI button worked. Recommend: monitor `booking_slot_waitlist` row-insert rate after deploy — should jump from 0 to expected baseline.
- **BUG-PHASE29-02** (conversation creation 500): first-time chat between customer and provider always 500'd. After the first conversation row exists (somehow seeded), subsequent fetches via the SELECT pre-check work — but no greenfield chat was ever possible. Customer impact: chat feature appears broken from the customer's first attempt. Recommend: monitor `conversations` row-insert rate after deploy + watch for the "There was a problem starting the chat" error UI to disappear.
- **MED-N127 verified**: suki points-to-peso conversion is correctly 100:1 (1% cashback at base tier). The earlier worry of "points = pesos" wasn't ever in production code, but the test confirms the rate is honored.
- **MED-N154 verified**: per-customer promo limit enforced via promo_redemptions table. NPC-relevant: promotional offer limits are auditable per customer.
- **Suki concurrent redemption race-safe**: Phase B CRIT-11 fix (WHERE points_balance >= $1 + RETURNING) verified — 5 parallel 100pt redeems on a 100pt balance produce exactly 1 success.
- **Bypass detection (Phase 26b cron)** is the path that flags `messages.is_flagged = TRUE` for off-platform-contact attempts. send-time does NOT flag. Documented as architectural choice (lower latency, batched work).

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase29a-suki-rewards.mjs
- test-phase29b-promo-codes.mjs
- test-phase29c-slot-waitlist.mjs
- test-phase29d-messaging.mjs

Phase 30+ candidates (deferred):
- Quiet hours support (notification_preferences extension + check in send)
- BIR/VAT report PDF generation runtime
- Admin staff add/remove/role-promote/demote (staff.routes — not yet driven E2E)
- Dispatch broadcast / job offer chain (45s offer timer, MAX_MATCH_ATTEMPTS round-robin)
- Customer push token lifecycle (DeviceNotRegistered handling at delivery time)
- Customer/provider mobile end-to-end via real Expo dev client (still outside autonomous scope per CLAUDE.md hard-stops)
- Performance / load testing
- Per-socket rate-limit window-reset verification (long-running test)
