# Phase 34 — service-area + payouts + financial-admin + provider self-service (2026-05-04)

Phase 33 closed account + cancellation + compliance + auth deeper with
one bug fix. Phase 34 hit four more route surfaces from
PHASE-33-FINAL's continuation list. **Zero new bugs found** — every
audited surface was correctly implemented.

## Coverage delta

| Track | Phase 33 | Phase 34 |
|---|---|---|
| Service-area public + provider assignments | not tested | **28/28 PASS** |
| Payout / withdrawal end-to-end (request → AML → approve → complete) | partial (21) | **29/29 PASS** |
| Financial admin (revenue/escrow/payouts/OR cancel) | partial (21) | **28/28 PASS** |
| Provider self-service (apply/me/services/schedule/portfolio) | not tested | **25/25 PASS** |
| Total real-runtime assertions | 1475+ | **1585+ (+110)** |

## Real bugs fixed in Phase 34

**Zero new bugs.** Every surface tested passed clean.

## Phase 34a — Service area (28/28 PASS)

`test-phase34a-service-area.mjs` covers:

1. GET / lists active areas (cached)
2. **GET /check?lat=&lng= — covered=true** for in-area coords (Boracay
   center)
3. **GET /check uncovered** — covered=false + nearestArea + distanceKm
   computed (tested with Manila coords against Boracay area)
4. /check missing params → 400
5. /check invalid coords (lat=200) → 400
6. GET /:slug for active area → 200
7. GET /:slug for retired area → 404 (route filters by status)
8. POST /waitlist creates entry
9. Invalid PH phone format → 400
10. Missing fields → 400
11. **MED-N163 IP rate limit — 6th waitlist within 60s from same IP → 429**
12. GET /:id/providers (auth required, returns provider list)
13. POST /provider/areas — provider assigns to area
14. GET /provider/my-areas lists assignments
15. **Documented design:** Duplicate POST /provider/areas UPSERTs
    is_primary instead of 409 — second call returns 201 + flips flag,
    DB still has 1 row
16. No auth on /provider/my-areas → 401

## Phase 34b — Payouts (29/29 PASS)

`test-phase34b-payouts.mjs` covers full provider withdrawal lifecycle:

1. POST /payouts/request — provider with sufficient balance
2. Under minimum withdrawal → 400
3. Bogus method → 400 (Zod enum)
4. Destination account too short → 400
5. Pending exists → 409 (one-at-a-time invariant)
6. Customer POST → 403
7. GET /my lists own payouts
8. Customer GET /my → 403
9. Stranger provider GET /:id → 403
10. GET / admin lists all
11. Customer GET / → 403
12. **PUT /:id/approve super_admin → status=approved**
13. **PUT /:id/approve admin (not super) → 403 (MED-N159)**
14. PUT /:id/reject super_admin with reason ≥ 10 chars
15. Reject short reason → 400
16. PUT /:id/complete with paymongoTransferId → status=completed/paid_out
17. **AML over-threshold → status='aml_review_pending' (MED-N77)** —
    ₱500K request from PROV2 wallet
18. PUT /:id/clear-aml-review super_admin → status=pending (clears AML hold)
19. No auth → 401

**GCash format validation verified**: destination must match
`/^09\d{9}$/` (11-digit PH mobile). Pre-fix attempt with `+639...` was
rejected with the route's MED-N78 validation message.

## Phase 34c — Financial admin (28/28 PASS)

`test-phase34c-financial-admin.mjs` covers admin financial dashboards
+ OR cancellation:

1. GET /overview — admin returns aggregates
2. customer → 403
3. Missing date range → 400
4. /revenue/by-category → array
5. /revenue/by-city ?limit=5 → array
6. /revenue/by-tier
7. /revenue/by-payment
8. /escrow summary object
9. /payouts summary
10. /guarantee-fund summary
11. /receipts/search ?orNumber → `{rows, total}` shape, our OR found
12. GET /receipts/:id known → 200
13. Bogus id → 404
14. **POST /:id/cancel admin → 403**
15. **POST /:id/cancel super_admin → 201, cancelled_at + cancelled_by
    set, NEW negative-OR row created with cancels_or_id link** (BIR
    audit trail)
16. POST /:id/cancel no reason → 400
17. No auth → 401

## Phase 34d — Provider self-service (25/25 PASS)

`test-phase34d-provider.mjs` covers the provider lifecycle from apply
through profile + services + schedule + portfolio:

