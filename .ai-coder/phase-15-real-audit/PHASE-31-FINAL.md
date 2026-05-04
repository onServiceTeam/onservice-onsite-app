# Phase 31 — referrals + support tickets + addresses + customer-admin + breach-log (2026-05-04)

Phase 30 closed staff + PII reveal + push tokens + dispatch with zero
new CRIT bugs. Phase 31 took on the next four untouched route surfaces
from PHASE-30-FINAL's continuation list — referral, support-ticket,
address, customer-admin/breach-log. **Zero CRIT bugs found** across all
four. **Two soft bugs** documented (stale API response on referral
redeem; admin-only GET on customer-owned support ticket).

## Coverage delta

| Track | Phase 30 | Phase 31 |
|---|---|---|
| Referral lifecycle (code gen, redeem, credit-after-booking) | not tested | **21/21 PASS** |
| Support tickets CRUD (admin + customer-create flows) | not tested | **27/27 PASS** |
| Address book CRUD (default flip, max-10 limit) | not tested | **28/28 PASS** |
| Customer 360 admin + Breach-log (DPO + 72h SLA) | not tested | **40/40 PASS** |
| Total real-runtime assertions | 1148+ | **1264+ (+116)** |

## Real bugs fixed in Phase 31

**Zero new CRIT bugs.** Every surface tested passed clean. Two soft
bugs documented (see "Operational items" below).

## Phase 31a — Referral lifecycle (21/21 PASS)

`test-phase31a-referrals.mjs` covers:

1. POST /referrals/my-code creates code (8 chars, CSPRNG charset)
2. Idempotent — same code returned on repeat
3. Charset excludes confusable chars (0/1/I/O — MED-N147 trace)
4. POST /redeem credits referee wallet + writes wallet_transactions row
5. Self-redeem → 400
6. Re-redeem same referee → 409 (UNIQUE on referee_id)
7. Bogus code → 404
8. GET /my-referrals returns ranked list with pagination
9. **creditReferrerAfterBooking** verified: wallet credited, redemption
   marked credited, qualifying_booking_id stored, idempotent on 2nd call
10. No auth → 401
11. **DB-level state correctness** (referee_credited TRUE post-UPDATE)

**Soft observation:** `POST /referrals/redeem` returns the redemption
row captured at INSERT time (`refereeCredited=false`), but the service
later UPDATEs `referee_credited=TRUE` without re-reading the row. The
wallet IS credited (verified in test) but the API response is stale.
Customer-facing UI showing "you got $X" works fine since wallet is the
source of truth — this is cosmetic. Could be tightened by re-SELECTing
in `redeemReferralCode` before returning.

## Phase 31b — Support tickets (27/27 PASS)

`test-phase31b-support-tickets.mjs` covers:

1. POST /support-tickets — customer creates, ticket_number generated (TKT-NNNN)
2. Missing required fields → 400
3. GET / — admin lists; customer → 403
4. GET /:id — admin reads with messages array
5. POST /:id/messages — owner posts public message
6. Non-owner customer → 403
7. Customer cannot post internal_note → 403
8. Admin posts internal_note successfully
9. PATCH /:id/status — admin moves to resolved + resolution_notes
10. Customer PATCH status → 403
11. PATCH /:id/assign — admin assigns to agent
12. **Documented design:** GET /:id is admin-only — customer who created
    the ticket cannot fetch it back via this endpoint
13. No auth → 401

**Soft observation:** GET /:id is `rbacMiddleware('admin', 'super_admin')`
only. POST /:id/messages allows the ticket owner (auth + ownership
check), but GET /:id does not. Today no mobile UI calls this endpoint,
so it's not exploited — but the day a customer "My Support Tickets"
screen ships, the GET will need to be widened to include the owner.
Documented; deferred until mobile support flow lands.

## Phase 31c — Address book CRUD (28/28 PASS)

`test-phase31c-addresses.mjs` covers:

1. First address auto-default (when user has 0 addresses)
2. New address with `isDefault=true` demotes the previous default
3. Third address with no flag stays non-default
4. GET / ordered (default first, then created DESC)
5. GET /:id — owner reads
6. Stranger GET → 404 (per-user scope on getAddressById)
7. PATCH partial — relabel + flip default in one PATCH
8. DELETE non-default — count drops by 1, no auto-promote
9. **DELETE default — auto-promotes oldest remaining to default**
10. MAX_ADDRESSES_PER_USER=10 — 11th create → 400
11. Stranger PATCH → 404
12. No auth → 401
13. Validator missing required fields → 400

**Note on label enum:** `address.label` is constrained by Zod to
`'Home' | 'Work' | 'Other'` (not free-form). The 10-address limit
test cycles through these three labels.

## Phase 31d — Customer 360 admin + Breach-log (40/40 PASS)

`test-phase31d-customer-admin-breach.mjs` covers:

**Customer 360 (admin/super_admin):**
1. GET /admin/customers/:id — profile
2. GET /admin/customers/:id/bookings (paginated)
3. GET /admin/customers/:id/payments
4. GET /admin/customers/:id/disputes
5. GET /admin/customers/:id/referrals
6. GET /admin/customers/:id/activity (PII mask: super_admin gets raw IP/UA per MED-N17)
7. PUT /:id/status — super_admin suspends + reactivates (user.is_active flips)
8. POST /:id/credit — super_admin grants wallet credit (verified +50000 centavos)
9. customer → 403 on profile
10. Bogus action → 400

**Breach-log (DPO + super_admin):**
11. POST /admin/breach-log creates with valid type + scope + computes sla72h
12. POST /admin/breach-log requires scope ≥ 10 chars → 400
13. POST /admin/breach-log rejects discoveredAt < occurredAt → 400
14. GET / lists with sla72h fields enriched
15. ?pendingNpcOnly=true filters to npc_notified_at IS NULL
16. POST /:id/notify-npc rejects bad NPC ref format → 400 (MED-N79)
17. POST /:id/notify-npc accepts NPC-YYYY-XXXXXX format + auto-advances
    status investigating → reported
18. POST /:id/notify-npc on already-notified row → 409
19. PATCH /:id/status investigating → mitigating + remediation_summary
20. Plain admin role (not DPO/super_admin) → 403
21. **admin_actions trail captures all 3 verbs** (breach_logged,
    breach_npc_notified, breach_status_changed) per NPC RA 10173 §38

## Cumulative across Phase 17 → 31

- **53 real bugs** found + fixed (unchanged from Phase 30 — Phase 31 found none)
- **2 soft bugs** added to backlog (stale referral redeem response;
  customer support ticket GET)
- **7 migrations** (117/118/119/120/121/122/123)
- **1264+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3964+ total assertions** verified
- **+1 latent route wired** (PII reveal — Phase 30b)

## Test files committed in Phase 31

- `test-phase31a-referrals.mjs` — 21 assertions
- `test-phase31b-support-tickets.mjs` — 27 assertions
- `test-phase31c-addresses.mjs` — 28 assertions
- `test-phase31d-customer-admin-breach.mjs` — 40 assertions

## Files changed in Phase 31

None. All four surfaces were already correctly implemented; Phase 31
was pure audit (test-only). No production code touched.

## Operational items surfaced for Ken/ops

- **Referral redeem response carries stale `refereeCredited`**: Mobile
  client should not rely on this flag from the redeem response; should
  call GET /referrals/my-referrals after to confirm. Wallet IS credited
  (the test proves $5000 lands). One-line fix: re-SELECT after the
  UPDATE in `redeemReferralCode`. Not a security issue, no data lost.
- **Support tickets are admin-read-only**: A customer can create + reply
  via POST endpoints, but cannot GET their own ticket back. Today no
  mobile UI calls GET /support-tickets/:id, so no actual problem. When
  the customer "My Tickets" screen lands in mobile, the GET handler
  needs widening to allow owner access (same pattern as
  POST /:id/messages already uses).
- **Customer 360 admin flows all pass clean**: Suspend/reactivate
  toggles `users.is_active`. Wallet credit verified via real DB diff.
  PII masking on activity respects super_admin/dpo bypass per MED-N17.
- **Breach-log NPC compliance trail proven correct**: All three audit
  verbs (breach_logged, breach_npc_notified, breach_status_changed) are
  written. NPC reference format strictly enforced (MED-N79 regex). The
  72h SLA is computed in-app from discovered_at; the cron job
  (jobs/breach-sla-checker.ts) drives the 60h-warning + 72h-expired
  alerts. RA 10173 §38 trail is in place.

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase31a-referrals.mjs
- test-phase31b-support-tickets.mjs
- test-phase31c-addresses.mjs
- test-phase31d-customer-admin-breach.mjs

Phase 32+ candidates (deferred):
- **Newly-tracked soft bugs (cosmetic fixes):**
  - Re-SELECT in `redeemReferralCode` so the API response matches DB state
  - Widen GET /support-tickets/:id to allow ticket owner (when mobile
    "My Tickets" screen ships)
- **Untouched routes still on the list:**
  - notification-template.routes.ts — admin template CRUD + send
  - settings.routes.ts — platform config get/put + history
  - checklist.routes.ts — provider checklists CRUD
  - catalog.routes.ts — services + addons + tags (largest untouched, 481 LOC)
  - account.routes.ts — user profile + email/phone update
- **Real product work (deferred per CLAUDE.md hard-stops — Ken decision):**
  - Implement actual 45s round-robin offer cycle (config exists, no
    code wires it)
  - Quiet hours feature (notification_preferences extension)
  - BIR/VAT report PDF generation runtime
- **Outside autonomous scope per CLAUDE.md:**
  - F#3 Maestro baselines (need iOS sim or Android emulator)
  - F#10 attorney-reviewed disclaimer wording
  - 12 D14 ops items (NPC DPO, BIR ATP, PayMongo live, S3 Object Lock,
    Postgres PITR, DNS+TLS)
- **Performance / load testing** still deferred
