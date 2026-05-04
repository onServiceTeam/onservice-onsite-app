# Phase 33 — account + cancellation policy + compliance + auth deeper (2026-05-04)

Phase 32 closed templates + settings + checklist + catalog with one
CRIT bug fix. Phase 33 hit four more route surfaces. **One real bug
found and fixed** in Phase 33c — the consent endpoint surfaced a DB
CHECK constraint violation as 500 instead of 400.

## Coverage delta

| Track | Phase 32 | Phase 33 |
|---|---|---|
| Account routes (DPA portability + erasure) | not tested | **23/23 PASS** |
| Cancellation policy (public read + admin editor) | partial | **27/27 PASS** |
| Compliance + consent (DSR + consent records) | partial (23d) | **20/20 PASS** |
| Auth deeper (me + refresh-token + logout) | partial (23a) | **21/21 PASS** |
| Total real-runtime assertions | 1384+ | **1475+ (+91)** |

## Real bugs fixed in Phase 33

**1 new bug fixed:**

### BUG-PHASE33-01 — `recordConsent` surfaces DB CHECK as 500

`packages/api/src/services/compliance.service.ts:209-230` —
`recordConsent` validated `consentType` for length/type but NOT against
the DB CHECK allow-list (migration 080's `consent_records_type_valid`).
A customer hitting POST /api/v1/compliance/consent with a typo or stale
`consentType` from old mobile-build code got a 500 with the generic
"unexpected error" message — same shape as CRIT-PHASE32-01.

Mobile flow most likely to hit it: a returning user opening the app
after a mobile release that renamed a consent slug, or the marketing
team adding a new consent surface that the mobile build hadn't picked
up yet. Customer sees the generic error → support ticket.

**Fix:** Added `VALID_CONSENT_TYPES` Set mirrored from migration 080,
checked before INSERT. Returns 400 with the actionable list of valid
types. Migration's COMMENT already documents the procedure for adding
new types — extending the Set should happen in lockstep.

**Severity:** Soft-medium — not exploitable for security, just poor UX
that masks broken client behavior. Fix is small + defensive.

## Phase 33a — Account routes (23/23 PASS)

`test-phase33a-account.mjs` covers DPA RA 10173 right-to-portability +
right-to-erasure:

1. POST /account/data-export creates pending request
2. GET lists user's exports
3. Second pending → 409 (race-window dedup)
4. format=csv accepted
5. POST /account/deletion creates pending + 30d cooling_off
6. Second pending → 409
7. **Cancellable booking blocks → 409 with "complete or cancel" message**
8. **In-progress booking → distinct MED-N55 message**
   ("still in progress and will auto-complete soon")
9. GET /deletion/status returns active row
10. POST /deletion/cancel — within cooling-off → 200, status=cancelled
11. **MED-N54 race guard**: Cancel after cooling-off elapsed → 404
    (synthetic test — backdate cooling_off_ends_at)
12. Cancel with no request → 404
13. No auth → 401

## Phase 33b — Cancellation policy (27/27 PASS)

`test-phase33b-cancellation-policy.mjs` covers D02 Bug 1170/1198:

**Public:**
1. GET /settings/cancellation-policy — no auth
2. Returns tiers + intro_text + provider_no_show_credit_php
3. Idempotent (cached)

**Admin (super_admin only):**
4. GET /admin/cancellation-policies super_admin lists versions
5. Plain admin → 403
6. GET /:version returns full payload
7. /:version=0 → 400
8. /:version=99999 → 404
9. POST creates new version + closes old (effective_to set)
10. **Validator: refund + fee != 100 → 400**
11. **Validator: top tier max_hours_before must be null → 400**
12. **Validator: bottom tier min_hours_before must be ≤ 0 → 400**
13. **Validator: gap between tiers (row[i].min ≠ row[i+1].max) → 400**
14. PUT in-place edit (within 1h, on active version) → 200
15. PUT on non-active version → 409
16. **PUT after 1h window → 409** (synthetic — backdate created_at)
17. customer POST → 403
18. No auth → 401

## Phase 33c — Compliance + consent (20/20 PASS)

`test-phase33c-compliance.mjs` covers DSR + consent flows:

1. POST /compliance/dsr creates with valid request_type
2. **due_at = received_at + 15 days** (NPC RA 10173 §16)
3. Bogus request_type → 400
4. Missing request_type → 400
5. **5-in-24h cap enforced — 6th → 429 (LAUNCH-LIMITATIONS #4)**
6. GET /my-requests lists DSRs
7. ?limit=2 respected
8. GET /my-pending-consents → array
9. POST /consent grant — DB granted=true
10. POST /consent revoke — granted=false
11. **Both grant + revoke rows coexist** (history preserved per §5(a))
12. **BUG-PHASE33-01 verified fix: bogus consent_type → 400**
    (was 500 — see "Real bugs fixed" above)
13. No auth → 401

## Phase 33d — Auth deeper (21/21 PASS)

`test-phase33d-auth-deeper.mjs` covers /auth flows beyond OTP:

1. GET /auth/me returns profile + mustRotatePassword (LL#12)
2. PATCH /auth/me firstName/lastName updates
3. **PATCH email duplicate → 409 (MED-N81)** — pre-checks LOWER(email)
   before UPDATE so caller gets a clean 409 instead of raw 23505
4. PATCH no fields → 400
5. PATCH bad email format → 400 (Zod)
6. **POST /refresh-token rotates** — new token differs from old
7. Bogus refresh → 401
8. **Already-rotated old token → 401** (MED-N92 SELECT FOR UPDATE +
   DELETE in same tx serializes concurrent refreshers)
9. POST /logout with refreshToken removes only that hash
10. Logged-out token → 401 on subsequent /refresh-token
11. **POST /logout no body → 200 + revokes ALL refresh_tokens for
    user** (logoutSchema marks refreshToken optional → "log out from
    all devices" path) — confirmed Alice had 2 rows before, 0 after

## Cumulative across Phase 17 → 33

- **55 real bugs** found + fixed (+1 from BUG-PHASE33-01)
- **2 soft bugs** documented (referrals stale response; support-ticket
  GET admin-only)
- **7 migrations** (117/118/119/120/121/122/123)
- **1475+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 4175+ total assertions** verified
- **+1 latent route wired** (PII reveal — Phase 30b)

## Test files committed in Phase 33

- `test-phase33a-account.mjs` — 23 assertions
- `test-phase33b-cancellation-policy.mjs` — 27 assertions
- `test-phase33c-compliance.mjs` — 20 assertions
- `test-phase33d-auth-deeper.mjs` — 21 assertions

## Files changed in Phase 33

- `packages/api/src/services/compliance.service.ts` — BUG-PHASE33-01:
  added `VALID_CONSENT_TYPES` Set, check before INSERT (returns 400
  instead of letting DB CHECK throw 500)

## Operational items surfaced for Ken/ops

- **Consent endpoint now returns clean 400 for bogus types**: Mobile
  app + admin "Submit Consent" forms get a clear validation error
  instead of "An unexpected error occurred". When new consent surfaces
  are added (e.g., new privacy product, biometric for KYC), update both
  migration 080's CHECK and `VALID_CONSENT_TYPES` together.
- **Account deletion 30d cooling-off works correctly**: User can
  request deletion, sees `cooling_off` status, can cancel within 30d.
  After 30d the cron flips to `processing`. Test 11 proves the race
  guard (MED-N54): can't cancel after `cooling_off_ends_at` is past.
- **DSR 24h cap (LAUNCH-LIMITATIONS #4) verified**: 5 DSRs per user
  per rolling 24h. 6th → 429 with friendly message pointing to DPO
  email. WAF still has its own rate limit on top.
- **Cancellation policy admin guard rails verified**: Tier validator
  catches refund+fee ≠ 100, missing top/bottom sentinels, contiguity
  gaps. Edit-window enforces the 1h in-place rule. Non-super-admins
  blocked.
- **Refresh-token rotation provably one-shot**: MED-N92 fix means a
  stolen refresh token can be used at most once. After rotation, the
  old token returns 401. Concurrent attackers race against the legit
  client; whichever loses gets locked out and the legit client retries
  with the new token.
- **Logout-all-sessions exists**: POST /auth/logout with no body
  deletes every refresh_tokens row for the user. Alice → 2 rows → 0.
  This is intentional ("log out from all devices") and worth surfacing
  in the customer + provider mobile UI as a security-screen action.
- **MED-N81 email-uniqueness pre-check verified**: PATCH /auth/me with
  another user's email returns a clean 409 instead of leaking a 23505
  raw SQL error or (worse) silently allowing a duplicate that breaks
  admin-login lookup.

## Continuation checklist

Stack still up. Reusable test files added:
- test-phase33a-account.mjs
- test-phase33b-cancellation-policy.mjs
- test-phase33c-compliance.mjs
- test-phase33d-auth-deeper.mjs

Phase 34+ candidates (deferred):
- **Routes still on the list:**
  - test-fixtures.routes.ts (dev-only — likely off in prod)
  - admin.routes.ts (massive — partial coverage in earlier phases)
  - financial-admin.routes.ts (Phase 21 partial — money flow)
  - dispatch / matching deeper (covered piecewise; full ranking algo not asserted)
  - service-area.routes.ts (provider service-area edits)
  - payout.routes.ts (provider withdraw flow — covered partially in 21)
- **Soft bugs still open from prior phases:**
  - Re-SELECT in `redeemReferralCode` so the API response matches DB state
  - Widen GET /support-tickets/:id to allow ticket owner
  - Customer-owner can toggle checklist items (product decision)
- **Real product work (deferred per CLAUDE.md hard-stops):**
  - 45s round-robin offer cycle
  - Quiet hours feature
  - BIR/VAT report PDF generation runtime
- **Outside autonomous scope:**
  - F#3 Maestro baselines, F#10 attorney wording, 12 D14 ops items
- **Performance / load testing** still deferred