1. POST /providers/apply — minimal happy path with all required URLs
2. Missing icAgreementAccepted → 400
3. **Lat out of PH band (Tokyo) → 400 (MED-M06)** — phLatitude/phLongitude
   tight bounds enforced
4. GET /application-status returns submitted state
5. GET /me — provider sees profile + services + ratings + portfolio +
   certifications
6. customer GET /me → 403
7. PATCH /me bio + yearsExperience
8. PATCH /me empty body → 400
9. POST /me/services adds a service for an existing subcategory
10. Bogus subcategoryId → 404
11. GET /me/services lists provider's services
12. DELETE /me/services/:subcategoryId removes
13. PUT /me/schedule sets weekly schedule (7-day array)
14. GET /me/schedule returns 7 days
15. **GET /:id (public profile) — auth required (MED-N96 fix)** —
    pre-fix this was unauthenticated and returned competitive intel
16. POST /me/portfolio adds image item
17. DELETE /me/portfolio/:itemId removes
18. No auth → 401

## Cumulative across Phase 17 → 34

- **55 real bugs** found + fixed (unchanged from Phase 33 — Phase 34 found none)
- **2 soft bugs** documented (referrals stale response; support-ticket
  GET admin-only)
- **7 migrations** (117/118/119/120/121/122/123)
- **1585+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 4285+ total assertions** verified
- **+1 latent route wired** (PII reveal — Phase 30b)

## Test files committed in Phase 34

- `test-phase34a-service-area.mjs` — 28 assertions
- `test-phase34b-payouts.mjs` — 29 assertions
- `test-phase34c-financial-admin.mjs` — 28 assertions
- `test-phase34d-provider.mjs` — 25 assertions

## Files changed in Phase 34

None. All four surfaces were already correctly implemented; Phase 34
was pure audit (test-only). No production code touched.

## Operational items surfaced for Ken/ops

- **Service-area waitlist IP rate limit verified**: MED-N163 caps at
  5 submissions per minute per IP. Tested with synthetic IP rotation
  + 8 attempts → 429 by attempt 6. Marketing exports stay clean of
  scripted spam.
- **Payout AML flow proven**: ₱500K threshold from
  `aml_large_transaction_threshold_centavos` setting. Above-threshold
  requests land in `aml_review_pending`. Super_admin clears with
  POST /:id/clear-aml-review → flips to `pending` so the standard
  approve/reject flow takes over. RA 9160 covered-transaction trail
  via `aml_threshold_at_request_centavos` snapshot column.
- **Approve/reject/complete are super_admin only (MED-N159)**:
  Junior admin can browse all payouts (transparency) but cannot move
  money. Verified `requireSuperAdmin` guard on every mutation.
- **OR cancellation creates negative receipt + audit row**: Super_admin
  cancellation writes (a) cancelled_at + cancelled_by on the original
  OR, (b) a NEW receipt with `cancels_or_id` pointing back, (c) an
  admin_actions audit row. BIR ATP-compliant trail.
- **Provider self-service lat/lng band**: phLatitude/phLongitude
  validators reject coords outside the tight 4.5..21.5 / 116..127.5 PH
  band per MED-M06. Tested with Tokyo coords (35.68/139.76) → 400.
- **Public provider profile is auth-required (MED-N96)**: GET
  /providers/:id requires Bearer token. Pre-fix scrapers could
  enumerate the provider directory + competitive pricing without an
  account. Now requires login.

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase34a-service-area.mjs
- test-phase34b-payouts.mjs
- test-phase34c-financial-admin.mjs
- test-phase34d-provider.mjs

Phase 35+ candidates (deferred):
- **Routes still on the list:**
  - admin.routes.ts (large legacy admin surface — partial coverage)
  - test-fixtures.routes.ts (dev-only — likely off in prod)
  - dispatch deeper (covered piecewise; full ranking algo not asserted)
  - provider-admin.routes.ts (admin-side provider management — partial)
  - booking.routes.ts deeper (status transitions matrix not exhaustive)
- **Soft bugs still open from prior phases:**
  - Re-SELECT in `redeemReferralCode` so the API response matches DB
  - Widen GET /support-tickets/:id to allow ticket owner
  - Customer-owner can toggle checklist items (product decision)
- **Real product work (deferred per CLAUDE.md hard-stops):**
  - 45s round-robin offer cycle
  - Quiet hours feature
  - BIR/VAT report PDF generation runtime
- **Outside autonomous scope:**
  - F#3 Maestro baselines, F#10 attorney wording, 12 D14 ops items
- **Performance / load testing** still deferred
